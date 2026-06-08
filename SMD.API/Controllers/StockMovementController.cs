using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using System.Security.Claims;
using SMD.API.Contracts.StockMovements;

namespace SMD.API.Controllers;

//[Authorize(Policy = "CanMoveStockDirectly")]
[Authorize]
[ApiController]
[Route("api/stock-movements")]
public class StockMovementsController : ControllerBase
{
    private readonly SmdDbContext _db;
    public StockMovementsController(SmdDbContext db) => _db = db;

    /*
    // QUERY (audit trail)
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] Guid? productId, [FromQuery] Guid? binId, [FromQuery] StockMovementType? type)
    {
        var q = _db.StockMovements.AsQueryable();

        if (productId.HasValue) q = q.Where(x => x.ProductId == productId.Value);
        if (type.HasValue) q = q.Where(x => x.Type == type.Value);

        if (binId.HasValue)
        {
            var id = binId.Value;
            q = q.Where(x => x.FromBinId == id || x.ToBinId == id);
        }

        var items = await q
            .OrderByDescending(x => x.CreatedAt)
            .Take(200)
            .Select(x => new
            {
                x.Id,
                x.Type,
                x.ProductId,
                ProductSku = x.Product.Sku,
                x.FromBinId,
                x.ToBinId,
                x.Quantity,
                x.Reference,
                x.Note,
                x.PerformedByUserId,
                x.CreatedAt
            })
            .ToListAsync();

        return Ok(items);
    }
    */

    [HttpGet]
    public async Task<IActionResult> Get(
    [FromQuery] Guid? productId,
    [FromQuery] Guid? binId,
    [FromQuery] StockMovementType? type,
    [FromQuery] DateTime? from,
    [FromQuery] DateTime? to,
    [FromQuery] int skip = 0,
    [FromQuery] int take = 200,
    [FromQuery] bool paged = false
)
    {
        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, 500);

        var q = _db.StockMovements.AsQueryable();

        if (productId.HasValue) q = q.Where(x => x.ProductId == productId.Value);
        if (type.HasValue) q = q.Where(x => x.Type == type.Value);

        if (binId.HasValue)
        {
            var id = binId.Value;
            q = q.Where(x => x.FromBinId == id || x.ToBinId == id);
        }

        if (from.HasValue) q = q.Where(x => x.CreatedAt >= from.Value);
        if (to.HasValue) q = q.Where(x => x.CreatedAt <= to.Value);

        // LEFT JOIN për Bins (që të marrim Code pa pasur navigation properties)
        var query =
            from m in q
            join fb in _db.Bins on m.FromBinId equals fb.Id into fbg
            from fb in fbg.DefaultIfEmpty()
            join tb in _db.Bins on m.ToBinId equals tb.Id into tbg
            from tb in tbg.DefaultIfEmpty()
            orderby m.CreatedAt descending
            select new
            {
                m.Id,
                m.Type,
                m.ProductId,
                ProductSku = m.Product.Sku,
                ProductName = m.Product.Name,
                m.FromBinId,
                FromBinCode = fb != null ? fb.Code : null,
                m.ToBinId,
                ToBinCode = tb != null ? tb.Code : null,
                m.Quantity,
                m.Reference,
                m.Note,
                m.PerformedByUserId,
                m.CreatedAt
            };
        /*
        select new
        {
            m.Id,
            m.Type,
            m.ProductId,
            ProductSku = m.Product.Sku,
            m.FromBinId,
            FromBinCode = fb != null ? fb.Code : null,
            m.ToBinId,
            ToBinCode = tb != null ? tb.Code : null,
            m.Quantity,
            m.Reference,
            m.Note,
            m.PerformedByUserId,
            m.CreatedAt
        };
        */
        if (!paged)
        {
            // Legacy behavior (as today): max 200
            var itemsLegacy = await query.Take(200).ToListAsync();
            return Ok(itemsLegacy);
        }

