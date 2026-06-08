using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Common;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/warehouses")]
public class WarehousesController : ControllerBase
{
    private readonly SmdDbContext _db;
    public WarehousesController(SmdDbContext db) => _db = db;

    // GET /api/warehouses/all
    [HttpGet("all")]
    public async Task<IActionResult> GetAll()
    {
        var warehouses = await _db.Warehouses
            .OrderBy(w => w.Code)
            .Select(w => new
            {
                w.Id,
                w.Code,
                w.Name,
                w.Address,
                w.City,
                w.Latitude,
                w.Longitude,
                w.CutoffTime,
                w.DailyOrderCapacity,
                w.IsActive
            })
            .ToListAsync();

        return Ok(warehouses);
    }

    // GET /api/warehouses/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var w = await _db.Warehouses
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.Code,
                x.Name,
                x.Address,
                x.City,
                x.Latitude,
                x.Longitude,
                x.CutoffTime,
                x.DailyOrderCapacity,
                x.IsActive
            })
            .FirstOrDefaultAsync();

        return w is null ? NotFound() : Ok(w);
    }

    // POST /api/warehouses
    [Authorize(Policy = "CanEditMasterData")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWarehouseRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("ID dhe emri i depos janë të detyrueshme.");

        var code = req.Code.Trim();

        var exists = await _db.Warehouses.AnyAsync(x => x.Code == code);
        if (exists) return Conflict("Depo me këtë ID ekziston.");

        var warehouse = new Warehouse
        {
            Code = code,
            Name = req.Name.Trim(),
            Address = string.IsNullOrWhiteSpace(req.Address) ? null : req.Address.Trim(),
            City = string.IsNullOrWhiteSpace(req.City) ? null : req.City.Trim(),
            Latitude = req.Latitude,
            Longitude = req.Longitude,
            CutoffTime = req.CutoffTime,
            DailyOrderCapacity = req.DailyOrderCapacity,
            IsActive = true
        };

        _db.Warehouses.Add(warehouse);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = warehouse.Id }, new { warehouse.Id });
    }

    // PUT /api/warehouses/{id}
    [Authorize(Policy = "CanEditMasterData")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateWarehouseRequest req)
    {
        var warehouse = await _db.Warehouses.FindAsync(id);
        if (warehouse is null) return NotFound();

        warehouse.Name = string.IsNullOrWhiteSpace(req.Name) ? warehouse.Name : req.Name.Trim();
        warehouse.Address = req.Address?.Trim();
        warehouse.City = req.City?.Trim();
        warehouse.Latitude = req.Latitude ?? warehouse.Latitude;
        warehouse.Longitude = req.Longitude ?? warehouse.Longitude;
        warehouse.CutoffTime = req.CutoffTime ?? warehouse.CutoffTime;
        warehouse.DailyOrderCapacity = req.DailyOrderCapacity ?? warehouse.DailyOrderCapacity;
        warehouse.IsActive = req.IsActive ?? warehouse.IsActive;
        warehouse.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/warehouses/{id}
    [Authorize(Policy = "CanEditMasterData")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        var warehouse = await _db.Warehouses.FindAsync(id);
        if (warehouse is null) return NotFound();

        warehouse.IsActive = false;
        warehouse.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/warehouses/lookup
    [HttpGet("lookup")]
    public async Task<IActionResult> List()
    {
        var data = await _db.Warehouses
            .Where(w => w.IsActive)
            .OrderBy(w => w.Code)
            .Select(w => new LookupDto
            {
                Id = w.Id,
                Code = w.Code,
                Name = w.Name
            })
            .ToListAsync();

        return Ok(data);
    }

    // GET /api/warehouses/network-overview?days=30
    [HttpGet("network-overview")]
    public async Task<IActionResult> NetworkOverview([FromQuery] int days = 30)
    {
        var safeDays = Math.Clamp(days, 1, 180);
        var fromUtc = DateTime.UtcNow.AddDays(-safeDays);

        var warehouses = await _db.Warehouses
            .AsNoTracking()
            .OrderBy(w => w.Code)
            .Select(w => new
            {
                w.Id,
                w.Code,
                w.Name,
                w.Address,
                w.City,
                w.Latitude,
                w.Longitude,
                w.CutoffTime,
                w.DailyOrderCapacity,
                w.IsActive
            })
            .ToListAsync();

        var inventoryRows = await _db.Inventories
            .AsNoTracking()
            .Where(i => i.Bin.IsActive && i.Bin.Rack.Zone.Warehouse.IsActive && i.Product.IsActive)
            .Select(i => new
            {
                WarehouseId = i.Bin.Rack.Zone.WarehouseId,
                OnHand = i.QtyOnHand,
                Reserved = i.QtyReserved,
                ProductMin = i.Product.MinStockLevel
            })
            .ToListAsync();

        var inventoryByWarehouse = inventoryRows
            .GroupBy(x => x.WarehouseId)
            .ToDictionary(
                g => g.Key,
                g => new
                {
                    totalOnHand = g.Sum(x => x.OnHand),
                    totalReserved = g.Sum(x => x.Reserved),
                    totalAvailable = g.Sum(x => x.OnHand - x.Reserved),
                    lowStockRows = g.Count(x => (x.OnHand - x.Reserved) <= (x.ProductMin > 0 ? x.ProductMin : 5m))
                });

        var transferRows = await _db.StockMovements
            .AsNoTracking()
            .Where(m => m.Type == SMD.Domain.Enums.StockMovementType.TRANSFER && m.CreatedAt >= fromUtc && m.FromBinId.HasValue && m.ToBinId.HasValue)
            .Select(m => new
            {
                m.Quantity,
                FromWarehouseId = m.FromBin!.Rack.Zone.WarehouseId,
                ToWarehouseId = m.ToBin!.Rack.Zone.WarehouseId
            })
            .ToListAsync();

        var edges = transferRows
            .Where(x => x.FromWarehouseId != x.ToWarehouseId)
            .GroupBy(x => new { x.FromWarehouseId, x.ToWarehouseId })
            .Select(g => new
            {
                fromWarehouseId = g.Key.FromWarehouseId,
                toWarehouseId = g.Key.ToWarehouseId,
                transferCount = g.Count(),
                quantityTotal = g.Sum(x => x.Quantity)
            })
            .OrderByDescending(x => x.quantityTotal)
            .ThenByDescending(x => x.transferCount)
            .ToList();

        var warehouseNodes = warehouses.Select(w =>
        {
            inventoryByWarehouse.TryGetValue(w.Id, out var inv);
            var capacityUsedToday = transferRows.Count(x => x.FromWarehouseId == w.Id);
            var capacityPercent = (w.DailyOrderCapacity.HasValue && w.DailyOrderCapacity.Value > 0)
                ? Math.Round((decimal)capacityUsedToday / w.DailyOrderCapacity.Value * 100m, 1)
                : (decimal?)null;
            var lowStockRows = inv?.lowStockRows ?? 0;
            var lowStockScore = Math.Min(lowStockRows * 12m, 60m);
            var capacityScore = capacityPercent.HasValue ? Math.Min(capacityPercent.Value * 0.4m, 40m) : 0m;
            var riskScore = Math.Round(Math.Min(100m, lowStockScore + capacityScore), 1);
            return new
            {
                w.Id,
                w.Code,
                w.Name,
                w.Address,
                w.City,
                w.Latitude,
                w.Longitude,
                w.CutoffTime,
                w.DailyOrderCapacity,
                w.IsActive,
                TotalOnHand = inv?.totalOnHand ?? 0m,
                TotalReserved = inv?.totalReserved ?? 0m,
                TotalAvailable = inv?.totalAvailable ?? 0m,
                LowStockRows = lowStockRows,
                CapacityUsedToday = capacityUsedToday,
                CapacityPercent = capacityPercent,
                RiskScore = riskScore
            };
        }).ToList();

        var whById = warehouses.ToDictionary(x => x.Id);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.Local).TimeOfDay;
        var afterCutoffMaxDistanceKm = 35m;

        var recommendationRows = new List<object>();
        foreach (var target in warehouseNodes.Where(x => x.LowStockRows > 0))
        {
            if (!whById.TryGetValue(target.Id, out var targetWh)) continue;

            var candidates = warehouseNodes
                .Where(s => s.Id != target.Id && s.TotalAvailable > 0)
                .Select(s =>
                {
                    var sourceWh = whById[s.Id];
                    var distance = ComputeDistanceKm(targetWh.Latitude, targetWh.Longitude, sourceWh.Latitude, sourceWh.Longitude);
                    var isAfterCutoff = targetWh.CutoffTime.HasValue && nowLocal >= targetWh.CutoffTime.Value;
                    var cutoffBlocked = isAfterCutoff && distance.HasValue && distance.Value > afterCutoffMaxDistanceKm;
                    var capacityBlocked = sourceWh.DailyOrderCapacity.HasValue
                        && sourceWh.DailyOrderCapacity.Value > 0
                        && s.CapacityUsedToday >= sourceWh.DailyOrderCapacity.Value;
                    return new
                    {
                        source = s,
                        distanceKm = distance,
                        cutoffBlocked,
                        capacityBlocked,
                        score = ComputeRecommendationScore(s.TotalAvailable, s.CapacityPercent, distance)
                    };
                })
                .OrderBy(x => x.cutoffBlocked ? 1 : 0)
                .ThenBy(x => x.capacityBlocked ? 1 : 0)
                .ThenByDescending(x => x.score)
                .Take(3)
                .ToList();

            recommendationRows.Add(new
            {
                targetWarehouseId = target.Id,
                targetWarehouseCode = target.Code,
                targetWarehouseName = target.Name,
                suggestedSources = candidates.Select(c => new
                {
                    sourceWarehouseId = c.source.Id,
                    sourceWarehouseCode = c.source.Code,
                    sourceWarehouseName = c.source.Name,
                    distanceKm = c.distanceKm,
                    availableStock = c.source.TotalAvailable,
                    capacityPercent = c.source.CapacityPercent,
                    status = c.cutoffBlocked ? "BLOCKED_CUTOFF" :
                             c.capacityBlocked ? "BLOCKED_CAPACITY" :
                             "OK"
                }).ToList()
            });
        }

        return Ok(new
        {
            days = safeDays,
            generatedAtUtc = DateTime.UtcNow,
            warehouses = warehouseNodes,
            links = edges,
            recommendations = recommendationRows
        });
    }

    private static decimal? ComputeDistanceKm(decimal? lat1, decimal? lon1, decimal? lat2, decimal? lon2)
    {
        if (!lat1.HasValue || !lon1.HasValue || !lat2.HasValue || !lon2.HasValue)
            return null;

        static double ToRad(double d) => d * (Math.PI / 180d);
        var a1 = ToRad((double)lat1.Value);
        var o1 = ToRad((double)lon1.Value);
        var a2 = ToRad((double)lat2.Value);
        var o2 = ToRad((double)lon2.Value);

        var dLat = a2 - a1;
        var dLon = o2 - o1;
        var h = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(a1) * Math.Cos(a2) * Math.Pow(Math.Sin(dLon / 2), 2);
        var c = 2 * Math.Asin(Math.Min(1, Math.Sqrt(h)));
        return (decimal)(6371d * c);
    }

    private static decimal ComputeRecommendationScore(decimal availableStock, decimal? capacityPercent, decimal? distanceKm)
    {
        var distancePenalty = distanceKm.HasValue ? Math.Min(distanceKm.Value, 300m) / 300m * 40m : 20m;
        var capacityPenalty = capacityPercent.HasValue ? Math.Min(capacityPercent.Value, 100m) / 100m * 35m : 0m;
        var stockBoost = Math.Min(availableStock, 500m) / 500m * 35m;
        return stockBoost - distancePenalty - capacityPenalty;
    }

    public class CreateWarehouseRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Address { get; set; }
        public string? City { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public TimeSpan? CutoffTime { get; set; }
        public int? DailyOrderCapacity { get; set; }
    }

    public class UpdateWarehouseRequest
    {
        public string? Name { get; set; }
        public string? Address { get; set; }
        public string? City { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public TimeSpan? CutoffTime { get; set; }
        public int? DailyOrderCapacity { get; set; }
        public bool? IsActive { get; set; }
    }
}
