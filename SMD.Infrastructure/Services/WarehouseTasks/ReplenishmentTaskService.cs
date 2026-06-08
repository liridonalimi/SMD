using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;

namespace SMD.Infrastructure.Services.WarehouseTasks;

public class ReplenishmentTaskService
{
    private const decimal AfterCutoffMaxDistanceKm = 35m;
    private readonly SmdDbContext _db;

    public ReplenishmentTaskService(SmdDbContext db)
    {
        _db = db;
    }

    public async Task<int> CreateForLowPickBinsAsync(IEnumerable<(Guid ProductId, Guid PickBinId)> picks, string sourceReference)
    {
        var uniquePairs = picks.Distinct().ToList();
        if (uniquePairs.Count == 0) return 0;

        var now = DateTime.UtcNow;
        var capacityLoadByWarehouse = new Dictionary<Guid, int>();
        var created = new List<WarehouseTask>();

        foreach (var pair in uniquePairs)
        {
            var product = await _db.Products
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == pair.ProductId && p.IsActive);
            if (product is null)
                continue;

            var pickBin = await _db.Bins
                .AsNoTracking()
                .Include(b => b.Rack).ThenInclude(r => r.Zone)
                .ThenInclude(z => z.Warehouse)
                .FirstOrDefaultAsync(b => b.Id == pair.PickBinId && b.IsActive);
            if (pickBin is null)
                continue;

            // Shume produkte jane te ndara ne lote/batch; trigger-i duhet te bazohet ne totalin e bin-it.
            var pickTotals = await _db.Inventories
                .AsNoTracking()
                .Where(i => i.ProductId == pair.ProductId && i.BinId == pair.PickBinId)
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    QtyOnHand = g.Sum(x => x.QtyOnHand),
                    QtyReserved = g.Sum(x => x.QtyReserved)
                })
                .FirstOrDefaultAsync();

            var threshold = product.MinStockLevel > 0 ? product.MinStockLevel : 5m;
            var availableInPick = (pickTotals?.QtyOnHand ?? 0m) - (pickTotals?.QtyReserved ?? 0m);
            if (availableInPick > threshold)
                continue;

            var hasActiveTask = await _db.WarehouseTasks
                .AsNoTracking()
                .AnyAsync(t =>
                    t.Type == WarehouseTaskType.Replenishment &&
                    t.ProductId == pair.ProductId &&
                    t.ToBinId == pair.PickBinId &&
                    (t.Status == WarehouseTaskStatus.Open || t.Status == WarehouseTaskStatus.InProgress));
            if (hasActiveTask)
                continue;

            var desiredTarget = threshold * 2m;
            var qtyNeeded = Math.Max(desiredTarget - availableInPick, 0m);
            if (qtyNeeded <= 0)
                continue;

            var reserveCandidates = await _db.Inventories
                .AsNoTracking()
                .Include(i => i.Bin).ThenInclude(b => b.Rack).ThenInclude(r => r.Zone)
                .ThenInclude(z => z.Warehouse)
                .Where(i =>
                    i.ProductId == pair.ProductId &&
                    i.BinId != pair.PickBinId &&
                    (i.QtyOnHand - i.QtyReserved) > 0)
                .ToListAsync();

            var pickWarehouse = pickBin.Rack?.Zone?.Warehouse;
            var isAfterCutoff = IsAfterCutoff(pickWarehouse?.CutoffTime);

            var candidateList = reserveCandidates
                .Where(i => i.Bin is not null && i.Bin.Rack?.Zone?.Warehouse is not null)
                .Select(i => new
                {
                    Inventory = i,
                    Warehouse = i.Bin!.Rack!.Zone!.Warehouse!,
                    DistanceKm = ComputeDistanceKm(pickWarehouse, i.Bin!.Rack!.Zone!.Warehouse!)
                })
                .Where(x => !isAfterCutoff || x.DistanceKm <= AfterCutoffMaxDistanceKm)
                .OrderBy(x => x.DistanceKm)
                .ThenByDescending(x => x.Inventory.QtyOnHand - x.Inventory.QtyReserved)
                .ThenBy(x => x.Inventory.Bin!.Code)
                .ToList();

            Warehouse? selectedSourceWarehouse = null;
            Inventory? reserveCandidate = null;
            foreach (var candidate in candidateList)
            {
                var atCapacity = await IsAtDailyCapacityAsync(candidate.Warehouse, capacityLoadByWarehouse, now);
                if (atCapacity)
                    continue;

                selectedSourceWarehouse = candidate.Warehouse;
                reserveCandidate = candidate.Inventory;
                break;
            }

            if (reserveCandidate is null || reserveCandidate.Bin is null || reserveCandidate.Bin.Rack?.Zone?.Warehouse is null)
                continue;

            var reserveAvailable = reserveCandidate.QtyOnHand - reserveCandidate.QtyReserved;
            var transferQty = Math.Min(qtyNeeded, reserveAvailable);
            if (transferQty <= 0)
                continue;

            created.Add(new WarehouseTask
            {
                TaskNo = string.Empty,
                Type = WarehouseTaskType.Replenishment,
                Status = WarehouseTaskStatus.Open,
                ProductId = pair.ProductId,
                FromBinId = reserveCandidate.BinId,
                ToBinId = pair.PickBinId,
                Quantity = transferQty,
                Reference = sourceReference,
                Note = $"Rimbushje automatike: pick-bin nen prag ({availableInPick:0.##}/{threshold:0.##}), burimi {reserveCandidate.Bin.Rack.Zone.Warehouse.Code}{(isAfterCutoff ? " (pas cutoff)" : string.Empty)}.",
                CreatedAt = now
            });

            var sourceWarehouseId = selectedSourceWarehouse?.Id ?? reserveCandidate.Bin.Rack.Zone.WarehouseId;
            if (capacityLoadByWarehouse.ContainsKey(sourceWarehouseId))
                capacityLoadByWarehouse[sourceWarehouseId]++;
            else
                capacityLoadByWarehouse[sourceWarehouseId] = 1;
        }

        if (created.Count == 0) return 0;
        await SaveNewTasksWithRetryAsync(created);
        return created.Count;
    }

    private async Task SaveNewTasksWithRetryAsync(List<WarehouseTask> tasks)
    {
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            var taskNos = await AllocateTaskNosAsync(tasks.Count);
            for (var i = 0; i < tasks.Count; i++)
                tasks[i].TaskNo = taskNos[i];

            try
            {
                if (attempt == 1)
                    _db.WarehouseTasks.AddRange(tasks);

                await _db.SaveChangesAsync();
                return;
            }
            catch (DbUpdateException ex) when (IsDuplicateTaskNo(ex) && attempt < 3)
            {
                foreach (var entry in ex.Entries)
                    entry.State = EntityState.Added;
            }
        }

        throw new InvalidOperationException("Nuk u gjeneruan dot TaskNo unike per replenishment.");
    }

    private async Task<List<string>> AllocateTaskNosAsync(int count)
    {
        var latest = await _db.WarehouseTasks
            .AsNoTracking()
            .OrderByDescending(x => x.TaskNo)
            .Select(x => x.TaskNo)
            .FirstOrDefaultAsync();

        var next = 1;
        if (!string.IsNullOrWhiteSpace(latest) &&
            latest.StartsWith("VEP-", StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(latest[4..], out var parsed) &&
            parsed >= 0)
        {
            next = parsed + 1;
        }

        var result = new List<string>(count);
        for (var i = 0; i < count; i++)
            result.Add($"VEP-{(next + i):D6}");

        return result;
    }

    private static bool IsDuplicateTaskNo(DbUpdateException ex)
    {
        return ex.InnerException is SqlException sqlEx &&
               (sqlEx.Number == 2601 || sqlEx.Number == 2627);
    }

    private static decimal ComputeDistanceKm(Warehouse? from, Warehouse? to)
    {
        if (from is null || to is null)
            return decimal.MaxValue;

        if (!from.Latitude.HasValue || !from.Longitude.HasValue || !to.Latitude.HasValue || !to.Longitude.HasValue)
            return decimal.MaxValue;

        var lat1 = DegreesToRadians((double)from.Latitude.Value);
        var lon1 = DegreesToRadians((double)from.Longitude.Value);
        var lat2 = DegreesToRadians((double)to.Latitude.Value);
        var lon2 = DegreesToRadians((double)to.Longitude.Value);

        var dLat = lat2 - lat1;
        var dLon = lon2 - lon1;
        var a = Math.Pow(Math.Sin(dLat / 2), 2) +
                Math.Cos(lat1) * Math.Cos(lat2) * Math.Pow(Math.Sin(dLon / 2), 2);
        var c = 2 * Math.Asin(Math.Min(1, Math.Sqrt(a)));
        var distance = 6371d * c;
        return (decimal)distance;
    }

    private static double DegreesToRadians(double degrees) => degrees * (Math.PI / 180d);

    private static bool IsAfterCutoff(TimeSpan? cutoff)
    {
        if (!cutoff.HasValue)
            return false;

        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.Local);
        return nowLocal.TimeOfDay >= cutoff.Value;
    }

    private async Task<bool> IsAtDailyCapacityAsync(Warehouse warehouse, Dictionary<Guid, int> capacityLoadByWarehouse, DateTime nowUtc)
    {
        if (!warehouse.DailyOrderCapacity.HasValue || warehouse.DailyOrderCapacity.Value <= 0)
            return false;

        var warehouseId = warehouse.Id;
        if (!capacityLoadByWarehouse.TryGetValue(warehouseId, out var currentLoad))
        {
            currentLoad = await GetTodayReplenishmentLoadForWarehouseAsync(warehouseId, nowUtc);
            capacityLoadByWarehouse[warehouseId] = currentLoad;
        }

        return currentLoad >= warehouse.DailyOrderCapacity.Value;
    }

    private async Task<int> GetTodayReplenishmentLoadForWarehouseAsync(Guid warehouseId, DateTime nowUtc)
    {
        var (startUtc, endUtc) = GetLocalDayUtcRange(nowUtc);

        return await _db.WarehouseTasks
            .AsNoTracking()
            .Where(t =>
                t.Type == WarehouseTaskType.Replenishment &&
                t.Status != WarehouseTaskStatus.Cancelled &&
                t.FromBinId.HasValue &&
                t.CreatedAt >= startUtc &&
                t.CreatedAt < endUtc)
            .Join(_db.Bins.AsNoTracking(), t => t.FromBinId!.Value, b => b.Id, (t, b) => new { Task = t, Bin = b })
            .Join(_db.Racks.AsNoTracking(), tb => tb.Bin.RackId, r => r.Id, (tb, r) => new { tb.Task, Rack = r })
            .Join(_db.Zones.AsNoTracking(), tr => tr.Rack.ZoneId, z => z.Id, (tr, z) => new { tr.Task, Zone = z })
            .Where(x => x.Zone.WarehouseId == warehouseId)
            .CountAsync();
    }

    private static (DateTime startUtc, DateTime endUtc) GetLocalDayUtcRange(DateTime nowUtc)
    {
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, TimeZoneInfo.Local);
        var localDayStart = localNow.Date;
        var localDayEnd = localDayStart.AddDays(1);
        var startUtc = TimeZoneInfo.ConvertTimeToUtc(localDayStart, TimeZoneInfo.Local);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(localDayEnd, TimeZoneInfo.Local);
        return (startUtc, endUtc);
    }
}