        var total = await query.CountAsync();
        var items = await query.Skip(skip).Take(take).ToListAsync();
        return Ok(new { total, items });
    }

    // COMMANDS
    // IN: shto stok në një Bin
    [Authorize(Policy = "CanMoveStockDirectly")]
    [HttpPost("in")]
    public async Task<IActionResult> StockIn([FromBody] StockInRequest req)
    {
        if (req.Quantity <= 0) return BadRequest("Sasia duhet te jete me e madhe se 0.");
        if (!IsWholeNumber(req.Quantity)) return BadRequest("Sasia duhet te jete numer i plote.");

        var userId = GetUserIdOrNull();

        // verifikime
        if (!await _db.Products.AnyAsync(p => p.Id == req.ProductId)) return NotFound("Produkti nuk u gjet.");
        if (!await _db.Bins.AnyAsync(b => b.Id == req.ToBinId)) return NotFound("Shporta ku duhet të vendoset produkti nuk u gjet.");

        await using var tx = await _db.Database.BeginTransactionAsync();

        // Inventory upsert (ToBin, Product)
        var inv = await GetOrCreateInventory(req.ToBinId, req.ProductId);
        inv.QtyOnHand += req.Quantity;
        inv.UpdatedAt = DateTime.UtcNow;

        // Movement record
        var m = new StockMovement
        {
            Type = StockMovementType.IN,
            ProductId = req.ProductId,
            FromBinId = null,
            ToBinId = req.ToBinId,
            Quantity = req.Quantity,
            Reference = req.Reference?.Trim(),
            Note = req.Note?.Trim(),
            PerformedByUserId = userId
        };

        _db.StockMovements.Add(m);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { m.Id });
    }

    // OUT: hiq stok nga një Bin (nuk lejon nën 0 dhe nuk lejon të prishë reserved)
    [Authorize(Policy = "CanMoveStockDirectly")]
    [HttpPost("out")]
    public async Task<IActionResult> StockOut([FromBody] StockOutRequest req)
    {
        if (req.Quantity <= 0) return BadRequest("Sasia duhet te jete me e madhe se 0.");
        if (!IsWholeNumber(req.Quantity)) return BadRequest("Sasia duhet te jete numer i plote.");

        var userId = GetUserIdOrNull();

        if (!await _db.Products.AnyAsync(p => p.Id == req.ProductId)) return NotFound("Produkti nuk u gjet.");
        if (!await _db.Bins.AnyAsync(b => b.Id == req.FromBinId)) return NotFound("Shporta nga e cila duhet të vendoest produkti nuk u gjet.");

        await using var tx = await _db.Database.BeginTransactionAsync();

        var inv = await _db.Inventories
            .FirstOrDefaultAsync(i => i.BinId == req.FromBinId && i.ProductId == req.ProductId);

        if (inv == null) return NotFound("Produkti nuk u gjet brenda ne inventar.");
        var newOnHand = inv.QtyOnHand - req.Quantity;
        if (newOnHand < 0) return BadRequest("Sasia e disponueshme nuk mund të shkojë nën 0.");
        if (inv.QtyReserved > newOnHand) return BadRequest("Sasia e rezervuar do bëhej më e madhe se sasia e disponueshme!");

        inv.QtyOnHand = newOnHand;
        inv.UpdatedAt = DateTime.UtcNow;

        var m = new StockMovement
        {
            Type = StockMovementType.OUT,
            ProductId = req.ProductId,
            FromBinId = req.FromBinId,
            ToBinId = null,
            Quantity = req.Quantity,
            Reference = req.Reference?.Trim(),
            Note = req.Note?.Trim(),
            PerformedByUserId = userId
        };

        _db.StockMovements.Add(m);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { m.Id });
    }

    // TRANSFER: nga një Bin në një Bin tjetër
    [Authorize(Policy = "CanMoveStockDirectly")]
    [HttpPost("transfer")]
    public async Task<IActionResult> Transfer([FromBody] StockTransferRequest req)
    {
        if (req.Quantity <= 0) return BadRequest("Sasia duhet te jete me e madhe se 0.");
        if (!IsWholeNumber(req.Quantity)) return BadRequest("Sasia duhet te jete numer i plote.");
        if (req.FromBinId == req.ToBinId) return BadRequest("Shporta nga e cila merret dhe shporta tek e cila vendoset produkti nuk mund të jenë njësoj.");

        var userId = GetUserIdOrNull();

        if (!await _db.Products.AnyAsync(p => p.Id == req.ProductId)) return NotFound("Produkti nuk u gjet.");
        if (!await _db.Bins.AnyAsync(b => b.Id == req.FromBinId)) return NotFound("Shporta nga e cila duhet të merret produkti nuk u gjet.");
        if (!await _db.Bins.AnyAsync(b => b.Id == req.ToBinId)) return NotFound("Shporta ku duhet të vendoset produkti nuk u gjet.");

        await using var tx = await _db.Database.BeginTransactionAsync();

        // FROM inventory
        var from = await _db.Inventories
            .FirstOrDefaultAsync(i => i.BinId == req.FromBinId && i.ProductId == req.ProductId);

        if (from == null) return NotFound("Produkti nuk u gjet brenda ne inventar.");

        var newFromOnHand = from.QtyOnHand - req.Quantity;
        if (newFromOnHand < 0) return BadRequest("Sasia e disponueshme nuk mund të shkojë nën 0.");
        if (from.QtyReserved > newFromOnHand) return BadRequest("Sasia e rezervuar aktuale do bëhej më e madhe se sasia e disponueshme pas ndryshimit.");

        from.QtyOnHand = newFromOnHand;
        from.UpdatedAt = DateTime.UtcNow;

        // TO inventory upsert
        var to = await GetOrCreateInventory(req.ToBinId, req.ProductId);
        to.QtyOnHand += req.Quantity;
        to.UpdatedAt = DateTime.UtcNow;

        // Movement record
        var m = new StockMovement
        {
            Type = StockMovementType.TRANSFER,
            ProductId = req.ProductId,
            FromBinId = req.FromBinId,
            ToBinId = req.ToBinId,
            Quantity = req.Quantity,
            Reference = req.Reference?.Trim(),
            Note = req.Note?.Trim(),
            PerformedByUserId = userId
        };

        _db.StockMovements.Add(m);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { m.Id });
    }

    // ADJUST: korrigjim i kontrolluar (audit trail i detyrueshëm)
    [Authorize(Policy = "CanMoveStockDirectly")]
    [HttpPost("adjust")]
    public async Task<IActionResult> Adjust([FromBody] StockAdjustRequest req)
    {
        if (req.QuantityChange == 0) return BadRequest("Sasia e ndryshuar nuk mund të jetë 0.");
        if (!IsWholeNumber(req.QuantityChange)) return BadRequest("Ndryshimi i sasise duhet te jete numer i plote.");
        if (string.IsNullOrWhiteSpace(req.Reason)) return BadRequest("Arsyeja është e detyrueshme të tregohet për ndryshimin që do e bëni.");

        var userId = GetUserIdOrNull();

        if (!await _db.Products.AnyAsync(p => p.Id == req.ProductId)) return NotFound("Produkti nuk u gjet.");
        if (!await _db.Bins.AnyAsync(b => b.Id == req.BinId)) return NotFound("Shporta nuk u gjet");

        await using var tx = await _db.Database.BeginTransactionAsync();

        var inv = await GetOrCreateInventory(req.BinId, req.ProductId);

        var newOnHand = inv.QtyOnHand + req.QuantityChange;
        if (newOnHand < 0) return BadRequest("Sasia e disponueshme nuk mund të shkojë nën 0.");
        if (inv.QtyReserved > newOnHand) return BadRequest("Sasia e rezervuar aktuale do bëhej më e madhe se sasia e disponueshme pas ndryshimit.");

        inv.QtyOnHand = newOnHand;
        inv.UpdatedAt = DateTime.UtcNow;

        var m = new StockMovement
        {
            Type = StockMovementType.ADJUST,
            ProductId = req.ProductId,
            FromBinId = req.BinId,
            ToBinId = req.BinId, // adjust në të njëjtin bin
            Quantity = Math.Abs(req.QuantityChange),
            Reference = req.Reference?.Trim(),
            Note = $"ADJUST ({req.QuantityChange}) – {req.Reason.Trim()}",
            PerformedByUserId = userId
        };

        _db.StockMovements.Add(m);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { m.Id });
    }
    // Helpers
    private Guid? GetUserIdOrNull()
    {
        var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(s, out var id) ? id : null;
    }

    private async Task<Inventory> GetOrCreateInventory(Guid binId, Guid productId)
    {
        var row = await _db.Inventories.FirstOrDefaultAsync(i => i.BinId == binId && i.ProductId == productId);
        if (row != null) return row;

        row = new Inventory
        {
            BinId = binId,
            ProductId = productId,
            QtyOnHand = 0,
            QtyReserved = 0
        };
        _db.Inventories.Add(row);
        await _db.SaveChangesAsync();
        return row;
    }

    private static bool IsWholeNumber(decimal value)
    {
        return decimal.Truncate(value) == value;
    }
}
