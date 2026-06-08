using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.API.Contracts.CycleCounts;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/cycle-counts")]
public class CycleCountsController : ControllerBase
{
    private const int MaxLinesPerCount = 500;

    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;

    public CycleCountsController(SmdDbContext db, AuditLogService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] CycleCountStatus? status = null)
    {
        var q = _db.CycleCounts
            .AsNoTracking()
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Bin)
                    .ThenInclude(x => x.Rack)
                        .ThenInclude(x => x.Zone)
                            .ThenInclude(x => x.Warehouse)
            .AsQueryable();

        if (status.HasValue)
            q = q.Where(x => x.Status == status.Value);

        var rows = await q
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .ToListAsync();

        return Ok(rows.Select(ToListDto).ToList());
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCycleCountRequest req)
    {
        var inventoryQuery = _db.Inventories
            .Include(i => i.Product)
            .Include(i => i.Bin)
                .ThenInclude(b => b.Rack)
                    .ThenInclude(r => r.Zone)
                        .ThenInclude(z => z.Warehouse)
            .Where(i => i.Product.IsActive && i.Bin.IsActive)
            .AsQueryable();

        if (req.WarehouseId.HasValue)
            inventoryQuery = inventoryQuery.Where(i => i.Bin.Rack.Zone.WarehouseId == req.WarehouseId.Value);

        if (req.ZoneId.HasValue)
            inventoryQuery = inventoryQuery.Where(i => i.Bin.Rack.ZoneId == req.ZoneId.Value);

        if (req.RackId.HasValue)
            inventoryQuery = inventoryQuery.Where(i => i.Bin.RackId == req.RackId.Value);

        if (req.BinId.HasValue)
            inventoryQuery = inventoryQuery.Where(i => i.BinId == req.BinId.Value);

        if (req.ProductId.HasValue)
            inventoryQuery = inventoryQuery.Where(i => i.ProductId == req.ProductId.Value);

        if (req.OnlyWithStock)
            inventoryQuery = inventoryQuery.Where(i => i.QtyOnHand > 0 || i.QtyReserved > 0);

        var rows = await inventoryQuery
            .OrderBy(i => i.Bin.Rack.Zone.Warehouse.Code)
            .ThenBy(i => i.Bin.Rack.Zone.Code)
            .ThenBy(i => i.Bin.Rack.Code)
            .ThenBy(i => i.Bin.Code)
            .ThenBy(i => i.Product.Sku)
            .Take(MaxLinesPerCount + 1)
            .ToListAsync();

        if (rows.Count == 0)
            return BadRequest("Nuk u gjet asnje rresht inventari per numerim.");

        if (rows.Count > MaxLinesPerCount)
            return BadRequest($"Ky numerim ka me shume se {MaxLinesPerCount} rreshta. Zgjidh nje shporte, produkt ose lokacion tjeter.");

        var count = new CycleCount
        {
            CountNo = await NextCycleCountNoAsync(),
            Status = CycleCountStatus.Draft,
            WarehouseId = req.WarehouseId,
            ZoneId = req.ZoneId,
            RackId = req.RackId,
            BinId = req.BinId,
            ProductId = req.ProductId,
            Reference = NormalizeText(req.Reference),
            Note = NormalizeText(req.Note),
            CreatedAt = DateTime.UtcNow
        };

        foreach (var row in rows)
        {
            count.Lines.Add(new CycleCountLine
            {
                InventoryId = row.Id,
                ProductId = row.ProductId,
                BinId = row.BinId,
                LotNumber = row.LotNumber,
                BatchNumber = row.BatchNumber,
                ExpiryDate = row.ExpiryDate,
                ExpectedQty = row.QtyOnHand,
                ReservedQty = row.QtyReserved
            });
        }

        _db.CycleCounts.Add(count);
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CREATE_CYCLE_COUNT", "CycleCount", count.Id.ToString(), $"CountNo={count.CountNo}, Lines={count.Lines.Count}");

        var detail = await BuildDetailDtoAsync(count.Id);
        return Ok(detail);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var detail = await BuildDetailDtoAsync(id);
        return detail is null ? NotFound("Numerimi nuk u gjet.") : Ok(detail);
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPut("{id:guid}/lines/{lineId:guid}")]
    public async Task<IActionResult> UpdateLine(Guid id, Guid lineId, [FromBody] UpdateCycleCountLineRequest req)
    {
        if (req.CountedQty.HasValue && req.CountedQty.Value < 0)
            return BadRequest("Sasia e numeruar nuk mund te jete negative.");
        if (req.CountedQty.HasValue && req.CountedQty.Value != decimal.Truncate(req.CountedQty.Value))
            return BadRequest("Sasia e numeruar duhet te jete numer i plote.");

        var count = await _db.CycleCounts
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (count is null)
            return NotFound("Numerimi nuk u gjet.");

        if (count.Status != CycleCountStatus.Draft)
            return BadRequest("Mund te ndryshosh vetem numrimet qe jane draft.");

        var line = count.Lines.FirstOrDefault(x => x.Id == lineId);
        if (line is null)
            return NotFound("Rreshti i numerimit nuk u gjet.");

        line.CountedQty = req.CountedQty;
        line.Note = NormalizeText(req.Note);
        line.UpdatedAt = DateTime.UtcNow;
        count.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var detail = await BuildDetailDtoAsync(id);
        return Ok(detail);
    }

    [Authorize(Policy = "CanConfirmDocuments")]
    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();

        var count = await _db.CycleCounts
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Bin)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (count is null)
            return NotFound("Numerimi nuk u gjet.");

        if (count.Status != CycleCountStatus.Draft)
            return BadRequest("Vetem numerimet draft mund te perfundohen.");

        if (count.Lines.Count == 0)
            return BadRequest("Numerimi nuk ka rreshta.");

        var missing = count.Lines.FirstOrDefault(x => !x.CountedQty.HasValue);
        if (missing is not null)
            return BadRequest($"Ploteso sasine e numeruar per produktin {missing.Product.Sku} ne shporten {missing.Bin.Code}.");

        var inventoryIds = count.Lines.Select(x => x.InventoryId).Distinct().ToList();
        var inventoryMap = await _db.Inventories
            .Where(x => inventoryIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id);

        foreach (var line in count.Lines)
        {
            if (!inventoryMap.TryGetValue(line.InventoryId, out var inventory))
                return BadRequest($"Rreshti i inventarit per {line.Product.Sku} ne {line.Bin.Code} nuk ekziston me.");

            var countedQty = line.CountedQty!.Value;
            if (countedQty != decimal.Truncate(countedQty))
                return BadRequest($"Sasia e numeruar per {line.Product.Sku} duhet te jete numer i plote.");

            if (countedQty < inventory.QtyReserved)
            {
                return BadRequest(
                    $"Sasia e numeruar per {line.Product.Sku} ne {line.Bin.Code} nuk mund te jete me e vogel se sasia e rezervuar ({inventory.QtyReserved:0.##}).");
            }

            var delta = countedQty - inventory.QtyOnHand;
            if (delta == 0)
                continue;

            inventory.QtyOnHand = countedQty;
            inventory.UpdatedAt = DateTime.UtcNow;

            _db.StockMovements.Add(new StockMovement
            {
                Type = StockMovementType.ADJUST,
                ProductId = line.ProductId,
                FromBinId = line.BinId,
                ToBinId = line.BinId,
                Quantity = Math.Abs(delta),
                Reference = count.CountNo,
                Note = $"Numerim inventari {count.CountNo}: delta {delta:0.##}, inventar {line.ExpectedQty:0.##}, numeruar {countedQty:0.##}",
                PerformedByUserId = GetUserIdOrNull()
            });
        }

        count.Status = CycleCountStatus.Completed;
        count.CompletedAt = DateTime.UtcNow;
        count.CompletedByUserId = GetUserIdOrNull();
        count.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        await _audit.WriteAsync("COMPLETE_CYCLE_COUNT", "CycleCount", count.Id.ToString(), $"CountNo={count.CountNo}");

        var detail = await BuildDetailDtoAsync(id);
        return Ok(detail);
    }

    [Authorize(Policy = "CanConfirmDocuments")]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var count = await _db.CycleCounts.FirstOrDefaultAsync(x => x.Id == id);
        if (count is null)
            return NotFound("Numerimi nuk u gjet.");

        if (count.Status != CycleCountStatus.Draft)
            return BadRequest("Vetem numerimet draft mund te anulohen.");

        count.Status = CycleCountStatus.Cancelled;
        count.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CANCEL_CYCLE_COUNT", "CycleCount", count.Id.ToString(), $"CountNo={count.CountNo}");

        var detail = await BuildDetailDtoAsync(id);
        return Ok(detail);
    }

    private async Task<string> NextCycleCountNoAsync()
    {
        var next = await _db.CycleCounts.CountAsync() + 1;
        var countNo = $"NR-{next:D6}";

        while (await _db.CycleCounts.AnyAsync(x => x.CountNo == countNo))
        {
            next++;
            countNo = $"NR-{next:D6}";
        }

        return countNo;
    }

    private async Task<CycleCountDetailDto?> BuildDetailDtoAsync(Guid id)
    {
        var count = await _db.CycleCounts
            .AsNoTracking()
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Bin)
                    .ThenInclude(x => x.Rack)
                        .ThenInclude(x => x.Zone)
                            .ThenInclude(x => x.Warehouse)
            .FirstOrDefaultAsync(x => x.Id == id);

        return count is null ? null : ToDetailDto(count);
    }

    private static CycleCountListItemDto ToListDto(CycleCount count)
    {
        var lines = count.Lines.ToList();
        var countedQty = lines.Sum(x => x.CountedQty ?? 0);
        var expectedQty = lines.Sum(x => x.ExpectedQty);

        return new CycleCountListItemDto
        {
            Id = count.Id,
            CountNo = count.CountNo,
            Status = count.Status.ToString(),
            Reference = count.Reference,
            Note = count.Note,
            ScopeLabel = BuildScopeLabel(count),
            LineCount = lines.Count,
            CountedLineCount = lines.Count(x => x.CountedQty.HasValue),
            ExpectedQty = expectedQty,
            CountedQty = countedQty,
            VarianceQty = countedQty - expectedQty,
            CreatedAt = count.CreatedAt,
            CompletedAt = count.CompletedAt
        };
    }

    private static CycleCountDetailDto ToDetailDto(CycleCount count)
    {
        var lines = count.Lines
            .OrderBy(x => x.Bin.Rack.Zone.Warehouse.Code)
            .ThenBy(x => x.Bin.Rack.Zone.Code)
            .ThenBy(x => x.Bin.Rack.Code)
            .ThenBy(x => x.Bin.Code)
            .ThenBy(x => x.Product.Sku)
            .Select(ToLineDto)
            .ToList();

        var countedQty = lines.Sum(x => x.CountedQty ?? 0);
        var expectedQty = lines.Sum(x => x.ExpectedQty);

        return new CycleCountDetailDto
        {
            Id = count.Id,
            CountNo = count.CountNo,
            Status = count.Status.ToString(),
            Reference = count.Reference,
            Note = count.Note,
            ScopeLabel = BuildScopeLabel(count),
            CreatedAt = count.CreatedAt,
            CompletedAt = count.CompletedAt,
            LineCount = lines.Count,
            CountedLineCount = lines.Count(x => x.CountedQty.HasValue),
            ExpectedQty = expectedQty,
            CountedQty = countedQty,
            VarianceQty = countedQty - expectedQty,
            Lines = lines
        };
    }

    private static CycleCountLineDto ToLineDto(CycleCountLine line)
    {
        return new CycleCountLineDto
        {
            Id = line.Id,
            InventoryId = line.InventoryId,
            ProductId = line.ProductId,
            ProductSku = line.Product.Sku,
            ProductName = line.Product.Name,
            ProductBarcode = line.Product.Barcode,
            BinId = line.BinId,
            BinCode = line.Bin.Code,
            BinName = line.Bin.Name,
            RackCode = line.Bin.Rack.Code,
            ZoneCode = line.Bin.Rack.Zone.Code,
            WarehouseCode = line.Bin.Rack.Zone.Warehouse.Code,
            LotNumber = line.LotNumber,
            BatchNumber = line.BatchNumber,
            ExpiryDate = line.ExpiryDate,
            ExpectedQty = line.ExpectedQty,
            ReservedQty = line.ReservedQty,
            CountedQty = line.CountedQty,
            VarianceQty = (line.CountedQty ?? 0) - line.ExpectedQty,
            Note = line.Note
        };
    }

    private static string BuildScopeLabel(CycleCount count)
    {
        var first = count.Lines.FirstOrDefault();
        if (first is null) return "Pa rreshta";

        if (count.BinId.HasValue)
            return $"Shporta {first.Bin.Code}";

        if (count.RackId.HasValue)
            return $"Rafti {first.Bin.Rack.Code}";

        if (count.ZoneId.HasValue)
            return $"Zona {first.Bin.Rack.Zone.Code}";

        if (count.WarehouseId.HasValue)
            return $"Depoja {first.Bin.Rack.Zone.Warehouse.Code}";

        if (count.ProductId.HasValue)
            return $"Produkti {first.Product.Sku}";

        return "Gjithe inventari";
    }

    private Guid? GetUserIdOrNull()
    {
        var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(s, out var id) ? id : null;
    }

    private static string? NormalizeText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
