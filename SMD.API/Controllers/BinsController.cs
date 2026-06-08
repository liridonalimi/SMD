using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QRCoder;
using SMD.API.Contracts.Common;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/bins")]
public class BinsController : ControllerBase
{
    private readonly SmdDbContext _db;
    public BinsController(SmdDbContext db) => _db = db;

    // GET /api/racks/{rackId}/bins
    [HttpGet("/api/racks/{rackId:guid}/bins")]
    public async Task<IActionResult> GetAll(Guid rackId)
    {
        var bins = await _db.Bins
            .Where(b => b.RackId == rackId)
            .OrderBy(b => b.Code)
            .Select(b => new { b.Id, b.Code, b.Name, b.IsActive })
            .ToListAsync();

        return Ok(bins);
    }

    // POST /api/racks/{rackId}/bins
    //[HttpPost("/api/racks/{rackId:guid}/bins")]
    [Authorize(Policy = "CanEditMasterData")]
    [HttpPost]
    public async Task<IActionResult> Create(Guid rackId, [FromBody] CreateBinRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("ID dhe emri i shportes janë të detyrueshme.");

        var existsRack = await _db.Racks.AnyAsync(r => r.Id == rackId);
        if (!existsRack) return NotFound("Rafti nuk u gjet.");

        var bin = new Bin
        {
            RackId = rackId,
            Code = req.Code.Trim(),
            Name = req.Name.Trim(),
            IsActive = true
        };

        _db.Bins.Add(bin);
        await _db.SaveChangesAsync();

        return Ok(new { bin.Id });
    }

    // GET /api/bins
    // GET /api/bins?rackId=...
    [HttpGet("lookup")]
    public async Task<IActionResult> List([FromQuery] Guid? rackId = null)
    {
        IQueryable<Bin> q = _db.Bins.Where(b => b.IsActive);

        if (rackId.HasValue)
            q = q.Where(b => b.RackId == rackId.Value);

        var data = await q
            .OrderBy(b => b.Code)
            .Select(b => new LookupDto { Id = b.Id, Code = b.Code, Name = b.Name })
            .ToListAsync();

        return Ok(data);
    }

    [HttpGet("{id:guid}/qr-labels.pdf")]
    [Authorize(Policy = "CanExport")]
    public async Task<IActionResult> ExportQrLabels(Guid id, [FromQuery] int copies = 18)
    {
        var bin = await _db.Bins
            .AsNoTracking()
            .Include(b => b.Rack)
                .ThenInclude(r => r.Zone)
                    .ThenInclude(z => z.Warehouse)
            .FirstOrDefaultAsync(b => b.Id == id);

        if (bin is null) return NotFound("Shporta nuk u gjet.");

        var safeCopies = Math.Clamp(copies, 1, 96);
        var qrPayload = BuildBinQrPayload(bin);
        var bytes = BuildBinQrLabelsPdf(bin, qrPayload, safeCopies);
        var filename = $"qr-bin-{SanitizeFileName(bin.Code)}-{DateTime.Now:yyyyMMdd-HHmm}.pdf";

        return File(bytes, "application/pdf", filename);
    }

    [HttpPost("qr-labels.pdf")]
    [Authorize(Policy = "CanExport")]
    public async Task<IActionResult> ExportBulkQrLabels([FromBody] BulkQrLabelsRequest req)
    {
        var labels = await BuildBulkQrItems(req);

        if (labels.Count == 0)
            return NotFound("Asnje etikete nga lista nuk u gjenerua.");

        var bytes = BuildBulkBinQrLabelsPdf(labels);
        var filename = $"qr-labels-{DateTime.Now:yyyyMMdd-HHmm}.pdf";
        return File(bytes, "application/pdf", filename);
    }

    [HttpPost("qr-labels-preview")]
    [Authorize(Policy = "CanExport")]
    public async Task<IActionResult> BuildBulkQrLabelsPreview([FromBody] BulkQrLabelsRequest req)
    {
        var labels = await BuildBulkQrItems(req);
        if (labels.Count == 0)
            return BadRequest("Lista e etiketave eshte bosh ose pa elemente valide.");

        var result = labels.Select(x => new
        {
            x.Title,
            x.Code,
            x.Subtitle,
            Line = x.Line,
            QrDataUrl = $"data:image/png;base64,{Convert.ToBase64String(BuildQrPng(x.QrPayload))}"
        });

        return Ok(result);
    }

