using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Infrastructure.Persistence;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/bins")]
public class BinsLookupController : ControllerBase
{
    private readonly SmdDbContext _db;
    public BinsLookupController(SmdDbContext db) => _db = db;

    // GET /api/bins?q=sh-001
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? q)
    {
        q = q?.Trim();
        if (string.IsNullOrWhiteSpace(q))
            return Ok(Array.Empty<object>());

        var term = q.ToLower();

        var bins = await _db.Bins
            .AsNoTracking()
            .Where(b => b.IsActive &&
                (b.Code.ToLower().Contains(term) || b.Name.ToLower().Contains(term)))
            .OrderBy(b => b.Code)
            .Select(b => new
            {
                id = b.Id,
                code = b.Code,
                name = b.Name,

                rackId = b.RackId,
                rackCode = b.Rack.Code,
                rackName = b.Rack.Name,

                zoneId = b.Rack.ZoneId,
                zoneCode = b.Rack.Zone.Code,
                zoneName = b.Rack.Zone.Name,

                warehouseId = b.Rack.Zone.WarehouseId,
                warehouseCode = b.Rack.Zone.Warehouse.Code,
                warehouseName = b.Rack.Zone.Warehouse.Name
            })
            .Take(20)
            .ToListAsync();

        return Ok(bins);
    }

    // GET /api/bins/suggested?productId=...
    [HttpGet("suggested")]
    public async Task<IActionResult> Suggested([FromQuery] Guid productId, [FromQuery] string? q, [FromQuery] bool onlyAvailable = false)
    {
        var today = DateTime.UtcNow.Date;
        var term = q?.Trim().ToLower();

        var inventoryQuery = _db.Inventories
            .AsNoTracking()
            .Where(i => i.ProductId == productId && (i.QtyOnHand - i.QtyReserved) > 0 && i.Bin.IsActive);

        if (!string.IsNullOrWhiteSpace(term))
        {
            inventoryQuery = inventoryQuery.Where(i =>
                i.Bin.Code.ToLower().Contains(term) ||
                i.Bin.Name.ToLower().Contains(term) ||
                (i.LotNumber != null && i.LotNumber.ToLower().Contains(term)) ||
                (i.BatchNumber != null && i.BatchNumber.ToLower().Contains(term)));
        }

        var inventorySuggestions = await inventoryQuery
            .Select(i => new
            {
                id = i.Bin.Id,
                code = i.Bin.Code,
                name = i.Bin.Name,
                rackId = i.Bin.RackId,
                rackCode = i.Bin.Rack.Code,
                rackName = i.Bin.Rack.Name,
                zoneId = i.Bin.Rack.ZoneId,
                zoneCode = i.Bin.Rack.Zone.Code,
                zoneName = i.Bin.Rack.Zone.Name,
                warehouseId = i.Bin.Rack.Zone.WarehouseId,
                warehouseCode = i.Bin.Rack.Zone.Warehouse.Code,
                warehouseName = i.Bin.Rack.Zone.Warehouse.Name,
                availableQty = i.QtyOnHand - i.QtyReserved,
                lotNumber = i.LotNumber,
                batchNumber = i.BatchNumber,
                expiryDate = i.ExpiryDate
            })
            .ToListAsync();

        if (inventorySuggestions.Count > 0)
        {
            var ranked = inventorySuggestions
                .OrderBy(i => i.expiryDate.HasValue ? (i.expiryDate.Value < today ? 2 : 0) : 1)
                .ThenBy(i => i.expiryDate ?? DateTime.MaxValue)
                .ThenByDescending(i => i.availableQty)
                .Take(string.IsNullOrWhiteSpace(term) ? 5 : 20)
                .Select(i => new
                {
                    i.id,
                    i.code,
                    i.name,
                    i.rackId,
                    i.rackCode,
                    i.rackName,
                    i.zoneId,
                    i.zoneCode,
                    i.zoneName,
                    i.warehouseId,
                    i.warehouseCode,
                    i.warehouseName,
                    reason = i.expiryDate.HasValue
                        ? (i.expiryDate.Value < today
                            ? $"Kujdes: produkt i skaduar me {i.expiryDate.Value:dd.MM.yyyy}"
                            : $"FEFO: skadon me {i.expiryDate.Value:dd.MM.yyyy}")
                        : "Bazuar ne inventarin ekzistues pa skadence",
                    i.availableQty,
                    i.lotNumber,
                    i.batchNumber,
                    i.expiryDate,
                    isExpired = i.expiryDate.HasValue && i.expiryDate.Value < today,
                    isNearExpiry = i.expiryDate.HasValue && i.expiryDate.Value >= today && i.expiryDate.Value <= today.AddDays(30)
                })
                .ToList();

            return Ok(ranked);
        }

        if (onlyAvailable)
            return Ok(Array.Empty<object>());

        var historicSuggestions = await _db.InboundDocumentLines
            .AsNoTracking()
            // ktheje ne kete version nese nuk punon
            //.Where(l => l.ProductId == productId && l.ToBin.IsActive)
            // nese dojm warning me e hek Dereference of possibly null 
            .Where(l =>
                l.ProductId == productId &&
                l.ToBin != null &&
                l.ToBin.IsActive &&
                l.ToBin.Rack != null &&
                l.ToBin.Rack.Zone != null &&
                l.ToBin.Rack.Zone.Warehouse != null)
            .GroupBy(l => new
            {
                l.ToBinId,
                // ktheje ne kete version nese nuk punon
                /* 
                l.ToBin.Code,
                l.ToBin.Name,
                */
                l.ToBin!.Code,
                l.ToBin!.Name,
                l.ToBin.RackId,
                RackCode = l.ToBin.Rack.Code,
                RackName = l.ToBin.Rack.Name,
                ZoneId = l.ToBin.Rack.ZoneId,
                ZoneCode = l.ToBin.Rack.Zone.Code,
                ZoneName = l.ToBin.Rack.Zone.Name,
                WarehouseId = l.ToBin.Rack.Zone.WarehouseId,
                WarehouseCode = l.ToBin.Rack.Zone.Warehouse.Code,
                WarehouseName = l.ToBin.Rack.Zone.Warehouse.Name
            })
            .Select(g => new
            {
                id = g.Key.ToBinId,
                code = g.Key.Code,
                name = g.Key.Name,
                rackId = g.Key.RackId,
                rackCode = g.Key.RackCode,
                rackName = g.Key.RackName,
                zoneId = g.Key.ZoneId,
                zoneCode = g.Key.ZoneCode,
                zoneName = g.Key.ZoneName,
                warehouseId = g.Key.WarehouseId,
                warehouseCode = g.Key.WarehouseCode,
                warehouseName = g.Key.WarehouseName,
                reason = "Bazuar ne historikun e pranimeve",
                availableQty = 0m,
                totalQty = g.Sum(x => x.Quantity),
                uses = g.Count()
            })
            .OrderByDescending(x => x.uses)
            .ThenByDescending(x => x.totalQty)
            .Take(3)
            .ToListAsync();

        return Ok(historicSuggestions);
    }
}
