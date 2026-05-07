using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Inventory;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/inventory")]
public class InventoryController : ControllerBase
{
    private readonly SmdDbContext _db;
    public InventoryController(SmdDbContext db) => _db = db;


    [HttpGet]
    public async Task<IActionResult> GetInventory([FromQuery] InventoryListQuery query)
    {
        var today = DateTime.UtcNow.Date;
        var q = _db.Inventories
            .Include(i => i.Product)
            .Include(i => i.Bin)
                .ThenInclude(b => b.Rack)
                    .ThenInclude(r => r.Zone)
                        .ThenInclude(z => z.Warehouse)
            .AsQueryable();

        // SEARCH
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var s = query.Search.Trim().ToLower();

            q = q.Where(i =>
                i.Product.Name.ToLower().Contains(s) ||
                i.Product.Sku.ToLower().Contains(s) ||
                (i.Product.Barcode != null && i.Product.Barcode.ToLower().Contains(s)) ||
                (i.Product.Description != null && i.Product.Description.ToLower().Contains(s)) ||
                (i.LotNumber != null && i.LotNumber.ToLower().Contains(s)) ||
                (i.BatchNumber != null && i.BatchNumber.ToLower().Contains(s)) ||

                i.Bin.Code.ToLower().Contains(s) ||
                i.Bin.Name.ToLower().Contains(s) ||

                i.Bin.Rack.Code.ToLower().Contains(s) ||
                i.Bin.Rack.Name.ToLower().Contains(s) ||

                i.Bin.Rack.Zone.Code.ToLower().Contains(s) ||
                i.Bin.Rack.Zone.Name.ToLower().Contains(s) ||

                i.Bin.Rack.Zone.Warehouse.Code.ToLower().Contains(s) ||
                i.Bin.Rack.Zone.Warehouse.Name.ToLower().Contains(s) ||
                (i.Bin.Rack.Zone.Warehouse.Address != null &&
                 i.Bin.Rack.Zone.Warehouse.Address.ToLower().Contains(s))
            );
        }

        // FILTERS
        if (query.WarehouseId.HasValue)
            q = q.Where(i => i.Bin.Rack.Zone.WarehouseId == query.WarehouseId);

        if (query.ZoneId.HasValue)
            q = q.Where(i => i.Bin.Rack.ZoneId == query.ZoneId);

        if (query.RackId.HasValue)
            q = q.Where(i => i.Bin.RackId == query.RackId);

        if (query.BinId.HasValue)
            q = q.Where(i => i.BinId == query.BinId);

        if (query.ProductId.HasValue)
            q = q.Where(i => i.ProductId == query.ProductId);

        if (query.OnlyInStock)
            q = q.Where(i => i.QtyOnHand > 0);

        if (query.OnlyOutOfStock)
            q = q.Where(i => i.QtyOnHand == 0);

        if (query.OnlyBelowMinStock)
        {
            var fallbackThreshold = query.LowStockThreshold ?? 5;
            q = q.Where(i =>
                (i.QtyOnHand - i.QtyReserved) > 0 &&
                (i.QtyOnHand - i.QtyReserved) <= (i.Product.MinStockLevel > 0 ? i.Product.MinStockLevel : fallbackThreshold));
        }

        switch (query.ExpiryFilter?.Trim().ToLowerInvariant())
        {
            case "expired":
                q = q.Where(i => i.ExpiryDate.HasValue && i.ExpiryDate.Value < today);
                break;
            case "nearexpiry":
                q = q.Where(i => i.ExpiryDate.HasValue && i.ExpiryDate.Value >= today && i.ExpiryDate.Value <= today.AddDays(30));
                break;
            case "noexpiry":
                q = q.Where(i => !i.ExpiryDate.HasValue);
                break;
        }

        if (query.LowStockThreshold.HasValue)
            q = q.Where(i => i.QtyOnHand > 0 && i.QtyOnHand < query.LowStockThreshold.Value);