    public class CreateBinRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public class BulkQrLabelsRequest
    {
        public List<BulkQrLabelRequestItem> Items { get; set; } = new();
    }

    public class BulkQrLabelRequestItem
    {
        public Guid BinId { get; set; }
        public string Mode { get; set; } = "location";
        public string? Title { get; set; }
        public string? Code { get; set; }
        public string? Subtitle { get; set; }
        public List<string>? Lines { get; set; }
        public int Copies { get; set; } = 1;
    }

    private static string BuildBinQrPayload(Bin bin)
    {
        var rack = bin.Rack?.Code?.Trim() ?? string.Empty;
        var zone = bin.Rack?.Zone?.Code?.Trim() ?? string.Empty;
        var warehouse = bin.Rack?.Zone?.Warehouse?.Code?.Trim() ?? string.Empty;
        return BuildSmdQrPayload(
            ("TYPE", "BIN"),
            ("BIN", bin.Code.Trim()),
            ("RACK", rack),
            ("ZONE", zone),
            ("WH", warehouse));
    }

    private static byte[] BuildBinQrLabelsPdf(Bin bin, string qrPayload, int copies)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var qrPng = BuildQrPng(qrPayload);
        var exportDate = DateTime.Now;
        var binName = string.IsNullOrWhiteSpace(bin.Name) ? "-" : bin.Name.Trim();
        var locationLine = $"{bin.Rack?.Zone?.Warehouse?.Code ?? "-"} / {bin.Rack?.Zone?.Code ?? "-"} / {bin.Rack?.Code ?? "-"}";
        const int qrLabelsPerPage = 15;
        var labelPages = Enumerable.Range(0, copies).Chunk(qrLabelsPerPage).ToList();

