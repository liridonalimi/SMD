using ClosedXML.Excel;
using CsvHelper;
using CsvHelper.Configuration;
using ExcelDataReader;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using System.Globalization;
using System.Text;

namespace SMD.API.Controllers;

[Authorize(Policy = "CanEditMasterData")]
[ApiController]
[Route("api/import")]
public class ImportController : ControllerBase
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;

    public ImportController(SmdDbContext db, AuditLogService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpPost("products")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> ImportProducts([FromForm] IFormFile file, [FromQuery] bool updateExisting = false)
    {
        var rows = await ReadRowsAsync(file);
        if (rows.Result is not null) return rows.Result;

        var result = new ImportResultDto { TotalRows = rows.Items.Count };
        var existingBySku = await _db.Products.ToDictionaryAsync(x => x.Sku, StringComparer.OrdinalIgnoreCase);
        var existingBarcodes = await _db.Products
            .Where(x => x.Barcode != null)
            .Select(x => new { x.Id, x.Barcode })
            .ToListAsync();
        var barcodeOwner = existingBarcodes
            .Where(x => !string.IsNullOrWhiteSpace(x.Barcode))
            .ToDictionary(x => x.Barcode!, x => x.Id, StringComparer.OrdinalIgnoreCase);

        var seenSkus = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenBarcodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows.Items)
        {
            var sku = Get(row.Values, "sku", "kodi", "code");
            var name = Get(row.Values, "name", "emri", "produkt", "product");
            if (string.IsNullOrWhiteSpace(sku) || string.IsNullOrWhiteSpace(name))
            {
                AddError(result, row.RowNumber, "SKU/Kodi dhe emri jane te detyrueshem.");
                continue;
            }

            sku = sku.Trim();
            if (!seenSkus.Add(sku))
            {
                AddError(result, row.RowNumber, $"SKU '{sku}' perseritet brenda file-it.");
                continue;
            }

            var barcodeRaw = Normalize(Get(row.Values, "barcode", "barkod", "barkodi"));
            var barcode = NormalizeBarcode(barcodeRaw);
            if (barcode is not null)
            {
                if (!IsValidEan13(barcode))
                {
                    AddError(result, row.RowNumber, $"Barcode '{barcodeRaw}' nuk eshte EAN-13 valid. Ruaje kolonen barcode si Text ne Excel, jo si numer/scientific notation.");
                    continue;
                }

                if (!seenBarcodes.Add(barcode))
                {
                    AddError(result, row.RowNumber, $"Barcode '{barcode}' perseritet brenda file-it.");
                    continue;
                }

                if (barcodeOwner.TryGetValue(barcode, out var ownerId) &&
                    (!existingBySku.TryGetValue(sku, out var existingForBarcode) || existingForBarcode.Id != ownerId))
                {
                    AddError(result, row.RowNumber, $"Barcode '{barcode}' ekziston te produkt tjeter.");
                    continue;
                }
            }

            if (!TryDecimal(row.Values, result, row.RowNumber, out var minStock, 5m, "minStockLevel", "minStock", "minimumStock", "pragMinimal", "stokuMinimal")) continue;
            if (!TryDecimal(row.Values, result, row.RowNumber, out var purchasePrice, 0m, "purchasePrice", "cmimiBlerjes", "blerje", "kosto")) continue;
            if (!TryDecimal(row.Values, result, row.RowNumber, out var retailPrice, 0m, "retailPrice", "cmimiPakices", "pakice")) continue;
            if (!TryDecimal(row.Values, result, row.RowNumber, out var wholesalePrice, 0m, "wholesalePrice", "cmimiShumices", "shumice")) continue;
            if (!TryDecimal(row.Values, result, row.RowNumber, out var vipPrice, 0m, "vipPrice", "cmimiVip", "vip")) continue;

            if (minStock < 0 || purchasePrice < 0 || retailPrice < 0 || wholesalePrice < 0 || vipPrice < 0)
            {
                AddError(result, row.RowNumber, "Stoku minimal dhe cmimet nuk mund te jene negative.");
                continue;
            }

            var unit = Normalize(Get(row.Values, "unitOfMeasure", "unit", "njesia")) ?? "pcs";
            var description = Normalize(Get(row.Values, "description", "pershkrim", "pershkrimi", "note", "shenim"));
            var isActive = ParseBool(Get(row.Values, "isActive", "active", "aktiv"), true);

            if (existingBySku.TryGetValue(sku, out var product))
            {
                if (!updateExisting)
                {
                    result.Skipped++;
                    result.Messages.Add(new ImportRowMessageDto(row.RowNumber, "Skipped", $"Produkti '{sku}' ekziston."));
                    continue;
                }

                product.Name = name.Trim();
                product.Barcode = barcode;
                product.Description = description;
                product.UnitOfMeasure = unit;
                product.MinStockLevel = decimal.Truncate(minStock);
                product.PurchasePrice = purchasePrice;
                product.RetailPrice = retailPrice;
                product.WholesalePrice = wholesalePrice;
                product.VipPrice = vipPrice;
                product.IsActive = isActive;
                product.UpdatedAt = DateTime.UtcNow;
                result.Updated++;
                continue;
            }

            var entity = new Product
            {
                Sku = sku,
                Name = name.Trim(),
                Barcode = barcode,
                Description = description,
                UnitOfMeasure = unit,
                MinStockLevel = decimal.Truncate(minStock),
                PurchasePrice = purchasePrice,
                RetailPrice = retailPrice,
                WholesalePrice = wholesalePrice,
                VipPrice = vipPrice,
                IsActive = isActive
            };

            _db.Products.Add(entity);
            existingBySku[sku] = entity;
            if (barcode is not null) barcodeOwner[barcode] = entity.Id;
            result.Created++;
        }

        await _db.SaveChangesAsync();
        await _audit.WriteAsync("IMPORT_PRODUCTS", "Product", "-", $"Rows={result.TotalRows}, Created={result.Created}, Updated={result.Updated}, Skipped={result.Skipped}, Errors={result.Errors.Count}");
        return Ok(result);
    }

    [HttpPost("customers")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public Task<IActionResult> ImportCustomers([FromForm] IFormFile file, [FromQuery] bool updateExisting = false) =>
        ImportPartnersAsync(file, updateExisting, true);

    [HttpPost("suppliers")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public Task<IActionResult> ImportSuppliers([FromForm] IFormFile file, [FromQuery] bool updateExisting = false) =>
        ImportPartnersAsync(file, updateExisting, false);

    private async Task<IActionResult> ImportPartnersAsync(IFormFile file, bool updateExisting, bool customers)
    {
        var rows = await ReadRowsAsync(file);
        if (rows.Result is not null) return rows.Result;

        var result = new ImportResultDto { TotalRows = rows.Items.Count };
        var existingCustomers = customers
            ? await _db.Customers.ToDictionaryAsync(x => x.Code, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, Customer>(StringComparer.OrdinalIgnoreCase);
        var existingSuppliers = customers
            ? new Dictionary<string, Supplier>(StringComparer.OrdinalIgnoreCase)
            : await _db.Suppliers.ToDictionaryAsync(x => x.Code, StringComparer.OrdinalIgnoreCase);
        var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows.Items)
        {
            var code = Get(row.Values, "code", "kodi");
            var name = Get(row.Values, "name", "emri");
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name))
            {
                AddError(result, row.RowNumber, "Kodi dhe emri jane te detyrueshem.");
                continue;
            }

            code = code.Trim();
            if (!seenCodes.Add(code))
            {
                AddError(result, row.RowNumber, $"Kodi '{code}' perseritet brenda file-it.");
                continue;
            }

            var email = Normalize(Get(row.Values, "email", "eMail", "posta"));
            if (email is not null && !seenEmails.Add(email))
            {
                AddError(result, row.RowNumber, $"Email '{email}' perseritet brenda file-it.");
                continue;
            }

            var contact = Normalize(Get(row.Values, "contactPerson", "personKontakt", "kontakt", "personiKontaktues"));
            var phone = Normalize(Get(row.Values, "phone", "tel", "telefoni"));
            var address = Normalize(Get(row.Values, "address", "adresa"));
            var note = Normalize(Get(row.Values, "note", "shenim", "pershkrim"));
            var isActive = ParseBool(Get(row.Values, "isActive", "active", "aktiv"), true);

            if (customers)
            {
                if (email is not null && await _db.Customers.AnyAsync(x => x.Email == email && x.Code != code))
                {
                    AddError(result, row.RowNumber, $"Email '{email}' ekziston te klient tjeter.");
                    continue;
                }

                if (existingCustomers.TryGetValue(code, out var existing))
                {
                    if (!updateExisting)
                    {
                        result.Skipped++;
                        result.Messages.Add(new ImportRowMessageDto(row.RowNumber, "Skipped", $"Klienti '{code}' ekziston."));
                        continue;
                    }

                    ApplyPartner(existing, name, contact, phone, email, address, note, isActive);
                    result.Updated++;
                    continue;
                }

                var entity = new Customer { Code = code };
                ApplyPartner(entity, name, contact, phone, email, address, note, isActive);
                _db.Customers.Add(entity);
                existingCustomers[code] = entity;
                result.Created++;
            }
            else
            {
                if (email is not null && await _db.Suppliers.AnyAsync(x => x.Email == email && x.Code != code))
                {
                    AddError(result, row.RowNumber, $"Email '{email}' ekziston te furnizues tjeter.");
                    continue;
                }

                if (existingSuppliers.TryGetValue(code, out var existing))
                {
                    if (!updateExisting)
                    {
                        result.Skipped++;
                        result.Messages.Add(new ImportRowMessageDto(row.RowNumber, "Skipped", $"Furnizuesi '{code}' ekziston."));
                        continue;
                    }

                    ApplyPartner(existing, name, contact, phone, email, address, note, isActive);
                    result.Updated++;
                    continue;
                }

                var entity = new Supplier { Code = code };
                ApplyPartner(entity, name, contact, phone, email, address, note, isActive);
                _db.Suppliers.Add(entity);
                existingSuppliers[code] = entity;
                result.Created++;
            }
        }

        await _db.SaveChangesAsync();
        await _audit.WriteAsync(customers ? "IMPORT_CUSTOMERS" : "IMPORT_SUPPLIERS", customers ? "Customer" : "Supplier", "-", $"Rows={result.TotalRows}, Created={result.Created}, Updated={result.Updated}, Skipped={result.Skipped}, Errors={result.Errors.Count}");
        return Ok(result);
    }

    private static void ApplyPartner(Customer entity, string name, string? contact, string? phone, string? email, string? address, string? note, bool isActive)
    {
        entity.Name = name.Trim();
        entity.ContactPerson = contact;
        entity.Phone = phone;
        entity.Email = email;
        entity.Address = address;
        entity.Note = note;
        entity.IsActive = isActive;
        entity.UpdatedAt = DateTime.UtcNow;
    }

    private static void ApplyPartner(Supplier entity, string name, string? contact, string? phone, string? email, string? address, string? note, bool isActive)
    {
        entity.Name = name.Trim();
        entity.ContactPerson = contact;
        entity.Phone = phone;
        entity.Email = email;
        entity.Address = address;
        entity.Note = note;
        entity.IsActive = isActive;
        entity.UpdatedAt = DateTime.UtcNow;
    }

    private static async Task<(List<ImportRow> Items, IActionResult? Result)> ReadRowsAsync(IFormFile file)
    {
        if (file is null || file.Length == 0)
        {
            return ([], new BadRequestObjectResult("Zgjidh nje file XLSX ose CSV per import."));
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension is not ".xlsx" and not ".xls" and not ".csv")
        {
            return ([], new BadRequestObjectResult("Lejohen vetem file .xlsx, .xls ose .csv."));
        }

        await using var stream = file.OpenReadStream();
        return extension switch
        {
            ".xlsx" => (ReadXlsxRows(stream), null),
            ".xls" => (ReadXlsRows(stream), null),
            _ => (await ReadCsvRowsAsync(stream), null)
        };
    }

    private static List<ImportRow> ReadXlsxRows(Stream stream)
    {
        using var workbook = new XLWorkbook(stream);
        var sheet = workbook.Worksheets.First();
        var used = sheet.RangeUsed();
        if (used is null) return [];

        var headerRow = used.FirstRowUsed();
        var headers = headerRow.Cells().Select(x => NormalizeHeader(x.GetString())).ToList();
        var rows = new List<ImportRow>();

        foreach (var row in used.RowsUsed().Skip(1))
        {
            var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            var hasAnyValue = false;
            for (var i = 0; i < headers.Count; i++)
            {
                if (string.IsNullOrWhiteSpace(headers[i])) continue;
                var value = row.Cell(i + 1).GetFormattedString();
                if (!string.IsNullOrWhiteSpace(value)) hasAnyValue = true;
                values[headers[i]] = value;
            }

            if (hasAnyValue) rows.Add(new ImportRow(row.RowNumber(), values));
        }

        return rows;
    }

    private static List<ImportRow> ReadXlsRows(Stream stream)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        using var reader = ExcelReaderFactory.CreateBinaryReader(stream);
        var rows = new List<ImportRow>();
        var headers = new List<string>();
        var rowNumber = 0;

        while (reader.Read())
        {
            rowNumber++;
            if (rowNumber == 1)
            {
                for (var i = 0; i < reader.FieldCount; i++)
                {
                    headers.Add(NormalizeHeader(CellToString(reader.GetValue(i))));
                }

                continue;
            }

            var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            var hasAnyValue = false;
            for (var i = 0; i < headers.Count && i < reader.FieldCount; i++)
            {
                if (string.IsNullOrWhiteSpace(headers[i])) continue;
                var value = CellToString(reader.GetValue(i));
                if (!string.IsNullOrWhiteSpace(value)) hasAnyValue = true;
                values[headers[i]] = value;
            }

            if (hasAnyValue) rows.Add(new ImportRow(rowNumber, values));
        }

        return rows;
    }

    private static async Task<List<ImportRow>> ReadCsvRowsAsync(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        var content = await reader.ReadToEndAsync();
        var firstLine = content.Split(["\r\n", "\n"], StringSplitOptions.None).FirstOrDefault() ?? "";
        var delimiter = firstLine.Count(x => x == ';') > firstLine.Count(x => x == ',') ? ";" : ",";

        using var csvReader = new StringReader(content);
        using var csv = new CsvReader(csvReader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            Delimiter = delimiter,
            BadDataFound = null,
            MissingFieldFound = null,
            HeaderValidated = null,
            TrimOptions = TrimOptions.Trim
        });

        var rows = new List<ImportRow>();
        if (!await csv.ReadAsync() || !csv.ReadHeader()) return rows;

        var headers = csv.HeaderRecord?.Select(NormalizeHeader).ToList() ?? [];
        while (await csv.ReadAsync())
        {
            var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            var hasAnyValue = false;
            for (var i = 0; i < headers.Count; i++)
            {
                if (string.IsNullOrWhiteSpace(headers[i])) continue;
                var value = csv.GetField(i);
                if (!string.IsNullOrWhiteSpace(value)) hasAnyValue = true;
                values[headers[i]] = value;
            }

            var rowNumber = csv.Context.Parser?.Row ?? rows.Count + 2;
            if (hasAnyValue) rows.Add(new ImportRow(rowNumber, values));
        }

        return rows;
    }

    private static string? Get(IReadOnlyDictionary<string, string?> row, params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            if (row.TryGetValue(NormalizeHeader(alias), out var value)) return value;
        }

        return null;
    }

    private static bool TryDecimal(IReadOnlyDictionary<string, string?> row, ImportResultDto result, int rowNumber, out decimal value, decimal fallback, params string[] aliases)
    {
        value = fallback;
        var raw = Get(row, aliases);
        if (string.IsNullOrWhiteSpace(raw)) return true;

        var normalized = raw.Trim().Replace("€", "").Replace(" ", "");
        if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out value)) return true;
        if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.GetCultureInfo("sq-AL"), out value)) return true;
        if (decimal.TryParse(normalized.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out value)) return true;

        AddError(result, rowNumber, $"Vlera '{raw}' nuk eshte numer i vlefshem.");
        return false;
    }

    private static bool ParseBool(string? raw, bool fallback)
    {
        if (string.IsNullOrWhiteSpace(raw)) return fallback;
        var value = NormalizeHeader(raw);
        return value is "1" or "true" or "yes" or "po" or "aktiv" or "active";
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? CellToString(object? value)
    {
        return value switch
        {
            null => null,
            double d when Math.Abs(d % 1) < double.Epsilon => d.ToString("0", CultureInfo.InvariantCulture),
            double d => d.ToString(CultureInfo.InvariantCulture),
            float f when Math.Abs(f % 1) < float.Epsilon => f.ToString("0", CultureInfo.InvariantCulture),
            float f => f.ToString(CultureInfo.InvariantCulture),
            decimal m when m == decimal.Truncate(m) => m.ToString("0", CultureInfo.InvariantCulture),
            decimal m => m.ToString(CultureInfo.InvariantCulture),
            DateTime dt => dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            _ => Convert.ToString(value, CultureInfo.InvariantCulture)
        };
    }

    private static string? NormalizeBarcode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (trimmed.Contains('e', StringComparison.OrdinalIgnoreCase) || trimmed.Contains('+'))
        {
            return trimmed;
        }

        var compact = new string(trimmed.Where(char.IsDigit).ToArray());
        return string.IsNullOrWhiteSpace(compact) ? trimmed : compact;
    }

    private static bool IsValidEan13(string value)
    {
        if (value.Length != 13 || !value.All(char.IsDigit)) return false;
        return value[12] - '0' == CalculateEan13CheckDigit(value[..12]);
    }

    private static int CalculateEan13CheckDigit(string firstTwelveDigits)
    {
        var sum = 0;
        for (var i = 0; i < firstTwelveDigits.Length; i++)
        {
            var digit = firstTwelveDigits[i] - '0';
            sum += i % 2 == 0 ? digit : digit * 3;
        }

        return (10 - (sum % 10)) % 10;
    }

    private static string NormalizeHeader(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var normalized = value.Trim().ToLowerInvariant();
        var builder = new StringBuilder(normalized.Length);
        foreach (var ch in normalized.Normalize(NormalizationForm.FormD))
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(ch)) builder.Append(ch);
        }

        return builder.ToString();
    }

    private static void AddError(ImportResultDto result, int rowNumber, string message)
    {
        result.Errors.Add(new ImportRowMessageDto(rowNumber, "Error", message));
    }

    private sealed record ImportRow(int RowNumber, Dictionary<string, string?> Values);
}

public class ImportResultDto
{
    public int TotalRows { get; set; }
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }
    public List<ImportRowMessageDto> Errors { get; set; } = [];
    public List<ImportRowMessageDto> Messages { get; set; } = [];
}

public record ImportRowMessageDto(int RowNumber, string Type, string Message);
