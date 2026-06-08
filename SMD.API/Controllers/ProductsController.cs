using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QRCoder;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/products")]
public class ProductsController : ControllerBase
{
    private readonly SmdDbContext _db;
    public ProductsController(SmdDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? q)
    {
        var query = _db.Products.AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(p =>
                p.Sku.Contains(term) ||
                p.Name.Contains(term) ||
                (p.Description != null && p.Description.Contains(term)) ||
                (p.Barcode != null && p.Barcode.Contains(term)));
        }

        var items = await query
            .OrderBy(p => p.Sku)
            .Select(p => new
            {
                p.Id,
                p.Sku,
                p.Name,
                p.Description,
                p.Barcode,
                p.UnitOfMeasure,
                p.MinStockLevel,
                p.PurchasePrice,
                p.RetailPrice,
                p.WholesalePrice,
                p.VipPrice,
                p.IsActive
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var p = await _db.Products
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.Sku,
                x.Name,
                x.Barcode,
                x.Description,
                x.UnitOfMeasure,
                x.MinStockLevel,
                x.PurchasePrice,
                x.RetailPrice,
                x.WholesalePrice,
                x.VipPrice,
                x.IsActive
            })
            .FirstOrDefaultAsync();

        return p is null ? NotFound() : Ok(p);
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> GetHistory(Guid id, [FromQuery] int movementTake = 80, [FromQuery] int documentTake = 60)
    {
        movementTake = Math.Clamp(movementTake, 10, 200);
        documentTake = Math.Clamp(documentTake, 10, 160);

        var product = await _db.Products
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.Sku,
                x.Name,
                x.Barcode,
                x.Description,
                x.UnitOfMeasure,
                x.MinStockLevel,
                x.PurchasePrice,
                x.RetailPrice,
                x.WholesalePrice,
                x.VipPrice,
                x.IsActive,
                x.CreatedAt,
                x.UpdatedAt
            })
            .FirstOrDefaultAsync();

        if (product is null) return NotFound("Produkti nuk u gjet.");

        var today = DateTime.UtcNow.Date;

        var inventoryRows = await _db.Inventories
            .AsNoTracking()
            .Where(i => i.ProductId == id)
            .OrderByDescending(i => i.QtyOnHand - i.QtyReserved)
            .ThenBy(i => i.Bin.Rack.Zone.Warehouse.Code)
            .ThenBy(i => i.Bin.Code)
            .Select(i => new
            {
                InventoryId = i.Id,
                i.BinId,
                BinCode = i.Bin.Code,
                BinName = i.Bin.Name,
                RackCode = i.Bin.Rack.Code,
                ZoneCode = i.Bin.Rack.Zone.Code,
                WarehouseCode = i.Bin.Rack.Zone.Warehouse.Code,
                WarehouseName = i.Bin.Rack.Zone.Warehouse.Name,
                i.LotNumber,
                i.BatchNumber,
                i.ExpiryDate,
                IsExpired = i.ExpiryDate.HasValue && i.ExpiryDate.Value < today,
                IsNearExpiry = i.ExpiryDate.HasValue && i.ExpiryDate.Value >= today && i.ExpiryDate.Value <= today.AddDays(30),
                i.QtyOnHand,
                i.QtyReserved,
                QtyAvailable = i.QtyOnHand - i.QtyReserved,
                i.UpdatedAt
            })
            .ToListAsync();

        var totalOnHand = inventoryRows.Sum(x => x.QtyOnHand);
        var totalReserved = inventoryRows.Sum(x => x.QtyReserved);
        var totalAvailable = inventoryRows.Sum(x => x.QtyAvailable);

        var movements = await (
            from m in _db.StockMovements.AsNoTracking().Where(x => x.ProductId == id)
            join fb in _db.Bins.AsNoTracking() on m.FromBinId equals fb.Id into fbg
            from fb in fbg.DefaultIfEmpty()
            join tb in _db.Bins.AsNoTracking() on m.ToBinId equals tb.Id into tbg
            from tb in tbg.DefaultIfEmpty()
            orderby m.CreatedAt descending
            select new
            {
                m.Id,
                Type = m.Type == StockMovementType.IN
                    ? "IN"
                    : m.Type == StockMovementType.OUT
                        ? "OUT"
                        : m.Type == StockMovementType.TRANSFER
                            ? "TRANSFER"
                            : "ADJUST",
                m.FromBinId,
                FromBinCode = fb != null ? fb.Code : null,
                FromBinName = fb != null ? fb.Name : null,
                m.ToBinId,
                ToBinCode = tb != null ? tb.Code : null,
                ToBinName = tb != null ? tb.Name : null,
                m.Quantity,
                QuantityEffect = m.Type == StockMovementType.IN
                    ? m.Quantity
                    : m.Type == StockMovementType.OUT
                        ? -m.Quantity
                        : m.Type == StockMovementType.ADJUST
                            ? m.Quantity
                            : 0m,
                m.Reference,
                m.Note,
                m.PerformedByUserId,
                m.CreatedAt
            })
            .Take(movementTake)
            .ToListAsync();

        var inboundDocuments = await _db.InboundDocumentLines
            .AsNoTracking()
            .Where(l => l.ProductId == id)
            .OrderByDescending(l => l.InboundDocument.CreatedAt)
            .Take(documentTake)
            .Select(l => new ProductHistoryDocumentRow
            {
                LineId = l.Id,
                Direction = "Pranim",
                DocumentType = "INBOUND",
                DocumentId = l.InboundDocumentId,
                DocumentNo = l.InboundDocument.DocumentNo,
                Status = (int)l.InboundDocument.Status,
                PartnerCode = l.InboundDocument.Supplier != null ? l.InboundDocument.Supplier.Code : null,
                PartnerName = l.InboundDocument.Supplier != null ? l.InboundDocument.Supplier.Name : null,
                Reference = l.InboundDocument.Reference,
                Note = l.InboundDocument.Note,
                BinId = l.ToBinId,
                BinCode = l.ToBin != null ? l.ToBin.Code : null,
                BinName = l.ToBin != null ? l.ToBin.Name : null,
                Quantity = l.Quantity,
                ReservedQuantity = null,
                LotNumber = l.LotNumber,
                BatchNumber = l.BatchNumber,
                ExpiryDate = l.ExpiryDate,
                CreatedAt = l.InboundDocument.CreatedAt
            })
            .ToListAsync();

        var outboundDocuments = await _db.OutboundDocumentLines
            .AsNoTracking()
            .Where(l => l.ProductId == id)
            .OrderByDescending(l => l.OutboundDocument.CreatedAt)
            .Take(documentTake)
            .Select(l => new ProductHistoryDocumentRow
            {
                LineId = l.Id,
                Direction = "Dalje",
                DocumentType = "OUTBOUND",
                DocumentId = l.OutboundDocumentId,
                DocumentNo = l.OutboundDocument.DocumentNo,
                Status = (int)l.OutboundDocument.Status,
                PartnerCode = l.OutboundDocument.Customer != null ? l.OutboundDocument.Customer.Code : null,
                PartnerName = l.OutboundDocument.Customer != null ? l.OutboundDocument.Customer.Name : null,
                Reference = l.OutboundDocument.Reference,
                Note = l.OutboundDocument.Note,
                BinId = l.FromBinId,
                BinCode = l.FromBin.Code,
                BinName = l.FromBin.Name,
                Quantity = l.Quantity,
                ReservedQuantity = l.ReservedQuantity,
                LotNumber = l.LotNumber,
                BatchNumber = l.BatchNumber,
                ExpiryDate = l.ExpiryDate,
                CreatedAt = l.OutboundDocument.CreatedAt
            })
            .ToListAsync();

        var documentRows = inboundDocuments
            .Concat(outboundDocuments)
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.DocumentNo)
            .Take(documentTake)
            .ToList();

        return Ok(new
        {
            Product = product,
            Summary = new
            {
                TotalOnHand = totalOnHand,
                TotalReserved = totalReserved,
                TotalAvailable = totalAvailable,
                BinCount = inventoryRows.Count(x => x.QtyOnHand != 0 || x.QtyReserved != 0),
                LotCount = inventoryRows
                    .Select(x => string.IsNullOrWhiteSpace(x.LotNumber) ? "-" : x.LotNumber)
                    .Distinct()
                    .Count(),
                ExpiredRows = inventoryRows.Count(x => x.IsExpired),
                NearExpiryRows = inventoryRows.Count(x => x.IsNearExpiry),
                IsBelowMinStock = product.MinStockLevel > 0 && totalAvailable > 0 && totalAvailable <= product.MinStockLevel,
                LastMovementAt = movements.FirstOrDefault()?.CreatedAt
            },
            InventoryRows = inventoryRows,
            Movements = movements,
            Documents = documentRows
        });
    }

    [HttpGet("barcode/next")]
    [Authorize(Policy = "CanEditMasterData")]
    public async Task<IActionResult> GetNextBarcode()
    {
        for (var attempt = 0; attempt < 30; attempt++)
        {
            var candidate = GenerateInternalEan13();
            var exists = await _db.Products.AnyAsync(x => x.Barcode == candidate);
            if (!exists)
            {
                return Ok(new { Barcode = candidate });
            }
        }

        return StatusCode(500, "Nuk u gjenerua barcode unik. Provo perseri.");
    }

    [HttpGet("{id:guid}/barcode-labels.pdf")]
    [Authorize(Policy = "CanExport")]
    public async Task<IActionResult> ExportBarcodeLabels(Guid id, [FromQuery] int copies = 18)
    {
        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (product is null) return NotFound();

        var barcode = product.Barcode?.Trim();
        if (!IsValidEan13(barcode))
        {
            return BadRequest("Produktit i duhet barcode EAN-13 numerik. Gjenero barcode me prefiks 29 dhe provo perseri.");
        }

        var safeCopies = Math.Clamp(copies, 1, 96);
        var bytes = BuildBarcodeLabelsPdf(product, barcode!, safeCopies);
        var filename = $"barcode-{SanitizeFileName(product.Sku)}-{DateTime.Now:yyyyMMdd-HHmm}.pdf";

        return File(bytes, "application/pdf", filename);
    }

    [HttpGet("{id:guid}/qr-labels.pdf")]
    [Authorize(Policy = "CanExport")]
    public async Task<IActionResult> ExportQrLabels(Guid id, [FromQuery] int copies = 18)
    {
        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (product is null) return NotFound();

        var safeCopies = Math.Clamp(copies, 1, 96);
        var qrPayload = BuildProductQrPayload(product);
        var bytes = BuildQrLabelsPdf(product, qrPayload, safeCopies);
        var filename = $"qr-{SanitizeFileName(product.Sku)}-{DateTime.Now:yyyyMMdd-HHmm}.pdf";

        return File(bytes, "application/pdf", filename);
    }

    [HttpPost]
    [Authorize(Policy = "CanEditMasterData")]
    public async Task<IActionResult> Create([FromBody] CreateProductRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Sku) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("SKU dhe emri i produktit janë të detyrueshme.");
        if (req.MinStockLevel < 0)
            return BadRequest("Pragu minimal nuk mund te jete negativ.");
        if (req.MinStockLevel != decimal.Truncate(req.MinStockLevel))
            return BadRequest("Pragu minimal duhet te jete numer i plote.");
        if (!ArePricesValid(req.PurchasePrice, req.RetailPrice, req.WholesalePrice, req.VipPrice))
            return BadRequest("Cmimet nuk mund te jene negative.");

        var sku = req.Sku.Trim();

        var skuExists = await _db.Products.AnyAsync(x => x.Sku == sku);
        if (skuExists) return Conflict("Produkt me këtë SKU ekziston.");

        if (!string.IsNullOrWhiteSpace(req.Barcode))
        {
            var barcode = req.Barcode.Trim();
            var barcodeExists = await _db.Products.AnyAsync(x => x.Barcode == barcode);
            if (barcodeExists) return Conflict("Produkt me këtë Barcode ekziston.");
        }

        var product = new Product
        {
            Sku = sku,
            Name = req.Name.Trim(),
            Barcode = string.IsNullOrWhiteSpace(req.Barcode) ? null : req.Barcode.Trim(),
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            UnitOfMeasure = string.IsNullOrWhiteSpace(req.UnitOfMeasure) ? "pcs" : req.UnitOfMeasure.Trim(),
            MinStockLevel = req.MinStockLevel,
            PurchasePrice = req.PurchasePrice,
            RetailPrice = req.RetailPrice,
            WholesalePrice = req.WholesalePrice,
            VipPrice = req.VipPrice,
            IsActive = true
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = product.Id }, new { product.Id });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "CanEditMasterData")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProductRequest req)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(req.Name)) product.Name = req.Name.Trim();
        if (req.Description != null) product.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        if (!string.IsNullOrWhiteSpace(req.UnitOfMeasure)) product.UnitOfMeasure = req.UnitOfMeasure.Trim();
        if (req.IsActive.HasValue) product.IsActive = req.IsActive.Value;
        if (req.MinStockLevel.HasValue)
        {
            if (req.MinStockLevel.Value < 0) return BadRequest("Pragu minimal nuk mund te jete negativ.");
            if (req.MinStockLevel.Value != decimal.Truncate(req.MinStockLevel.Value)) return BadRequest("Pragu minimal duhet te jete numer i plote.");
            product.MinStockLevel = req.MinStockLevel.Value;
        }
        if (req.PurchasePrice.HasValue)
        {
            if (req.PurchasePrice.Value < 0) return BadRequest("Cmimi i blerjes nuk mund te jete negativ.");
            product.PurchasePrice = req.PurchasePrice.Value;
        }
        if (req.RetailPrice.HasValue)
        {
            if (req.RetailPrice.Value < 0) return BadRequest("Cmimi i pakices nuk mund te jete negativ.");
            product.RetailPrice = req.RetailPrice.Value;
        }
        if (req.WholesalePrice.HasValue)
        {
            if (req.WholesalePrice.Value < 0) return BadRequest("Cmimi i shumices nuk mund te jete negativ.");
            product.WholesalePrice = req.WholesalePrice.Value;
        }
        if (req.VipPrice.HasValue)
        {
            if (req.VipPrice.Value < 0) return BadRequest("Cmimi VIP nuk mund te jete negativ.");
            product.VipPrice = req.VipPrice.Value;
        }

        // Barcode update (kontroll unik)
        if (req.Barcode != null)
        {
            var newBarcode = string.IsNullOrWhiteSpace(req.Barcode) ? null : req.Barcode.Trim();

            if (newBarcode != null)
            {
                var exists = await _db.Products.AnyAsync(x => x.Barcode == newBarcode && x.Id != id);
                if (exists) return Conflict("Ekziston nje produkt tjetër me këtë Barcode.");
            }

            product.Barcode = newBarcode;
        }

        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "CanEditMasterData")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return NotFound();

        product.IsActive = false;
        product.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    public class CreateProductRequest
    {
        public string Sku { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Barcode { get; set; }
        public string? Description { get; set; }
        public string? UnitOfMeasure { get; set; } = "pcs";
        public decimal MinStockLevel { get; set; } = 5;
        public decimal PurchasePrice { get; set; }
        public decimal RetailPrice { get; set; }
        public decimal WholesalePrice { get; set; }
        public decimal VipPrice { get; set; }
    }

    public class UpdateProductRequest
    {
        public string? Name { get; set; }
        public string? Barcode { get; set; }        // null = mos e prek, "" = hiqe
        public string? Description { get; set; }    // null = mos e prek, "" = hiqe
        public string? UnitOfMeasure { get; set; }
        public decimal? MinStockLevel { get; set; }
        public decimal? PurchasePrice { get; set; }
        public decimal? RetailPrice { get; set; }
        public decimal? WholesalePrice { get; set; }
        public decimal? VipPrice { get; set; }
        public bool? IsActive { get; set; }
    }

    private sealed class ProductHistoryDocumentRow
    {
        public Guid LineId { get; set; }
        public string Direction { get; set; } = "";
        public string DocumentType { get; set; } = "";
        public Guid DocumentId { get; set; }
        public string DocumentNo { get; set; } = "";
        public int Status { get; set; }
        public string? PartnerCode { get; set; }
        public string? PartnerName { get; set; }
        public string? Reference { get; set; }
        public string? Note { get; set; }
        public Guid? BinId { get; set; }
        public string? BinCode { get; set; }
        public string? BinName { get; set; }
        public decimal Quantity { get; set; }
        public decimal? ReservedQuantity { get; set; }
        public string? LotNumber { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    private static bool ArePricesValid(params decimal[] prices) => prices.All(p => p >= 0);

    private static string GenerateInternalEan13()
    {
        var payload = $"29{RandomNumberGenerator.GetInt32(0, 1_000_000_000).ToString("D9")}{RandomNumberGenerator.GetInt32(0, 10)}";
        var checkDigit = CalculateEan13CheckDigit(payload);
        return $"{payload}{checkDigit}";
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

    private static bool IsValidEan13(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length != 13 || !value.All(char.IsDigit))
        {
            return false;
        }

        return value[12] - '0' == CalculateEan13CheckDigit(value[..12]);
    }

    private static byte[] BuildBarcodeLabelsPdf(Product product, string barcode, int copies)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var barcodeSvg = BuildEan13Svg(barcode);
        var exportDate = DateTime.Now;
        var productName = string.IsNullOrWhiteSpace(product.Name) ? "-" : product.Name.Trim();
        var labelPages = Enumerable.Range(0, copies).Chunk(18).ToList();

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
                            column.Item().PaddingTop(1).Text("Etiketa barcode per produkte").SemiBold().FontSize(16);
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
                                    .Border(1)
                                    .BorderColor(Colors.Grey.Lighten2)
                                    .Background(Colors.White)
                                    .Height(106)
                                    .Padding(5)
                                    .Column(column =>
                                    {
                                        column.Spacing(1);

                                        column.Item().Height(18).Row(row =>
                                        {
                                            row.RelativeItem().Text(text =>
                                            {
                                                text.Span(productName).SemiBold().FontSize(8).FontColor(Colors.Grey.Darken4);
                                                text.ClampLines(2, "...");
                                            });
                                            row.ConstantItem(42).AlignRight().Text("SMD").SemiBold().FontSize(7).FontColor(Colors.BlueGrey.Darken2);
                                        });

                                        column.Item().Height(9).Text(product.Sku).SemiBold().FontSize(7).FontColor(Colors.BlueGrey.Darken3);
                                        column.Item().Height(42).PaddingHorizontal(6).Svg(barcodeSvg).FitArea();
                                        column.Item().Height(11).AlignCenter().Text(barcode).SemiBold().FontSize(9).FontColor(Colors.Black);
                                    });
                            });
                        }
                    });

                    page.Footer().AlignRight().Text($"Faqe {pageIndex + 1} / {labelPages.Count}");
                });
            }
        }).GeneratePdf();
    }

    private static byte[] BuildQrLabelsPdf(Product product, string qrPayload, int copies)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var qrPng = BuildQrPng(qrPayload);
        var exportDate = DateTime.Now;
        var productName = string.IsNullOrWhiteSpace(product.Name) ? "-" : product.Name.Trim();
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
                            column.Item().PaddingTop(1).Text("Etiketa QR per produkte").SemiBold().FontSize(16);
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
                                                text.Span(productName).SemiBold().FontSize(8).FontColor(Colors.Grey.Darken4);
                                                text.ClampLines(2, "...");
                                            });
                                            row.ConstantItem(42).AlignRight().Text("SMD").SemiBold().FontSize(7).FontColor(Colors.BlueGrey.Darken2);
                                        });

                                        column.Item().Text(product.Sku).SemiBold().FontSize(7).FontColor(Colors.BlueGrey.Darken3);
                                        column.Item().Height(66).AlignCenter().AlignMiddle().Image(qrPng).FitHeight();
                                    });
                            });
                        }
                    });

                    page.Footer().AlignRight().Text($"Faqe {pageIndex + 1} / {labelPages.Count}");
                });
            }
        }).GeneratePdf();
    }

    private static string BuildProductQrPayload(Product product)
    {
        var sku = product.Sku?.Trim() ?? string.Empty;
        var barcode = product.Barcode?.Trim();
        return string.IsNullOrWhiteSpace(barcode)
            ? BuildSmdQrPayload(("TYPE", "PRODUCT"), ("SKU", sku))
            : BuildSmdQrPayload(("TYPE", "PRODUCT"), ("SKU", sku), ("BARCODE", barcode));
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

    private static byte[] BuildQrPng(string payload)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        var qrCode = new PngByteQRCode(data);
        return qrCode.GetGraphic(8, drawQuietZones: true);
    }

    private static string BuildEan13Svg(string value)
    {
        var modules = BuildEan13Modules(value);
        const decimal moduleWidth = 2.8m;
        const decimal quietZone = 10m;
        const int barHeight = 70;
        const decimal totalWidth = 95 * moduleWidth + quietZone * 2;

        var svg = new StringBuilder();
        svg.Append(CultureInfo.InvariantCulture, $"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {totalWidth} {barHeight}\">");
        svg.Append(CultureInfo.InvariantCulture, $"<rect width=\"{totalWidth}\" height=\"{barHeight}\" fill=\"#ffffff\"/>");

        for (var i = 0; i < modules.Length; i++)
        {
            if (modules[i] != '1') continue;
            svg.Append(CultureInfo.InvariantCulture, $"<rect x=\"{quietZone + i * moduleWidth}\" y=\"0\" width=\"{moduleWidth}\" height=\"{barHeight}\" fill=\"#000000\"/>");
        }

        svg.Append("</svg>");
        return svg.ToString();
    }

    private static string BuildEan13Modules(string value)
    {
        string[] leftOdd =
        [
            "0001101", "0011001", "0010011", "0111101", "0100011",
            "0110001", "0101111", "0111011", "0110111", "0001011"
        ];
        string[] leftEven =
        [
            "0100111", "0110011", "0011011", "0100001", "0011101",
            "0111001", "0000101", "0010001", "0001001", "0010111"
        ];
        string[] right =
        [
            "1110010", "1100110", "1101100", "1000010", "1011100",
            "1001110", "1010000", "1000100", "1001000", "1110100"
        ];
        string[] parity =
        [
            "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
            "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"
        ];

        var firstDigit = value[0] - '0';
        var modules = new StringBuilder("101");

        for (var i = 1; i <= 6; i++)
        {
            var digit = value[i] - '0';
            modules.Append(parity[firstDigit][i - 1] == 'L' ? leftOdd[digit] : leftEven[digit]);
        }

        modules.Append("01010");

        for (var i = 7; i <= 12; i++)
        {
            var digit = value[i] - '0';
            modules.Append(right[digit]);
        }

        modules.Append("101");
        return modules.ToString();
    }

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return string.Concat(value.Select(ch => invalid.Contains(ch) ? '-' : ch));
    }

}