        // SORT
        q = (query.SortBy?.ToLower(), query.SortDir?.ToLower()) switch
        {
            ("sku", "desc") => q.OrderByDescending(i => i.Product.Sku),
            ("sku", _) => q.OrderBy(i => i.Product.Sku),

            ("name", "desc") => q.OrderByDescending(i => i.Product.Name),
            ("name", _) => q.OrderBy(i => i.Product.Name),

            ("qty", "desc") => q.OrderByDescending(i => i.QtyOnHand),
            ("qty", _) => q.OrderBy(i => i.QtyOnHand),

            ("available", "desc") => q.OrderByDescending(i => (i.QtyOnHand - i.QtyReserved)),
            ("available", _) => q.OrderBy(i => (i.QtyOnHand - i.QtyReserved)),

            ("warehouse", "desc") => q.OrderByDescending(i => i.Bin.Rack.Zone.Warehouse.Code),
            ("warehouse", _) => q.OrderBy(i => i.Bin.Rack.Zone.Warehouse.Code),

            ("bin", "desc") => q.OrderByDescending(i => i.Bin.Code),
            ("bin", _) => q.OrderBy(i => i.Bin.Code),

            _ => q.OrderBy(i => i.Product.Sku)
        };

        var total = await q.CountAsync();

        var data = await q
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(i => new InventoryListItemDto
            {
                InventoryId = i.Id,
                ProductId = i.ProductId,
                ProductSku = i.Product.Sku,
                ProductName = i.Product.Name,
                ProductBarcode = i.Product.Barcode ?? "",
                ProductDescription = i.Product.Description ?? "",
                ProductUnitOfMeasure = i.Product.UnitOfMeasure ?? "",
                ProductMinStockLevel = i.Product.MinStockLevel,
                IsBelowMinStock = i.Product.MinStockLevel > 0 && (i.QtyOnHand - i.QtyReserved) > 0 && (i.QtyOnHand - i.QtyReserved) <= i.Product.MinStockLevel,

                BinId = i.BinId,
                BinCode = i.Bin.Code,
                BinName = i.Bin.Name,

                RackId = i.Bin.RackId,
                RackCode = i.Bin.Rack.Code,
                RackName = i.Bin.Rack.Name,

                ZoneId = i.Bin.Rack.ZoneId,
                ZoneCode = i.Bin.Rack.Zone.Code,
                ZoneName = i.Bin.Rack.Zone.Name,

                WarehouseId = i.Bin.Rack.Zone.WarehouseId,
                WarehouseCode = i.Bin.Rack.Zone.Warehouse.Code,
                WarehouseName = i.Bin.Rack.Zone.Warehouse.Name,
                WarehouseAddress = i.Bin.Rack.Zone.Warehouse.Address ?? "",

                LotNumber = i.LotNumber,
                BatchNumber = i.BatchNumber,
                ExpiryDate = i.ExpiryDate,
                IsExpired = i.ExpiryDate.HasValue && i.ExpiryDate.Value < today,
                IsNearExpiry = i.ExpiryDate.HasValue && i.ExpiryDate.Value >= today && i.ExpiryDate.Value <= today.AddDays(30),

                QtyOnHand = i.QtyOnHand,
                QtyReserved = i.QtyReserved,
                QtyAvailable = i.QtyOnHand - i.QtyReserved
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            query.Page,
            query.PageSize,
            data
        });
    }
    /*
    [HttpGet]
    public async Task<IActionResult> GetInventory([FromQuery] InventoryListQuery query)
    {
        var q = _db.Inventories
            .Include(i => i.Product)
            .Include(i => i.Bin)
                .ThenInclude(b => b.Rack)
                    .ThenInclude(r => r.Zone)
                        .ThenInclude(z => z.Warehouse)
            .AsQueryable();

        // SEARCH
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var s = query.Search.ToLower();
            q = q.Where(i =>
                i.Product.Name.ToLower().Contains(s) ||
                i.Product.Sku.ToLower().Contains(s) ||
                i.Bin.Code.ToLower().Contains(s));
        }

        // FILTERS
        if (query.WarehouseId.HasValue)
            q = q.Where(i => i.Bin.Rack.Zone.WarehouseId == query.WarehouseId);

        if (query.ZoneId.HasValue)
            q = q.Where(i => i.Bin.Rack.ZoneId == query.ZoneId);

        if (query.RackId.HasValue)
            q = q.Where(i => i.Bin.RackId == query.RackId);

        if (query.BinId.HasValue)
            q = q.Where(i => i.BinId == query.BinId);

        if (query.ProductId.HasValue)
            q = q.Where(i => i.ProductId == query.ProductId);

        if (query.OnlyInStock)
            q = q.Where(i => i.QtyOnHand > 0);

        if (query.OnlyOutOfStock)
            q = q.Where(i => i.QtyOnHand == 0);

        // SORT
        q = (query.SortBy?.ToLower(), query.SortDir?.ToLower()) switch
        {
            ("sku", "desc") => q.OrderByDescending(i => i.Product.Sku),
            ("sku", _) => q.OrderBy(i => i.Product.Sku),

            ("name", "desc") => q.OrderByDescending(i => i.Product.Name),
            ("name", _) => q.OrderBy(i => i.Product.Name),

            ("qty", "desc") => q.OrderByDescending(i => i.QtyOnHand),
            ("qty", _) => q.OrderBy(i => i.QtyOnHand),

            ("available", "desc") => q.OrderByDescending(i => (i.QtyOnHand - i.QtyReserved)),
            ("available", _) => q.OrderBy(i => (i.QtyOnHand - i.QtyReserved)),

            _ => q.OrderBy(i => i.Product.Sku)
        };

        var total = await q.CountAsync();

        var data = await q
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(i => new InventoryListItemDto
            {
                InventoryId = i.Id,
                ProductId = i.ProductId,
                ProductSku = i.Product.Sku,
                ProductName = i.Product.Name,

                BinId = i.BinId,
                BinCode = i.Bin.Code,

                RackId = i.Bin.RackId,
                RackCode = i.Bin.Rack.Code,

                ZoneId = i.Bin.Rack.ZoneId,
                ZoneCode = i.Bin.Rack.Zone.Code,

                WarehouseId = i.Bin.Rack.Zone.WarehouseId,
                WarehouseCode = i.Bin.Rack.Zone.Warehouse.Code,

                QtyOnHand = i.QtyOnHand,
                QtyReserved = i.QtyReserved,
                QtyAvailable = i.QtyOnHand - i.QtyReserved
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            query.Page,
            query.PageSize,
            data
        });
    }
   */

    // 1) Shfaq stock për një Bin
    // GET /api/inventory/bin/{binId}
    [HttpGet("bin/{binId:guid}")]
    public async Task<IActionResult> GetByBin(Guid binId)
    {
        var existsBin = await _db.Bins.AnyAsync(b => b.Id == binId);
        if (!existsBin) return NotFound("Bin not found.");

        var items = await _db.Inventories
            .Where(i => i.BinId == binId)
            .Select(i => new
            {
                i.Id,
                i.ProductId,
                ProductSku = i.Product.Sku,
                ProductName = i.Product.Name,
                LotNumber = i.LotNumber,
                BatchNumber = i.BatchNumber,
                ExpiryDate = i.ExpiryDate,
                i.QtyOnHand,
                i.QtyReserved,
                QtyAvailable = i.QtyOnHand - i.QtyReserved
            })
            .OrderBy(x => x.ProductSku)
            .ToListAsync();

        return Ok(items);
    }

    // 2) Shfaq stock për një Product
    // GET /api/inventory/product/{productId}
    [HttpGet("product/{productId:guid}")]
    public async Task<IActionResult> GetByProduct(Guid productId)
    {
        var existsProduct = await _db.Products.AnyAsync(p => p.Id == productId);
        if (!existsProduct) return NotFound("Produkti nuk u gjet.");

        var items = await _db.Inventories
            .Where(i => i.ProductId == productId)
            .Select(i => new
            {
                i.Id,
                i.BinId,
                BinCode = i.Bin.Code,
                i.LotNumber,
                i.BatchNumber,
                i.ExpiryDate,
                i.QtyOnHand,
                i.QtyReserved,
                QtyAvailable = i.QtyOnHand - i.QtyReserved
            })
            .OrderBy(x => x.BinCode)
            .ToListAsync();

        return Ok(items);
    }

    // SUMMARY CARDS
    // GET /api/inventory/summary?lowStockThreshold=5
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] decimal lowStockThreshold = 5)
    {
        if (lowStockThreshold <= 0) lowStockThreshold = 5;

        var totalOnHand = await _db.Inventories.SumAsync(x => x.QtyOnHand);
        var totalReserved = await _db.Inventories.SumAsync(x => x.QtyReserved);
        var totalAvailable = totalOnHand - totalReserved;

        var stockAlerts = await BuildProductStockAlertsAsync(lowStockThreshold, int.MaxValue);

        var totalProducts = await _db.Products.CountAsync(x => x.IsActive);
        var outOfStock = stockAlerts.ProductsOutOfStock;
        var lowStock = stockAlerts.LowStockProducts;
        var inStock = Math.Max(totalProducts - outOfStock, 0);

        return Ok(new InventorySummaryDto
        {
            TotalProducts = totalProducts,
            TotalQtyOnHand = totalOnHand,
            TotalQtyReserved = totalReserved,
            TotalQtyAvailable = totalAvailable,
            ProductsInStock = inStock,
            ProductsOutOfStock = outOfStock,
            LowStockProducts = lowStock
        });
    }

    // STOCK ALERTS BY PRODUCT
    // GET /api/inventory/stock-alerts?lowStockThreshold=5&top=20
    [HttpGet("stock-alerts")]
    public async Task<IActionResult> StockAlerts([FromQuery] decimal lowStockThreshold = 5, [FromQuery] int top = 20)
    {
        if (lowStockThreshold <= 0) lowStockThreshold = 5;
        if (top <= 0) top = 20;

        var result = await BuildProductStockAlertsAsync(lowStockThreshold, top);
        return Ok(result);
    }

    // GET /api/inventory/stock-alerts/excel?lowStockThreshold=5
    [HttpGet("stock-alerts/excel")]
    [Authorize(Policy = "CanExport")]
    public async Task<IActionResult> StockAlertsExcel([FromQuery] decimal lowStockThreshold = 5)
    {
        if (lowStockThreshold <= 0) lowStockThreshold = 5;

        var result = await BuildProductStockAlertsAsync(lowStockThreshold, int.MaxValue);
        var rows = result.OutOfStockItems
            .Select(x => new { Status = "Pa stok", Item = x })
            .Concat(result.LowStockItems.Select(x => new { Status = "Nen prag minimal", Item = x }))
            .ToList();

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Per porosi");

        const int tableHeaderRow = 10;
        const int firstDataRow = 11;
        const int columnCount = 11;

        ws.Cell("A1").Value = "SMD";
        ws.Cell("A2").Value = "Lista per Porosine e Mallit";
        ws.Cell("A3").Value = "Produkte pa stok ose nen prag minimal";

        ws.Range(1, 1, 1, columnCount).Merge();
        ws.Range(2, 1, 2, columnCount).Merge();
        ws.Range(3, 1, 3, columnCount).Merge();

        ws.Cell("A5").Value = "Qellimi";
        ws.Cell("B5").Value = "Mall per porosi";
        ws.Cell("A6").Value = "Rreshta";
        ws.Cell("B6").Value = rows.Count;
        ws.Cell("A7").Value = "Data e eksportit";
        ws.Cell("B7").Value = DateTime.Now;
        ws.Cell("G5").Value = "Produkte pa stok";
        ws.Cell("H5").Value = result.ProductsOutOfStock;
        ws.Cell("G6").Value = "Nen prag minimal";
        ws.Cell("H6").Value = result.LowStockProducts;
        ws.Cell("G7").Value = "Pragu minimal baze";
        ws.Cell("H7").Value = Math.Truncate(lowStockThreshold);

        ws.Range("A5:B7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("G5:H7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("G5:H7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
        ws.Range("G5:H7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
        ws.Range("A5:A7").Style.Font.Bold = true;
        ws.Range("G5:G7").Style.Font.Bold = true;
        ws.Range("B6:B6").Style.NumberFormat.Format = "0";
        ws.Range("B7:B7").Style.DateFormat.Format = "dd.MM.yyyy HH:mm";
        ws.Range("H5:H7").Style.NumberFormat.Format = "0";

        var headers = new[]
        {
            "#",
            "Statusi",
            "SKU",
            "Barkodi",
            "Produkti",
            "Ne depo",
            "Rezervuar",
            "Ne dispozicion",
            "Pragu minimal",
            "Sasia per porosi",
            "Shenim"
        };

        for (var i = 0; i < headers.Length; i++)
            ws.Cell(tableHeaderRow, i + 1).Value = headers[i];

        var row = firstDataRow;
        var index = 1;
        foreach (var entry in rows)
        {
            var item = entry.Item;
            ws.Cell(row, 1).Value = index++;
            ws.Cell(row, 2).Value = entry.Status;
            ws.Cell(row, 3).Value = item.Sku;
            ws.Cell(row, 4).Value = item.Barcode;
            ws.Cell(row, 5).Value = item.Name;
            ws.Cell(row, 6).Value = item.QtyOnHand;
            ws.Cell(row, 7).Value = item.QtyReserved;
            ws.Cell(row, 8).Value = item.QtyAvailable;
            ws.Cell(row, 9).Value = Math.Truncate(item.MinStockLevel);
            ws.Cell(row, 10).Value = Math.Truncate(item.MissingToMinStock);
            ws.Cell(row, 11).Value = item.HasInventoryRows ? "Ka rreshta inventari" : "Nuk ka rresht inventari";

            if (entry.Status == "Pa stok")
                ws.Range(row, 1, row, columnCount).Style.Fill.BackgroundColor = XLColor.FromHtml("#FEE2E2");
            else
                ws.Range(row, 1, row, columnCount).Style.Fill.BackgroundColor = XLColor.FromHtml("#FEF3C7");

            row++;
        }

        if (rows.Count == 0)
        {
            ws.Range(firstDataRow, 1, firstDataRow, columnCount).Merge();
            ws.Cell(firstDataRow, 1).Value = "Nuk ka produkte per porosi.";
            ws.Cell(firstDataRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(firstDataRow, 1).Style.Font.Italic = true;
            ws.Cell(firstDataRow, 1).Style.Font.FontColor = XLColor.Gray;
            row = firstDataRow + 1;
        }

        var totalMissing = rows.Sum(x => x.Item.MissingToMinStock);

        ws.Cell(row + 1, 1).Value = "Permbledhje";
        ws.Cell(row + 2, 1).Value = "Totali i rreshtave";
        ws.Cell(row + 2, 2).Value = rows.Count;
        ws.Cell(row + 3, 1).Value = "Sasia totale per porosi";
        ws.Cell(row + 3, 2).Value = Math.Truncate(totalMissing);
        ws.Cell(row + 4, 1).Value = "Produkte pa stok";
        ws.Cell(row + 4, 2).Value = result.ProductsOutOfStock;
        ws.Cell(row + 5, 1).Value = "Produkte nen prag";
        ws.Cell(row + 5, 2).Value = result.LowStockProducts;

        var summaryRange = ws.Range(row + 1, 1, row + 5, 2);
        summaryRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#EEF3F8");
        ws.Cell(row + 1, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 1, row + 5, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 2, row + 5, 2).Style.Font.Bold = true;
        ws.Range(row + 2, 2, row + 5, 2).Style.NumberFormat.Format = "0";

        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Font.Bold = true;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Fill.BackgroundColor = XLColor.FromHtml("#D9EAF7");
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Border.TopBorder = XLBorderStyleValues.Thin;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        ws.Range(tableHeaderRow, 1, Math.Max(row - 1, tableHeaderRow), columnCount).Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        if (rows.Count > 0)
            ws.Range(tableHeaderRow, 1, row - 1, columnCount).SetAutoFilter();
        else
            ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).SetAutoFilter();

        ws.Cell("A1").Style.Font.FontColor = XLColor.FromHtml("#64748B");
        ws.Cell("A1").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.FontSize = 18;
        ws.Cell("A3").Style.Font.FontColor = XLColor.FromHtml("#475569");

        ws.Column(1).Width = 8;
        ws.Column(2).Width = 18;
        ws.Column(3).Width = 16;
        ws.Column(4).Width = 18;
        ws.Column(5).Width = 32;
        ws.Column(6).Width = 14;
        ws.Column(7).Width = 14;
        ws.Column(8).Width = 16;
        ws.Column(9).Width = 16;
        ws.Column(10).Width = 18;
        ws.Column(11).Width = 24;
        ws.Column(4).Style.NumberFormat.Format = "@";
        ws.Range(firstDataRow, 6, Math.Max(row - 1, firstDataRow), 10).Style.NumberFormat.Format = "0";
        ws.Range(firstDataRow, 6, Math.Max(row - 1, firstDataRow), 10).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Range(firstDataRow, 1, Math.Max(row - 1, firstDataRow), 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(firstDataRow, 5, Math.Max(row - 1, firstDataRow), 5).Style.Alignment.WrapText = true;
        ws.Range(firstDataRow, 11, Math.Max(row - 1, firstDataRow), 11).Style.Alignment.WrapText = true;
        ws.Rows(firstDataRow, Math.Max(row - 1, firstDataRow)).Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
        ws.Rows(firstDataRow, Math.Max(row - 1, firstDataRow)).AdjustToContents();

        ws.SheetView.FreezeRows(tableHeaderRow);
        ws.SheetView.FreezeColumns(3);

        ws.PageSetup.PageOrientation = XLPageOrientation.Landscape;
        ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
        ws.PageSetup.Margins.Top = 0.4;
        ws.PageSetup.Margins.Bottom = 0.4;
        ws.PageSetup.Margins.Left = 0.3;
        ws.PageSetup.Margins.Right = 0.3;
        ws.PageSetup.FitToPages(1, 0);
        ws.PageSetup.CenterHorizontally = true;
        ws.PageSetup.SetRowsToRepeatAtTop(1, tableHeaderRow);

        ws.PageSetup.Header.Left.AddText("SMD");
        ws.PageSetup.Header.Center.AddText("Lista per Porosine e Mallit");
        ws.PageSetup.Footer.Center.AddText("Gjeneruar nga SMD");
        ws.PageSetup.Footer.Right.AddText("Faqe &[Page] / &[Pages]");

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        var filename = $"Lista_per_Porosi_Malli_{DateTime.Now:yyyyMMdd_HHmm}.xlsx";
        Response.Headers.Append("Access-Control-Expose-Headers", "Content-Disposition");

        return File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename
        );
    }

    // EXPIRY REPORT
    // GET /api/inventory/expiry-report?warehouseId=...
    [HttpGet("expiry-report")]
    public async Task<IActionResult> ExpiryReport([FromQuery] Guid? warehouseId = null)
    {
        var today = DateTime.UtcNow.Date;
        var in7Days = today.AddDays(7);
        var in30Days = today.AddDays(30);

        var q = _db.Inventories
            .AsNoTracking()
            .Where(i => i.ExpiryDate.HasValue && (i.QtyOnHand - i.QtyReserved) > 0);

        if (warehouseId.HasValue)
            q = q.Where(i => i.Bin.Rack.Zone.WarehouseId == warehouseId.Value);

        var rows = await q
            .Select(i => new InventoryExpiryItemDto
            {
                InventoryId = i.Id,
                ProductId = i.ProductId,
                ProductSku = i.Product.Sku,
                ProductName = i.Product.Name,
                BinCode = i.Bin.Code,
                WarehouseCode = i.Bin.Rack.Zone.Warehouse.Code,
                LotNumber = i.LotNumber,
                BatchNumber = i.BatchNumber,
                ExpiryDate = i.ExpiryDate!.Value,
                QtyAvailable = i.QtyOnHand - i.QtyReserved
            })
            .ToListAsync();

        var expiredItems = rows
            .Where(x => x.ExpiryDate < today)
            .OrderBy(x => x.ExpiryDate)
            .ThenBy(x => x.ProductSku)
            .ToList();

        var expiringIn7DaysItems = rows
            .Where(x => x.ExpiryDate >= today && x.ExpiryDate <= in7Days)
            .OrderBy(x => x.ExpiryDate)
            .ThenBy(x => x.ProductSku)
            .ToList();

        var expiringIn30DaysItems = rows
            .Where(x => x.ExpiryDate >= today && x.ExpiryDate <= in30Days)
            .OrderBy(x => x.ExpiryDate)
            .ThenBy(x => x.ProductSku)
            .ToList();

        return Ok(new InventoryExpiryReportDto
        {
            ExpiredCount = expiredItems.Count,
            ExpiringIn7DaysCount = expiringIn7DaysItems.Count,
            ExpiringIn30DaysCount = expiringIn30DaysItems.Count,
            ExpiredItems = expiredItems.Take(8).ToList(),
            ExpiringIn7DaysItems = expiringIn7DaysItems.Take(8).ToList(),
            ExpiringIn30DaysItems = expiringIn30DaysItems.Take(8).ToList()
        });
    }

    // CHARTS
    // GET /api/inventory/charts?days=30&top=10&lowStockThreshold=5
    [HttpGet("charts")]
    public async Task<IActionResult> Charts([FromQuery] int days = 30, [FromQuery] int top = 10, [FromQuery] decimal lowStockThreshold = 5)
    {
        if (days <= 0) days = 30;
        if (top <= 0) top = 10;
        if (lowStockThreshold <= 0) lowStockThreshold = 5;

        // Stock by warehouse
        var stockByWarehouse = await _db.Inventories
            .GroupBy(i => new
            {
                WarehouseId = i.Bin.Rack.Zone.Warehouse.Id,
                WarehouseCode = i.Bin.Rack.Zone.Warehouse.Code,
                WarehouseName = i.Bin.Rack.Zone.Warehouse.Name
            })
            .Select(g => new WarehouseStockPoint
            {
                WarehouseId = g.Key.WarehouseId,
                WarehouseCode = g.Key.WarehouseCode,
                WarehouseName = g.Key.WarehouseName,
                QtyOnHand = g.Sum(x => x.QtyOnHand),
                QtyReserved = g.Sum(x => x.QtyReserved),
                QtyAvailable = g.Sum(x => x.QtyOnHand - x.QtyReserved)
            })
            .OrderByDescending(x => x.QtyAvailable)
            .ToListAsync();

        var stockAlerts = await BuildProductStockAlertsAsync(lowStockThreshold, top);
        var lowStockTop = stockAlerts.LowStockItems
            .Select(x => new ProductPoint
            {
                ProductId = x.ProductId,
                Sku = x.Sku,
                Name = x.Name,
                Value = x.QtyAvailable
            })
            .ToList();
        var outOfStockTop = stockAlerts.OutOfStockItems
            .Select(x => new ProductPoint
            {
                ProductId = x.ProductId,
                Sku = x.Sku,
                Name = x.Name,
                Value = x.QtyAvailable
            })
            .ToList();

        // Top movers (30d) = SUM(|Quantity|)
        var since = DateTime.UtcNow.AddDays(-days);

        var moversRaw = await _db.StockMovements
            .Where(m => m.CreatedAt >= since)
            .GroupBy(m => m.ProductId)
            .Select(g => new { ProductId = g.Key, Movement = g.Sum(x => Math.Abs(x.Quantity)) })
            .OrderByDescending(x => x.Movement)
            .Take(top)
            .ToListAsync();

        var moverIds = moversRaw.Select(x => x.ProductId).Distinct().ToList();
        var moverProducts = await _db.Products
            .Where(p => moverIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Sku, p.Name })
            .ToListAsync();
        var mmap = moverProducts.ToDictionary(x => x.Id, x => x);

        var topMovers = moversRaw
            .Select(x => new ProductPoint
            {
                ProductId = x.ProductId,
                Sku = mmap.TryGetValue(x.ProductId, out var p) ? p.Sku : "",
                Name = mmap.TryGetValue(x.ProductId, out p) ? p.Name : "",
                Value = x.Movement
            })
            .ToList();

        return Ok(new InventoryChartsDto
        {
            StockByWarehouse = stockByWarehouse,
            LowStockTop = lowStockTop,
            OutOfStockTop = outOfStockTop,
            TopMovers30d = topMovers
        });
    }

    // 3) Adjustment (rrit/ul QtyOnHand) – për test dhe operacione bazë
    // POST /api/inventory/adjust
    [HttpPost("adjust")]
    public async Task<IActionResult> Adjust([FromBody] InventoryAdjustRequest req)
    {
        if (req.QtyChange == 0) return BadRequest("QtyChange nuk mund të jetë 0.");

        var binExists = await _db.Bins.AnyAsync(b => b.Id == req.BinId);
        if (!binExists) return NotFound("Shporta nuk u gjet.");

        var productExists = await _db.Products.AnyAsync(p => p.Id == req.ProductId);
        if (!productExists) return NotFound("Produkti nuk u gjet.");

        var row = await _db.Inventories
            .FirstOrDefaultAsync(i =>
                i.BinId == req.BinId &&
                i.ProductId == req.ProductId &&
                i.LotNumber == req.LotNumber &&
                i.BatchNumber == req.BatchNumber &&
                i.ExpiryDate == req.ExpiryDate);

        if (row == null)
        {
            row = new Inventory
            {
                BinId = req.BinId,
                ProductId = req.ProductId,
                LotNumber = string.IsNullOrWhiteSpace(req.LotNumber) ? null : req.LotNumber.Trim(),
                BatchNumber = string.IsNullOrWhiteSpace(req.BatchNumber) ? null : req.BatchNumber.Trim(),
                ExpiryDate = req.ExpiryDate?.Date,
                QtyOnHand = 0,
                QtyReserved = 0
            };
            _db.Inventories.Add(row);
        }

        var newQty = row.QtyOnHand + req.QtyChange;
        if (newQty < 0) return BadRequest("QtyOnHand nuk mund të shkojë nën 0.");

        // nuk lejojmë që reserved të jetë më shumë se onHand
        if (row.QtyReserved > newQty)
            return BadRequest("QtyReserved është më e madhe se QtyOnHand pas ndryshimit.");

        row.QtyOnHand = newQty;
        row.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            row.Id,
            row.BinId,
            row.ProductId,
            row.QtyOnHand,
            row.QtyReserved,
            QtyAvailable = row.QtyOnHand - row.QtyReserved
        });
    }

    // 4) Reserve (rezervo sasi)
    // POST /api/inventory/reserve
    [HttpPost("reserve")]
    public async Task<IActionResult> Reserve([FromBody] InventoryReserveRequest req)
    {
        if (req.Qty <= 0) return BadRequest("Qty duhet të jetë > 0.");

        var row = await _db.Inventories
            .FirstOrDefaultAsync(i =>
                i.BinId == req.BinId &&
                i.ProductId == req.ProductId &&
                i.LotNumber == req.LotNumber &&
                i.BatchNumber == req.BatchNumber &&
                i.ExpiryDate == req.ExpiryDate);

        if (row == null) return NotFound("Inventory row not found (shto OnHand fillimisht).");

        var available = row.QtyOnHand - row.QtyReserved;
        if (req.Qty > available) return BadRequest("Nuk ka sasi të mjaftueshme për rezervim.");

        row.QtyReserved += req.Qty;
        row.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { row.Id, row.QtyOnHand, row.QtyReserved, QtyAvailable = row.QtyOnHand - row.QtyReserved });
    }

    // 5) Unreserve (liro rezervimin)
    // POST /api/inventory/unreserve
    [HttpPost("unreserve")]
    public async Task<IActionResult> Unreserve([FromBody] InventoryReserveRequest req)
    {
        if (req.Qty <= 0) return BadRequest("Qty duhet të jetë > 0.");

        var row = await _db.Inventories
            .FirstOrDefaultAsync(i =>
                i.BinId == req.BinId &&
                i.ProductId == req.ProductId &&
                i.LotNumber == req.LotNumber &&
                i.BatchNumber == req.BatchNumber &&
                i.ExpiryDate == req.ExpiryDate);

        if (row == null) return NotFound("Inventory row not found.");

        if (req.Qty > row.QtyReserved) return BadRequest("Qty është më e madhe se QtyReserved.");

        row.QtyReserved -= req.Qty;
        row.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { row.Id, row.QtyOnHand, row.QtyReserved, QtyAvailable = row.QtyOnHand - row.QtyReserved });
    }

    private async Task<InventoryStockAlertsDto> BuildProductStockAlertsAsync(decimal lowStockThreshold, int top)
    {
        var perProduct = await _db.Inventories
            .AsNoTracking()
            .GroupBy(x => x.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                QtyOnHand = g.Sum(x => x.QtyOnHand),
                QtyReserved = g.Sum(x => x.QtyReserved),
                QtyAvailable = g.Sum(x => x.QtyOnHand - x.QtyReserved),
                Rows = g.Count()
            })
            .ToListAsync();

        var stockMap = perProduct.ToDictionary(x => x.ProductId);
        var products = await _db.Products
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new
            {
                x.Id,
                x.Sku,
                x.Name,
                Barcode = x.Barcode ?? "",
                MinStockLevel = x.MinStockLevel > 0 ? x.MinStockLevel : lowStockThreshold
            })
            .ToListAsync();

        var rows = products
            .Select(x =>
            {
                stockMap.TryGetValue(x.Id, out var stock);
                var qtyOnHand = stock?.QtyOnHand ?? 0m;
                var qtyReserved = stock?.QtyReserved ?? 0m;
                var qtyAvailable = stock?.QtyAvailable ?? 0m;
                return new InventoryProductStockAlertDto
                {
                    ProductId = x.Id,
                    Sku = x.Sku,
                    Name = x.Name,
                    Barcode = x.Barcode,
                    QtyOnHand = qtyOnHand,
                    QtyReserved = qtyReserved,
                    QtyAvailable = qtyAvailable,
                    MinStockLevel = x.MinStockLevel,
                    MissingToMinStock = Math.Max(x.MinStockLevel - qtyAvailable, 0m),
                    HasInventoryRows = (stock?.Rows ?? 0) > 0
                };
            })
            .ToList();

        var outOfStockItems = rows
            .Where(x => x.QtyAvailable <= 0)
            .OrderBy(x => x.Sku)
            .ToList();

        var lowStockItems = rows
            .Where(x => x.QtyAvailable > 0 && x.QtyAvailable <= x.MinStockLevel)
            .OrderBy(x => x.QtyAvailable)
            .ThenByDescending(x => x.MissingToMinStock)
            .ThenBy(x => x.Sku)
            .ToList();

        return new InventoryStockAlertsDto
        {
            ProductsOutOfStock = outOfStockItems.Count,
            LowStockProducts = lowStockItems.Count,
            OutOfStockItems = outOfStockItems.Take(top).ToList(),
            LowStockItems = lowStockItems.Take(top).ToList()
        };
    }
    /*
    public class AdjustRequest
    {
        public Guid BinId { get; set; }
        public Guid ProductId { get; set; }
        public decimal QtyChange { get; set; } // + shto, - hiq
    }
    
    public class ReserveRequest
    {
        public Guid BinId { get; set; }
        public Guid ProductId { get; set; }
        public decimal Qty { get; set; }
    }
    */
}
