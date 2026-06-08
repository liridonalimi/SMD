using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using System.Globalization;
using System.Text;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/partner-finance")]
public class PartnerFinanceController : ControllerBase
{
    private readonly SmdDbContext _db;

    public PartnerFinanceController(SmdDbContext db) => _db = db;

    [HttpGet("balances")]
    public async Task<IActionResult> GetBalances([FromQuery] string? q, [FromQuery] bool includeInactive = false)
    {
        var customerDocs = await _db.OutboundDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.CustomerId != null)
            .SelectMany(x => x.Lines.Select(line => new
            {
                PartnerId = x.CustomerId!.Value,
                Amount = line.Quantity * (
                    line.PriceTier == OutboundPriceTier.Retail
                        ? line.Product.RetailPrice
                        : line.PriceTier == OutboundPriceTier.Wholesale
                            ? line.Product.WholesalePrice
                            : line.Product.VipPrice)
            }))
            .ToListAsync();

        var supplierDocs = await _db.InboundDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.SupplierId != null)
            .SelectMany(x => x.Lines.Select(line => new
            {
                PartnerId = x.SupplierId!.Value,
                Amount = line.Quantity * line.Product.PurchasePrice
            }))
            .ToListAsync();

        var customerReturns = await _db.ReturnDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.Type == ReturnDocumentType.CustomerReturn && x.CustomerId != null)
            .SelectMany(x => x.Lines.Select(line => new
            {
                PartnerId = x.CustomerId!.Value,
                Amount = line.Quantity * (
                    line.PriceTier == OutboundPriceTier.Retail
                        ? line.Product.RetailPrice
                        : line.PriceTier == OutboundPriceTier.Wholesale
                            ? line.Product.WholesalePrice
                            : line.Product.VipPrice)
            }))
            .ToListAsync();

        var supplierReturns = await _db.ReturnDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.Type == ReturnDocumentType.SupplierReturn && x.SupplierId != null)
            .SelectMany(x => x.Lines.Select(line => new
            {
                PartnerId = x.SupplierId!.Value,
                Amount = line.Quantity * line.Product.PurchasePrice
            }))
            .ToListAsync();

        var customerPayments = await _db.PartnerPayments
            .AsNoTracking()
            .Where(x => x.CustomerId != null)
            .GroupBy(x => x.CustomerId!.Value)
            .Select(g => new
            {
                PartnerId = g.Key,
                PaidTotal = g.Sum(x => x.Amount),
                LastPaymentDate = g.Max(x => x.PaymentDate)
            })
            .ToListAsync();

        var supplierPayments = await _db.PartnerPayments
            .AsNoTracking()
            .Where(x => x.SupplierId != null)
            .GroupBy(x => x.SupplierId!.Value)
            .Select(g => new
            {
                PartnerId = g.Key,
                PaidTotal = g.Sum(x => x.Amount),
                LastPaymentDate = g.Max(x => x.PaymentDate)
            })
            .ToListAsync();

        var customerDocTotals = customerDocs
            .GroupBy(x => x.PartnerId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));

        var supplierDocTotals = supplierDocs
            .GroupBy(x => x.PartnerId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));

        foreach (var returnGroup in customerReturns.GroupBy(x => x.PartnerId))
        {
            customerDocTotals.TryGetValue(returnGroup.Key, out var current);
            customerDocTotals[returnGroup.Key] = current - returnGroup.Sum(x => x.Amount);
        }

        foreach (var returnGroup in supplierReturns.GroupBy(x => x.PartnerId))
        {
            supplierDocTotals.TryGetValue(returnGroup.Key, out var current);
            supplierDocTotals[returnGroup.Key] = current - returnGroup.Sum(x => x.Amount);
        }

        var customerPaymentTotals = customerPayments.ToDictionary(
            x => x.PartnerId,
            x => new PaymentAggregate(x.PaidTotal, x.LastPaymentDate));

        var supplierPaymentTotals = supplierPayments.ToDictionary(
            x => x.PartnerId,
            x => new PaymentAggregate(x.PaidTotal, x.LastPaymentDate));

        var customers = await _db.Customers
            .AsNoTracking()
            .Select(x => new PartnerInfoRow(x.Id, x.Code, x.Name, x.IsActive))
            .ToListAsync();

        var suppliers = await _db.Suppliers
            .AsNoTracking()
            .Select(x => new PartnerInfoRow(x.Id, x.Code, x.Name, x.IsActive))
            .ToListAsync();

        var term = q?.Trim();
        var customerItems = customers
            .Where(x => includeInactive || x.IsActive || customerDocTotals.ContainsKey(x.Id) || customerPaymentTotals.ContainsKey(x.Id))
            .Select(x =>
            {
                customerDocTotals.TryGetValue(x.Id, out var documentTotal);
                customerPaymentTotals.TryGetValue(x.Id, out var payment);
                return new PartnerBalanceItemResponse(
                    x.Id,
                    x.Code,
                    x.Name,
                    x.IsActive,
                    documentTotal,
                    payment?.PaidTotal ?? 0m,
                    documentTotal - (payment?.PaidTotal ?? 0m),
                    payment?.LastPaymentDate);
            })
            .Where(x => string.IsNullOrWhiteSpace(term) ||
                        x.Code.Contains(term!, StringComparison.OrdinalIgnoreCase) ||
                        x.Name.Contains(term!, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.Balance)
            .ThenBy(x => x.Code)
            .ToList();

        var supplierItems = suppliers
            .Where(x => includeInactive || x.IsActive || supplierDocTotals.ContainsKey(x.Id) || supplierPaymentTotals.ContainsKey(x.Id))
            .Select(x =>
            {
                supplierDocTotals.TryGetValue(x.Id, out var documentTotal);
                supplierPaymentTotals.TryGetValue(x.Id, out var payment);
                return new PartnerBalanceItemResponse(
                    x.Id,
                    x.Code,
                    x.Name,
                    x.IsActive,
                    documentTotal,
                    payment?.PaidTotal ?? 0m,
                    documentTotal - (payment?.PaidTotal ?? 0m),
                    payment?.LastPaymentDate);
            })
            .Where(x => string.IsNullOrWhiteSpace(term) ||
                        x.Code.Contains(term!, StringComparison.OrdinalIgnoreCase) ||
                        x.Name.Contains(term!, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.Balance)
            .ThenBy(x => x.Code)
            .ToList();

        return Ok(new PartnerFinanceBalancesResponse(
            customerItems,
            supplierItems,
            new PartnerFinanceSummaryResponse(
                customerItems.Sum(x => x.DocumentTotal),
                customerItems.Sum(x => x.PaidTotal),
                customerItems.Sum(x => x.Balance),
                supplierItems.Sum(x => x.DocumentTotal),
                supplierItems.Sum(x => x.PaidTotal),
                supplierItems.Sum(x => x.Balance))));
    }

    [HttpGet("payments")]
    public async Task<IActionResult> GetPayments([FromQuery] string? q)
    {
        var payments = await _db.PartnerPayments
            .AsNoTracking()
            .Select(x => new PartnerPaymentListItemResponse(
                x.Id,
                x.CustomerId,
                x.SupplierId,
                x.InboundDocumentId,
                x.OutboundDocumentId,
                x.CustomerId != null ? "customer" : "supplier",
                x.CustomerId != null ? x.Customer!.Code : x.Supplier!.Code,
                x.CustomerId != null ? x.Customer!.Name : x.Supplier!.Name,
                x.Amount,
                x.PaymentDate,
                x.InboundDocumentId != null ? x.InboundDocument!.DocumentNo : x.OutboundDocumentId != null ? x.OutboundDocument!.DocumentNo : null,
                x.Reference,
                x.Note))
            .ToListAsync();

        var term = q?.Trim();
        var filtered = payments
            .Where(x => string.IsNullOrWhiteSpace(term) ||
                        x.PartnerCode.Contains(term!, StringComparison.OrdinalIgnoreCase) ||
                        x.PartnerName.Contains(term!, StringComparison.OrdinalIgnoreCase) ||
                        (!string.IsNullOrWhiteSpace(x.Reference) && x.Reference.Contains(term!, StringComparison.OrdinalIgnoreCase)) ||
                        (!string.IsNullOrWhiteSpace(x.Note) && x.Note.Contains(term!, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(x => x.PaymentDate)
            .ThenByDescending(x => x.Id)
            .Take(100)
            .ToList();

        return Ok(filtered);
    }

    [HttpGet("unpaid-documents")]
    public async Task<IActionResult> GetUnpaidDocuments([FromQuery] string? q, [FromQuery] string? partnerType)
    {
        var items = await BuildUnpaidDocumentsReportAsync(q, partnerType);
        return Ok(items);
    }

    [HttpGet("unpaid-documents/export")]
    public async Task<IActionResult> ExportUnpaidDocuments([FromQuery] string? q, [FromQuery] string? partnerType)
    {
        var items = await BuildUnpaidDocumentsReportAsync(q, partnerType);
        var csv = new StringBuilder();
        csv.AppendLine("Lloji, Numri dokumentit, Partneri, Data, Totali, i Paguar, Mbetja, Statusi pageses");

        foreach (var item in items)
        {
            csv.AppendLine(string.Join(",", new[]
            {
                Csv(item.DocumentType == "inbound" ? "Inbound" : "Outbound"),
                Csv(item.DocumentNo),
                Csv($"{item.PartnerCode} - {item.PartnerName}"),
                Csv(item.CreatedAt.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture)),
                Csv(item.DocumentTotal.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(item.PaidTotal.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(item.Balance.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(item.PaymentStatus)
            }));
        }

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
        var fileName = $"dokumente-te-papaguara-{DateTime.Now:yyyyMMdd-HHmm}.csv";
        return File(bytes, "text/csv; charset=utf-8", fileName);
    }

    [HttpGet("unpaid-documents/export-excel")]
    public async Task<IActionResult> ExportUnpaidDocumentsExcel([FromQuery] string? q, [FromQuery] string? partnerType)
    {
        var items = await BuildUnpaidDocumentsReportAsync(q, partnerType);

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Dokumente te papaguara");
        BuildUnpaidDocumentsWorksheet(sheet, items, partnerType);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        var fileName = $"dokumente-te-papaguara-{DateTime.Now:yyyyMMdd-HHmm}.xlsx";
        return File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    [HttpGet("unpaid-documents/export-pdf")]
    public async Task<IActionResult> ExportUnpaidDocumentsPdf([FromQuery] string? q, [FromQuery] string? partnerType)
    {
        var items = await BuildUnpaidDocumentsReportAsync(q, partnerType);
        var bytes = BuildUnpaidDocumentsPdf(items, partnerType);
        var fileName = $"dokumente-te-papaguara-{DateTime.Now:yyyyMMdd-HHmm}.pdf";

        return File(bytes, "application/pdf", fileName);
    }

    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments([FromQuery] string partnerType, [FromQuery] Guid partnerId)
    {
        if (partnerId == Guid.Empty)
            return BadRequest("Partneri duhet te jete valid.");

        if (string.Equals(partnerType, "customer", StringComparison.OrdinalIgnoreCase))
        {
            var items = await _db.OutboundDocuments
                .AsNoTracking()
                .Where(x => x.Status == DocumentStatus.Confirmed && x.CustomerId == partnerId)
                .Select(x => new PartnerDocumentOptionResponse(
                    x.Id,
                    "outbound",
                    x.DocumentNo,
                    x.CreatedAt,
                    x.Lines.Sum(line => line.Quantity * (
                        line.PriceTier == OutboundPriceTier.Retail
                            ? line.Product.RetailPrice
                            : line.PriceTier == OutboundPriceTier.Wholesale
                                ? line.Product.WholesalePrice
                                : line.Product.VipPrice)),
                    _db.PartnerPayments
                        .Where(p => p.OutboundDocumentId == x.Id)
                        .Select(p => (decimal?)p.Amount)
                        .Sum() ?? 0m))
                .ToListAsync();

            return Ok(items.Select(x => x with
            {
                Balance = x.DocumentTotal - x.PaidTotal,
                PaymentStatus = ToPaymentStatus(x.DocumentTotal, x.PaidTotal)
            }).ToList());
        }

        if (string.Equals(partnerType, "supplier", StringComparison.OrdinalIgnoreCase))
        {
            var items = await _db.InboundDocuments
                .AsNoTracking()
                .Where(x => x.Status == DocumentStatus.Confirmed && x.SupplierId == partnerId)
                .Select(x => new PartnerDocumentOptionResponse(
                    x.Id,
                    "inbound",
                    x.DocumentNo,
                    x.CreatedAt,
                    x.Lines.Sum(line => line.Quantity * (line.PurchasePrice > 0m ? line.PurchasePrice : line.Product.PurchasePrice)),
                    _db.PartnerPayments
                        .Where(p => p.InboundDocumentId == x.Id)
                        .Select(p => (decimal?)p.Amount)
                        .Sum() ?? 0m))
                .ToListAsync();

            return Ok(items.Select(x => x with
            {
                Balance = x.DocumentTotal - x.PaidTotal,
                PaymentStatus = ToPaymentStatus(x.DocumentTotal, x.PaidTotal)
            }).ToList());
        }

        return BadRequest("Lloji i partnerit duhet te jete klient ose furnizues.");
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("payments")]
    public async Task<IActionResult> CreatePayment([FromBody] CreatePartnerPaymentRequest req)
    {
        var hasCustomer = req.CustomerId.HasValue;
        var hasSupplier = req.SupplierId.HasValue;

        if (hasCustomer == hasSupplier)
            return BadRequest("Pagesa duhet te lidhet ose me klient ose me furnizues.");

        var hasInboundDocument = req.InboundDocumentId.HasValue;
        var hasOutboundDocument = req.OutboundDocumentId.HasValue;
        if (hasInboundDocument && hasOutboundDocument)
            return BadRequest("Pagesa mund te lidhet vetem me nje dokument.");

        if (req.Amount <= 0)
            return BadRequest("Shuma e pageses duhet te jete me e madhe se zero.");

        if (hasCustomer)
        {
            var exists = await _db.Customers.AnyAsync(x => x.Id == req.CustomerId!.Value);
            if (!exists) return NotFound("Klienti nuk u gjet.");
        }

        if (hasSupplier)
        {
            var exists = await _db.Suppliers.AnyAsync(x => x.Id == req.SupplierId!.Value);
            if (!exists) return NotFound("Furnizuesi nuk u gjet.");
        }

        if (hasCustomer && hasInboundDocument)
            return BadRequest("Pagesa e klientit nuk mund te lidhet me dokument hyrës.");

        if (hasSupplier && hasOutboundDocument)
            return BadRequest("Pagesa e furnizuesit nuk mund te lidhet me dokument dalës.");

        if (hasOutboundDocument)
        {
            var outboundDoc = await _db.OutboundDocuments
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == req.OutboundDocumentId!.Value);

            if (outboundDoc is null)
                return NotFound("Dokumenti dales nuk u gjet.");

            if (outboundDoc.Status != DocumentStatus.Confirmed)
                return BadRequest("Pagesa mund te lidhet vetem me dokument dales/outbound te konfirmuar.");

            if (!hasCustomer || outboundDoc.CustomerId != req.CustomerId)
                return BadRequest("Dokumenti dales/outbound nuk i perket klientit te zgjedhur.");
        }

        if (hasInboundDocument)
        {
            var inboundDoc = await _db.InboundDocuments
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == req.InboundDocumentId!.Value);

            if (inboundDoc is null)
                return NotFound("Dokumenti hyres nuk u gjet.");

            if (inboundDoc.Status != DocumentStatus.Confirmed)
                return BadRequest("Pagesa mund te lidhet vetem me dokument hyrës/inbound te konfirmuar.");

            if (!hasSupplier || inboundDoc.SupplierId != req.SupplierId)
                return BadRequest("Dokumenti hyrës/inbound nuk i perket furnizuesit te zgjedhur.");
        }

        var paymentDate = req.PaymentDate?.ToUniversalTime() ?? DateTime.UtcNow;
        var entity = new PartnerPayment
        {
            CustomerId = req.CustomerId,
            SupplierId = req.SupplierId,
            InboundDocumentId = req.InboundDocumentId,
            OutboundDocumentId = req.OutboundDocumentId,
            Amount = decimal.Round(req.Amount, 2, MidpointRounding.AwayFromZero),
            PaymentDate = paymentDate,
            Reference = Normalize(req.Reference),
            Note = Normalize(req.Note)
        };

        _db.PartnerPayments.Add(entity);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetPayments), new { id = entity.Id }, new { entity.Id });
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string Csv(string? value)
    {
        var text = value ?? string.Empty;
        return $"\"{text.Replace("\"", "\"\"")}\"";
    }

    private static byte[] BuildUnpaidDocumentsPdf(
        IReadOnlyList<UnpaidDocumentReportItemResponse> items,
        string? partnerType)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var exportDate = DateTime.Now;
        var filterLabel = ToPartnerTypeLabel(partnerType);
        var totalDocuments = items.Sum(x => x.DocumentTotal);
        var totalPaid = items.Sum(x => x.PaidTotal);
        var totalBalance = items.Sum(x => x.Balance);
        var customerCount = items.Count(x => x.DocumentType == "outbound");
        var supplierCount = items.Count(x => x.DocumentType == "inbound");

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(28);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(header =>
                {
                    header.Item().Text("SMD").SemiBold().FontSize(11).FontColor(Colors.BlueGrey.Darken1);
                    header.Item().PaddingTop(2).Text("Raport i dokumenteve te papaguara").SemiBold().FontSize(22);
                    header.Item().PaddingTop(3).Text($"Dokumente te konfirmuara me balance te hapur • Eksportuar: {exportDate:dd.MM.yyyy HH:mm}")
                        .FontSize(10)
                        .FontColor(Colors.Grey.Darken2);
                });

                page.Content().PaddingTop(18).Column(content =>
                {
                    content.Spacing(14);

                    content.Item().Row(row =>
                    {
                        row.RelativeItem().Element(c => SummaryCard(c, "Nr. dokumenteve", items.Count.ToString(CultureInfo.InvariantCulture), "Filtri: " + filterLabel));
                        row.RelativeItem().Element(c => SummaryCard(c, "Totali dokumenteve", FormatMoney(totalDocuments), $"Kliente: {customerCount}"));
                        row.RelativeItem().Element(c => SummaryCard(c, "Totali i paguar", FormatMoney(totalPaid), $"Furnizues: {supplierCount}"));
                        row.RelativeItem().Element(c => SummaryCard(c, "Mbetja totale", FormatMoney(totalBalance), "Per pagese"));
                    });

                    content.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(28);
                            columns.ConstantColumn(58);
                            columns.ConstantColumn(82);
                            columns.RelativeColumn(1.6f);
                            columns.ConstantColumn(68);
                            columns.ConstantColumn(72);
                            columns.ConstantColumn(72);
                            columns.ConstantColumn(72);
                            columns.ConstantColumn(92);
                        });

                        TableHeader(table, "#");
                        TableHeader(table, "Lloji");
                        TableHeader(table, "Numri dokumentit");
                        TableHeader(table, "Partneri");
                        TableHeader(table, "Data");
                        TableHeader(table, "Totali");
                        TableHeader(table, "Paguar");
                        TableHeader(table, "Mbetja");
                        TableHeader(table, "Statusi pageses");

                        if (items.Count == 0)
                        {
                            table.Cell().ColumnSpan(9).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(8)
                                .Text("Nuk ka dokumente me balance te hapur per kete filter.")
                                .FontColor(Colors.Grey.Darken2);
                        }

                        for (var index = 0; index < items.Count; index++)
                        {
                            var item = items[index];
                            TableCell(table, (index + 1).ToString(CultureInfo.InvariantCulture), true);
                            TableCell(table, item.DocumentType == "inbound" ? "Inbound" : "Outbound");
                            TableCell(table, item.DocumentNo);
                            TableCell(table, $"{item.PartnerCode} - {item.PartnerName}");
                            TableCell(table, item.CreatedAt.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture));
                            TableCell(table, FormatMoney(item.DocumentTotal), alignRight: true);
                            TableCell(table, FormatMoney(item.PaidTotal), alignRight: true);
                            TableCell(table, FormatMoney(item.Balance), alignRight: true, semiBold: true);
                            TableCell(table, item.PaymentStatus);
                        }
                    });

                    content.Item().Width(260).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                        });

                        table.Cell().ColumnSpan(2).Background(Colors.BlueGrey.Darken3).Padding(6)
                            .Text("Permbledhje").SemiBold().FontColor(Colors.White);
                        SummaryRow(table, "Totali i rreshtave", items.Count.ToString(CultureInfo.InvariantCulture));
                        SummaryRow(table, "Totali i dokumenteve", FormatMoney(totalDocuments));
                        SummaryRow(table, "Totali i paguar", FormatMoney(totalPaid));
                        SummaryRow(table, "Mbetja per pagesa", FormatMoney(totalBalance));
                    });
                });

                page.Footer().AlignRight().Text(text =>
                {
                    text.Span("Faqe ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });
        }).GeneratePdf();
    }

    private static void BuildUnpaidDocumentsWorksheet(
        IXLWorksheet sheet,
        IReadOnlyList<UnpaidDocumentReportItemResponse> items,
        string? partnerType)
    {
        const int tableStartRow = 10;
        var exportDate = DateTime.Now;
        var filterLabel = ToPartnerTypeLabel(partnerType);
        var customerCount = items.Count(x => x.DocumentType == "outbound");
        var supplierCount = items.Count(x => x.DocumentType == "inbound");

        sheet.Style.Font.FontName = "Aptos";
        sheet.Style.Font.FontSize = 11;

        sheet.Cell("A1").Value = "SMD";
        sheet.Cell("A1").Style.Font.Bold = true;
        sheet.Cell("A1").Style.Font.FontSize = 11;

        sheet.Cell("A2").Value = "Raport i dokumenteve te papaguara";
        sheet.Range("A2:I2").Merge();
        sheet.Cell("A2").Style.Font.Bold = true;
        sheet.Cell("A2").Style.Font.FontSize = 20;

        sheet.Cell("A3").Value = $"Dokumente te konfirmuara me balance te hapura • Eksportuar: {exportDate:dd.MM.yyyy HH:mm}";
        sheet.Range("A3:I3").Merge();
        sheet.Cell("A3").Style.Font.FontColor = XLColor.FromHtml("#475569");

        WriteInfoCell(sheet, "A5", "Nr. dokumenteve", items.Count);
        WriteInfoCell(sheet, "A6", "Filtri", filterLabel);
        WriteInfoCell(sheet, "A7", "Kliente", customerCount);
        WriteInfoCell(sheet, "A8", "Furnizues", supplierCount);

        WriteInfoCell(sheet, "F5", "Totali dokumenteve", items.Sum(x => x.DocumentTotal), true);
        WriteInfoCell(sheet, "F6", "Totali i paguar", items.Sum(x => x.PaidTotal), true);
        WriteInfoCell(sheet, "F7", "Mbetja totale", items.Sum(x => x.Balance), true);
        WriteInfoCell(sheet, "F8", "Data e eksportit", exportDate.ToString("dd.MM.yyyy HH:mm", CultureInfo.InvariantCulture));

        var metaRanges = new[] { sheet.Range("A5:B8"), sheet.Range("F5:G8") };
        foreach (var range in metaRanges)
        {
            range.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            range.Style.Border.OutsideBorderColor = XLColor.FromHtml("#94a3b8");
            range.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
            range.Style.Border.InsideBorderColor = XLColor.FromHtml("#cbd5e1");
        }

        var headers = new[]
        {
            "#",
            "Lloji",
            "Numri dokumentit",
            "Partneri",
            "Data",
            "Totali",
            "Paguar",
            "Mbetja",
            "Statusi pageses"
        };

        for (var i = 0; i < headers.Length; i++)
        {
            sheet.Cell(tableStartRow, i + 1).Value = headers[i];
        }

        var headerRange = sheet.Range(tableStartRow, 1, tableStartRow, headers.Length);
        headerRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#294653");
        headerRange.Style.Font.FontColor = XLColor.White;
        headerRange.Style.Font.Bold = true;
        headerRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        for (var index = 0; index < items.Count; index++)
        {
            var row = tableStartRow + 1 + index;
            var item = items[index];
            sheet.Cell(row, 1).Value = index + 1;
            sheet.Cell(row, 2).Value = item.DocumentType == "inbound" ? "Inbound" : "Outbound";
            sheet.Cell(row, 3).Value = item.DocumentNo;
            sheet.Cell(row, 4).Value = $"{item.PartnerCode} - {item.PartnerName}";
            sheet.Cell(row, 5).Value = item.CreatedAt;
            sheet.Cell(row, 6).Value = item.DocumentTotal;
            sheet.Cell(row, 7).Value = item.PaidTotal;
            sheet.Cell(row, 8).Value = item.Balance;
            sheet.Cell(row, 9).Value = item.PaymentStatus;
        }

        var lastTableRow = Math.Max(tableStartRow + 1, tableStartRow + items.Count);
        var tableRange = sheet.Range(tableStartRow, 1, lastTableRow, headers.Length);
        tableRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        tableRange.Style.Border.OutsideBorderColor = XLColor.FromHtml("#64748b");
        tableRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        tableRange.Style.Border.InsideBorderColor = XLColor.FromHtml("#cbd5e1");
        tableRange.SetAutoFilter();

        if (items.Count > 0)
        {
            sheet.Range(tableStartRow + 1, 5, lastTableRow, 5).Style.DateFormat.Format = "dd.mm.yyyy";
            sheet.Range(tableStartRow + 1, 6, lastTableRow, 8).Style.NumberFormat.Format = "#,##0.00 €";
            sheet.Range(tableStartRow + 1, 1, lastTableRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            sheet.Range(tableStartRow + 1, 6, lastTableRow, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        }

        var summaryStartRow = lastTableRow + 3;
        sheet.Cell(summaryStartRow, 1).Value = "Permbledhje";
        sheet.Range(summaryStartRow, 1, summaryStartRow, 2).Merge();
        sheet.Cell(summaryStartRow, 1).Style.Font.Bold = true;
        sheet.Cell(summaryStartRow, 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1f2933");
        sheet.Cell(summaryStartRow, 1).Style.Font.FontColor = XLColor.White;

        WriteInfoCell(sheet, $"A{summaryStartRow + 1}", "Totali i rreshtave", items.Count);
        WriteInfoCell(sheet, $"A{summaryStartRow + 2}", "Totali i dokumenteve", items.Sum(x => x.DocumentTotal), true);
        WriteInfoCell(sheet, $"A{summaryStartRow + 3}", "Totali i paguar", items.Sum(x => x.PaidTotal), true);
        WriteInfoCell(sheet, $"A{summaryStartRow + 4}", "Mbetja per pagesa", items.Sum(x => x.Balance), true);

        var summaryRange = sheet.Range(summaryStartRow, 1, summaryStartRow + 4, 2);
        summaryRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Border.OutsideBorderColor = XLColor.FromHtml("#94a3b8");
        summaryRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Border.InsideBorderColor = XLColor.FromHtml("#cbd5e1");

        sheet.SheetView.FreezeRows(tableStartRow);
        sheet.Columns().AdjustToContents();
        sheet.Column(1).Width = 6;
        sheet.Column(4).Width = Math.Max(sheet.Column(4).Width, 28);
        sheet.Column(9).Width = Math.Max(sheet.Column(9).Width, 20);
    }

    private static void WriteInfoCell(IXLWorksheet sheet, string address, string label, object? value, bool money = false)
    {
        var labelCell = sheet.Cell(address);
        var valueCell = labelCell.CellRight();

        labelCell.Value = label;
        labelCell.Style.Font.Bold = true;
        labelCell.Style.Fill.BackgroundColor = XLColor.FromHtml("#2f343a");
        labelCell.Style.Font.FontColor = XLColor.White;

        if (value is decimal decimalValue)
        {
            valueCell.Value = decimalValue;
        }
        else if (value is int intValue)
        {
            valueCell.Value = intValue;
        }
        else
        {
            valueCell.Value = value?.ToString() ?? string.Empty;
        }

        valueCell.Style.Fill.BackgroundColor = XLColor.FromHtml("#f8fafc");
        valueCell.Style.Font.FontColor = XLColor.FromHtml("#111827");
        valueCell.Style.Alignment.Horizontal = money ? XLAlignmentHorizontalValues.Right : XLAlignmentHorizontalValues.Left;
        if (money)
        {
            valueCell.Style.NumberFormat.Format = "#,##0.00 €";
        }
    }

    private static string ToPartnerTypeLabel(string? partnerType)
    {
        if (string.Equals(partnerType, "customer", StringComparison.OrdinalIgnoreCase)) return "Kliente";
        if (string.Equals(partnerType, "supplier", StringComparison.OrdinalIgnoreCase)) return "Furnizues";
        return "Te gjitha";
    }

    private static string FormatMoney(decimal value)
    {
        return $"{value.ToString("N2", CultureInfo.GetCultureInfo("sq-AL"))} €";
    }

    private static void SummaryCard(IContainer container, string label, string value, string helper)
    {
        container
            .PaddingRight(8)
            .Border(1)
            .BorderColor(Colors.Grey.Lighten2)
            .Background(Colors.Grey.Lighten5)
            .Padding(10)
            .Column(column =>
            {
                column.Spacing(4);
                column.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken2);
                column.Item().Text(value).SemiBold().FontSize(15);
                column.Item().Text(helper).FontSize(8).FontColor(Colors.Grey.Darken1);
            });
    }

    private static void TableHeader(TableDescriptor table, string value)
    {
        table.Cell()
            .Background(Colors.BlueGrey.Darken3)
            .Border(1)
            .BorderColor(Colors.BlueGrey.Darken3)
            .PaddingVertical(6)
            .PaddingHorizontal(5)
            .AlignCenter()
            .Text(value)
            .SemiBold()
            .FontColor(Colors.White);
    }

    private static void TableCell(
        TableDescriptor table,
        string value,
        bool alignCenter = false,
        bool alignRight = false,
        bool semiBold = false)
    {
        var cell = table.Cell()
            .BorderBottom(1)
            .BorderColor(Colors.Grey.Lighten2)
            .PaddingVertical(5)
            .PaddingHorizontal(5);

        if (alignCenter)
        {
            cell = cell.AlignCenter();
        }
        else if (alignRight)
        {
            cell = cell.AlignRight();
        }

        var text = cell.Text(value);
        if (semiBold)
        {
            text.SemiBold();
        }
    }

    private static void SummaryRow(TableDescriptor table, string label, string value)
    {
        table.Cell().Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten4).Padding(5)
            .Text(label).SemiBold();
        table.Cell().Border(1).BorderColor(Colors.Grey.Lighten2).Padding(5).AlignRight()
            .Text(value);
    }

    private static string ToPaymentStatus(decimal documentTotal, decimal paidTotal)
    {
        if (documentTotal <= 0) return "Pa vlere";
        if (paidTotal <= 0) return "i papaguar";
        if (paidTotal >= documentTotal) return "i paguar plotesisht";
        return "i paguar pjeserisht";
    }

    private sealed record PaymentAggregate(decimal PaidTotal, DateTime? LastPaymentDate);
    private sealed record PartnerInfoRow(Guid Id, string Code, string Name, bool IsActive);

    private async Task<List<UnpaidDocumentReportItemResponse>> BuildUnpaidDocumentsReportAsync(string? q, string? partnerType)
    {
        var includeInbound = string.IsNullOrWhiteSpace(partnerType) || partnerType.Equals("all", StringComparison.OrdinalIgnoreCase) || partnerType.Equals("supplier", StringComparison.OrdinalIgnoreCase);
        var includeOutbound = string.IsNullOrWhiteSpace(partnerType) || partnerType.Equals("all", StringComparison.OrdinalIgnoreCase) || partnerType.Equals("customer", StringComparison.OrdinalIgnoreCase);
        var term = q?.Trim();

        var rows = new List<UnpaidDocumentReportItemResponse>();

        if (includeOutbound)
        {
            var outboundRows = await _db.OutboundDocuments
                .AsNoTracking()
                .Where(x => x.Status == DocumentStatus.Confirmed && x.CustomerId != null)
                .Select(x => new
                {
                    x.Id,
                    x.DocumentNo,
                    x.CreatedAt,
                    PartnerCode = x.Customer!.Code,
                    PartnerName = x.Customer!.Name,
                    DocumentTotal = x.Lines.Sum(line => line.Quantity * (
                        line.PriceTier == OutboundPriceTier.Retail
                            ? line.Product.RetailPrice
                            : line.PriceTier == OutboundPriceTier.Wholesale
                                ? line.Product.WholesalePrice
                                : line.Product.VipPrice)),
                    PaidTotal = _db.PartnerPayments
                        .Where(p => p.OutboundDocumentId == x.Id)
                        .Select(p => (decimal?)p.Amount)
                        .Sum() ?? 0m
                })
                .ToListAsync();

            rows.AddRange(outboundRows.Select(x => new UnpaidDocumentReportItemResponse(
                x.Id,
                "outbound",
                x.DocumentNo,
                x.PartnerCode,
                x.PartnerName,
                x.CreatedAt,
                x.DocumentTotal,
                x.PaidTotal,
                x.DocumentTotal - x.PaidTotal,
                ToPaymentStatus(x.DocumentTotal, x.PaidTotal))));
        }

        if (includeInbound)
        {
            var inboundRows = await _db.InboundDocuments
                .AsNoTracking()
                .Where(x => x.Status == DocumentStatus.Confirmed && x.SupplierId != null)
                .Select(x => new
                {
                    x.Id,
                    x.DocumentNo,
                    x.CreatedAt,
                    PartnerCode = x.Supplier!.Code,
                    PartnerName = x.Supplier!.Name,
                    DocumentTotal = x.Lines.Sum(line => line.Quantity * (line.PurchasePrice > 0m ? line.PurchasePrice : line.Product.PurchasePrice)),
                    PaidTotal = _db.PartnerPayments
                        .Where(p => p.InboundDocumentId == x.Id)
                        .Select(p => (decimal?)p.Amount)
                        .Sum() ?? 0m
                })
                .ToListAsync();

            rows.AddRange(inboundRows.Select(x => new UnpaidDocumentReportItemResponse(
                x.Id,
                "inbound",
                x.DocumentNo,
                x.PartnerCode,
                x.PartnerName,
                x.CreatedAt,
                x.DocumentTotal,
                x.PaidTotal,
                x.DocumentTotal - x.PaidTotal,
                ToPaymentStatus(x.DocumentTotal, x.PaidTotal))));
        }

        return rows
            .Where(x => x.Balance > 0)
            .Where(x => string.IsNullOrWhiteSpace(term)
                || x.DocumentNo.Contains(term!, StringComparison.OrdinalIgnoreCase)
                || x.PartnerCode.Contains(term!, StringComparison.OrdinalIgnoreCase)
                || x.PartnerName.Contains(term!, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.Balance)
            .ThenByDescending(x => x.CreatedAt)
            .ToList();
    }
}

public record PartnerFinanceBalancesResponse(
    IReadOnlyList<PartnerBalanceItemResponse> Customers,
    IReadOnlyList<PartnerBalanceItemResponse> Suppliers,
    PartnerFinanceSummaryResponse Summary);

public record PartnerFinanceSummaryResponse(
    decimal CustomerDocumentTotal,
    decimal CustomerPaidTotal,
    decimal CustomerBalanceTotal,
    decimal SupplierDocumentTotal,
    decimal SupplierPaidTotal,
    decimal SupplierBalanceTotal);

public record PartnerBalanceItemResponse(
    Guid Id,
    string Code,
    string Name,
    bool IsActive,
    decimal DocumentTotal,
    decimal PaidTotal,
    decimal Balance,
    DateTime? LastPaymentDate);

public record PartnerPaymentListItemResponse(
    Guid Id,
    Guid? CustomerId,
    Guid? SupplierId,
    Guid? InboundDocumentId,
    Guid? OutboundDocumentId,
    string PartnerType,
    string PartnerCode,
    string PartnerName,
    decimal Amount,
    DateTime PaymentDate,
    string? DocumentNo,
    string? Reference,
    string? Note);

public record PartnerDocumentOptionResponse(
    Guid Id,
    string DocumentType,
    string DocumentNo,
    DateTime CreatedAt,
    decimal DocumentTotal,
    decimal PaidTotal)
{
    public decimal Balance { get; init; }
    public string PaymentStatus { get; init; } = "I papaguar";
}

public record UnpaidDocumentReportItemResponse(
    Guid DocumentId,
    string DocumentType,
    string DocumentNo,
    string PartnerCode,
    string PartnerName,
    DateTime CreatedAt,
    decimal DocumentTotal,
    decimal PaidTotal,
    decimal Balance,
    string PaymentStatus);

public class CreatePartnerPaymentRequest
{
    public Guid? CustomerId { get; set; }
    public Guid? SupplierId { get; set; }
    public Guid? InboundDocumentId { get; set; }
    public Guid? OutboundDocumentId { get; set; }
    public decimal Amount { get; set; }
    public DateTime? PaymentDate { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
}