        return Document.Create(container =>
        {
            for (var pageIndex = 0; pageIndex < labelPages.Count; pageIndex++)
            {
                var labelsOnPage = labelPages[pageIndex];

                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(18);
                    page.DefaultTextStyle(x => x.FontSize(7));

                    page.Header().Row(row =>
                    {
                        row.RelativeItem().Column(column =>
                        {
                            column.Item().Text("SMD").SemiBold().FontSize(9).FontColor(Colors.BlueGrey.Darken1);
                            column.Item().PaddingTop(1).Text("Etiketa QR per shporta").SemiBold().FontSize(16);
                            column.Item().PaddingTop(1).Text($"Eksportuar: {exportDate:dd.MM.yyyy HH:mm}")
                                .FontSize(8)
                                .FontColor(Colors.Grey.Darken2);
                        });

                        row.ConstantItem(150).AlignRight().Text($"{copies} etiketa").SemiBold().FontSize(11);
                    });

                    page.Content().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                        });

                        foreach (var _ in labelsOnPage)
                        {
                            table.Cell().Padding(3).Element(label =>
                            {
                                label
                                    .ShowEntire()
                                    .Border(1)
                                    .BorderColor(Colors.Grey.Lighten2)
                                    .Background(Colors.White)
                                    .Height(112)
                                    .Padding(5)
                                    .Column(column =>
                                    {
                                        column.Spacing(2);

                                        column.Item().Row(row =>
                                        {
                                            row.RelativeItem().Text(text =>
                                            {
                                                text.Span(binName).SemiBold().FontSize(8).FontColor(Colors.Grey.Darken4);
                                                text.ClampLines(2, "...");
                                            });
                                            row.ConstantItem(42).AlignRight().Text("SMD").SemiBold().FontSize(7).FontColor(Colors.BlueGrey.Darken2);
                                        });

                                        column.Item().Text(bin.Code).SemiBold().FontSize(8).FontColor(Colors.BlueGrey.Darken3);
                                        column.Item().Height(66).AlignCenter().AlignMiddle().Image(qrPng).FitHeight();
                                        column.Item().AlignCenter().Text(locationLine).FontSize(7).FontColor(Colors.Grey.Darken2);
                                    });
                            });
                        }
                    });

                    page.Footer().AlignRight().Text($"Faqe {pageIndex + 1} / {labelPages.Count}");
                });
            }
        }).GeneratePdf();
    }

    private static byte[] BuildBulkBinQrLabelsPdf(List<BinQrLabelItem> labels)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var exportDate = DateTime.Now;
        const int qrLabelsPerPage = 15;
        var labelPages = labels.Chunk(qrLabelsPerPage).ToList();

        return Document.Create(container =>
        {
            for (var pageIndex = 0; pageIndex < labelPages.Count; pageIndex++)
            {
                var labelsOnPage = labelPages[pageIndex];

                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(18);
                    page.DefaultTextStyle(x => x.FontSize(7));

                    page.Header().Row(row =>
                    {
                        row.RelativeItem().Column(column =>
                        {
                            column.Item().Text("SMD").SemiBold().FontSize(9).FontColor(Colors.BlueGrey.Darken1);
                            column.Item().PaddingTop(1).Text("Etiketa QR per shporta").SemiBold().FontSize(16);
                            column.Item().PaddingTop(1).Text($"Eksportuar: {exportDate:dd.MM.yyyy HH:mm}")
                                .FontSize(8)
                                .FontColor(Colors.Grey.Darken2);
                        });

                        row.ConstantItem(150).AlignRight().Text($"{labels.Count} etiketa").SemiBold().FontSize(11);
                    });

                    page.Content().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                        });

                        foreach (var labelItem in labelsOnPage)
                        {
                            var qrPng = BuildQrPng(labelItem.QrPayload);
                            table.Cell().Padding(3).Element(label =>
                            {
                                label
                                    .ShowEntire()
                                    .Border(1)
                                    .BorderColor(Colors.Grey.Lighten2)
                                    .Background(Colors.White)
                                    .Height(112)
                                    .Padding(5)
                                    .Column(column =>
                                    {
                                        column.Spacing(2);

                                        column.Item().Row(row =>
                                        {
                                            row.RelativeItem().Text(text =>
                                            {
                                                text.Span(labelItem.Subtitle).SemiBold().FontSize(8).FontColor(Colors.Grey.Darken4);
                                                text.ClampLines(2, "...");
                                            });
                                            row.ConstantItem(42).AlignRight().Text(labelItem.Title.ToUpperInvariant()).SemiBold().FontSize(7).FontColor(Colors.BlueGrey.Darken2);
                                        });

                                        column.Item().Text(labelItem.Code).SemiBold().FontSize(8).FontColor(Colors.BlueGrey.Darken3);
                                        column.Item().Height(66).AlignCenter().AlignMiddle().Image(qrPng).FitHeight();
                                        column.Item().AlignCenter().Text(labelItem.Line).FontSize(7).FontColor(Colors.Grey.Darken2);
                                    });
                            });
                        }
                    });

                    page.Footer().AlignRight().Text($"Faqe {pageIndex + 1} / {labelPages.Count}");
                });
            }
        }).GeneratePdf();
    }

    private sealed class BinQrLabelItem
    {
        public BinQrLabelItem(string title, string code, string subtitle, string line, string qrPayload)
        {
            Title = title;
            Code = code;
            Subtitle = subtitle;
            Line = line;
            QrPayload = qrPayload;
        }

        public string Title { get; }
        public string Code { get; }
        public string Subtitle { get; }
        public string Line { get; }
        public string QrPayload { get; }
    }

    private static string BuildGenericQrPayload(string mode, string code, string subtitle, List<string> lines)
    {
        var safeMode = string.IsNullOrWhiteSpace(mode) ? "location" : mode.Trim();
        var safeCode = code.Trim();
        var safeSubtitle = subtitle.Trim();
        var context = lines.Count > 0 ? string.Join(" / ", lines.Take(2)) : null;

        return BuildSmdQrPayload(
            ("TYPE", safeMode.ToUpperInvariant()),
            ("CODE", safeCode),
            ("NAME", safeSubtitle),
            ("CTX", context));
    }

    private static string BuildSmdQrPayload(params (string Key, string? Value)[] fields)
    {
        var parts = fields
            .Where(field => !string.IsNullOrWhiteSpace(field.Value))
            .Select(field => $"{field.Key}={CleanQrValue(field.Value!)}");

        return $"SMD|{string.Join("|", parts)}";
    }

    private static string CleanQrValue(string value)
    {
        return value.Trim()
            .Replace("|", " ")
            .Replace(";", " ")
            .Replace("=", " ");
    }

    private async Task<List<BinQrLabelItem>> BuildBulkQrItems(BulkQrLabelsRequest req)
    {
        if (req.Items is null || req.Items.Count == 0)
            return [];

        var requested = req.Items
            .Select(x => new BulkQrLabelRequestItem
            {
                BinId = x.BinId,
                Mode = string.IsNullOrWhiteSpace(x.Mode) ? "location" : x.Mode.Trim(),
                Title = x.Title?.Trim() ?? "",
                Code = x.Code?.Trim() ?? "",
                Subtitle = x.Subtitle?.Trim() ?? "",
                Lines = x.Lines?.Where(l => !string.IsNullOrWhiteSpace(l)).Select(l => l.Trim()).Take(3).ToList() ?? new List<string>(),
                Copies = Math.Clamp(x.Copies <= 0 ? 1 : x.Copies, 1, 99)
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .ToList();

        if (requested.Count == 0)
            return [];

        var binIds = requested.Where(x => x.BinId != Guid.Empty).Select(x => x.BinId).Distinct().ToList();
        var bins = await _db.Bins
            .AsNoTracking()
            .Include(b => b.Rack)
                .ThenInclude(r => r.Zone)
                    .ThenInclude(z => z.Warehouse)
            .Where(b => binIds.Contains(b.Id))
            .ToListAsync();

        var byId = bins.ToDictionary(b => b.Id);
        var labels = new List<BinQrLabelItem>();

        foreach (var item in requested)
        {
            var displayTitle = string.IsNullOrWhiteSpace(item.Title) ? item.Mode : item.Title;
            var displaySubtitle = string.IsNullOrWhiteSpace(item.Subtitle) ? "-" : item.Subtitle;
            var safeLines = item.Lines ?? new List<string>();
            var safeCode = item.Code ?? string.Empty;
            var displayLine = safeLines.Count > 0 ? safeLines[0] : "";
            var payload = BuildGenericQrPayload(item.Mode, safeCode, displaySubtitle, safeLines);

            if (item.BinId != Guid.Empty && byId.TryGetValue(item.BinId, out var bin))
            {
                payload = BuildBinQrPayload(bin);
                displaySubtitle = string.IsNullOrWhiteSpace(bin.Name) ? displaySubtitle : bin.Name.Trim();
                var warehouseCode = bin.Rack?.Zone?.Warehouse?.Code?.Trim();
                var warehouseName = bin.Rack?.Zone?.Warehouse?.Name?.Trim();
                if (!string.IsNullOrWhiteSpace(warehouseCode) && !string.IsNullOrWhiteSpace(warehouseName))
                    displayLine = $"Depo: {warehouseCode} - {warehouseName}";
                else if (!string.IsNullOrWhiteSpace(warehouseCode))
                    displayLine = $"Depo: {warehouseCode}";
                else
                    displayLine = "Depo: -";
            }

            for (var i = 0; i < item.Copies; i++)
            {
                labels.Add(new BinQrLabelItem(displayTitle, safeCode, displaySubtitle, displayLine, payload));
            }
        }

        return labels;
    }

    private static byte[] BuildQrPng(string payload)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        var qrCode = new PngByteQRCode(data);
        return qrCode.GetGraphic(8, drawQuietZones: true);
    }

    private static string SanitizeFileName(string value)
    {
        var chars = value
            .Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch)
            .ToArray();

        var sanitized = new string(chars).Trim('_');
        return string.IsNullOrWhiteSpace(sanitized) ? "etiketa" : sanitized;
    }
}
