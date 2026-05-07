using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using System.Security.Claims;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/sales-orders")]
public class SalesOrdersController : ControllerBase
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;

    public SalesOrdersController(SmdDbContext db, AuditLogService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] OrderStatus? status = null, [FromQuery] string? q = null)
    {
        var query = _db.SalesOrders.AsNoTracking().AsQueryable();
        if (status.HasValue) query = query.Where(x => x.Status == status.Value);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(x => x.OrderNo.Contains(term) || (x.Reference != null && x.Reference.Contains(term)) || (x.Customer != null && x.Customer.Name.Contains(term)));
        }

        var items = await query
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .Select(x => new OrderListItemDto(
                x.Id,
                x.OrderNo,
                x.Status.ToString(),
                x.CustomerId,
                x.Customer != null ? x.Customer.Code : null,
                x.Customer != null ? x.Customer.Name : null,
                x.Reference,
                x.Note,
                x.CreatedAt,
                x.Lines.Count,
                x.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail ? l.Product.RetailPrice :
                    l.PriceTier == OutboundPriceTier.Wholesale ? l.Product.WholesalePrice :
                    l.Product.VipPrice)),
                x.OutboundDocumentId))
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var order = await _db.SalesOrders
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new SalesOrderDetailsDto(
                x.Id,
                x.OrderNo,
                x.Status.ToString(),
                (int)x.PriceTier,
                x.CustomerId,
                x.Customer != null ? x.Customer.Code : null,
                x.Customer != null ? x.Customer.Name : null,
                x.Reference,
                x.Note,
                x.RequestedDate,
                x.CreatedAt,
                x.OutboundDocumentId,
                x.Lines.OrderBy(l => l.CreatedAt).Select(l => new SalesOrderLineDto(
                    l.Id,
                    l.ProductId,
                    l.Product.Sku,
                    l.Product.Name,
                    l.FromBinId,
                    l.FromBin.Code,
                    l.LotNumber,
                    l.BatchNumber,
                    l.ExpiryDate,
                    (int)l.PriceTier,
                    l.Quantity,
                    l.ReservedQuantity,
                    l.PriceTier == OutboundPriceTier.Retail ? l.Product.RetailPrice :
                    l.PriceTier == OutboundPriceTier.Wholesale ? l.Product.WholesalePrice :
                    l.Product.VipPrice,
                    l.Quantity * (l.PriceTier == OutboundPriceTier.Retail ? l.Product.RetailPrice :
                        l.PriceTier == OutboundPriceTier.Wholesale ? l.Product.WholesalePrice :
                        l.Product.VipPrice))).ToList()))
            .FirstOrDefaultAsync();

        return order is null ? NotFound("Sales order nuk u gjet.") : Ok(order);
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateSalesOrderRequest req)
    {
        if (!req.RequestedDate.HasValue)
            return BadRequest("Data eshte e detyrueshme.");

        if (req.CustomerId.HasValue && !await _db.Customers.AnyAsync(x => x.Id == req.CustomerId.Value && x.IsActive))
            return BadRequest("Klienti nuk ekziston ose nuk eshte aktiv.");
        var priceTier = Enum.IsDefined(typeof(OutboundPriceTier), req.PriceTier ?? 0) ? (OutboundPriceTier)(req.PriceTier ?? 0) : OutboundPriceTier.Retail;
        var order = new SalesOrder
        {
            OrderNo = await NextSalesOrderNoAsync(),
            Status = OrderStatus.Draft,
            PriceTier = priceTier,
            CustomerId = req.CustomerId,
            Reference = Normalize(req.Reference),
            Note = Normalize(req.Note),
            RequestedDate = req.RequestedDate?.Date
        };
        _db.SalesOrders.Add(order);
        await _db.SaveChangesAsync();
        await _audit.WriteAsync("CREATE_SALES_ORDER", "SalesOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}");
        return CreatedAtAction(nameof(Get), new { id = order.Id }, new { order.Id, order.OrderNo });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/lines")]
    public async Task<IActionResult> AddLine(Guid id, [FromBody] AddSalesOrderLineRequest req)
    {
        var order = await _db.SalesOrders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Draft) return BadRequest("Rreshtat mund te ndryshohen vetem ne Draft.");
        if (req.Quantity <= 0) return BadRequest("Sasia duhet te jete me e madhe se 0.");
        if (decimal.Truncate(req.Quantity) != req.Quantity) return BadRequest("Sasia duhet te jete numer i plote.");

        var inventory = await _db.Inventories
            .Include(x => x.Product)
            .FirstOrDefaultAsync(x => x.Id == req.InventoryId);
        if (inventory is null) return BadRequest("Rreshti i inventarit nuk u gjet.");
        var available = inventory.QtyOnHand - inventory.QtyReserved;
        if (available <= 0) return BadRequest("Ky rresht inventari nuk ka sasi te disponueshme per rezervim.");

        var priceTier = order.PriceTier;
        if (req.PriceTier.HasValue && Enum.IsDefined(typeof(OutboundPriceTier), req.PriceTier.Value))
            priceTier = (OutboundPriceTier)req.PriceTier.Value;

        var existing = await _db.SalesOrderLines.FirstOrDefaultAsync(x =>
            x.SalesOrderId == id &&
            x.ProductId == inventory.ProductId &&
            x.FromBinId == inventory.BinId &&
            x.LotNumber == inventory.LotNumber &&
            x.BatchNumber == inventory.BatchNumber &&
            x.ExpiryDate == inventory.ExpiryDate &&
            x.PriceTier == priceTier);
        var requestedTotal = req.Quantity + (existing?.Quantity ?? 0);
        if (requestedTotal > available)
        {
            return BadRequest($"Sasia nuk mjafton per {inventory.Product.Sku} - {inventory.Product.Name}. Te disponueshme: {available}.");
        }

        if (existing is not null)
        {
            existing.Quantity += req.Quantity;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.SalesOrderLines.Add(new SalesOrderLine
            {
                SalesOrderId = id,
                ProductId = inventory.ProductId,
                FromBinId = inventory.BinId,
                LotNumber = inventory.LotNumber,
                BatchNumber = inventory.BatchNumber,
                ExpiryDate = inventory.ExpiryDate,
                PriceTier = priceTier,
                Quantity = req.Quantity,
                ReservedQuantity = 0
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { order.Id });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpDelete("{id:guid}/lines/{lineId:guid}")]
    public async Task<IActionResult> DeleteLine(Guid id, Guid lineId)
    {
        var order = await _db.SalesOrders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Draft) return BadRequest("Rreshtat mund te fshihen vetem ne Draft.");
        var line = await _db.SalesOrderLines.FirstOrDefaultAsync(x => x.Id == lineId && x.SalesOrderId == id);
        if (line is null) return NotFound();
        _db.SalesOrderLines.Remove(line);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "CanConfirmDocuments")]
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id)
    {
        var order = await _db.SalesOrders
            .Include(x => x.Lines)
            .ThenInclude(x => x.Product)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Draft) return BadRequest("Vetem Draft mund te konfirmohet.");
        if (!order.Lines.Any()) return BadRequest("Order-i duhet te kete se paku 1 rresht.");

        await using var tx = await _db.Database.BeginTransactionAsync();
        foreach (var line in order.Lines)
        {
            var inventory = await FindInventoryForLine(line);
            if (inventory is null)
            {
                await tx.RollbackAsync();
                return BadRequest("Mungon inventari per nje nga rreshtat.");
            }
            var available = inventory.QtyOnHand - inventory.QtyReserved;
            if (line.Quantity > available)
            {
                await tx.RollbackAsync();
                return BadRequest($"Sasia nuk mjafton per {line.Product.Sku} - {line.Product.Name}. Te disponueshme: {available}.");
            }
            inventory.QtyReserved += line.Quantity;
            inventory.UpdatedAt = DateTime.UtcNow;
            line.ReservedQuantity = line.Quantity;
            line.UpdatedAt = DateTime.UtcNow;
        }

        order.Status = OrderStatus.Confirmed;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        await _audit.WriteAsync("CONFIRM_SALES_ORDER", "SalesOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}");
        return Ok(new { order.Id, order.Status });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var order = await _db.SalesOrders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status == OrderStatus.Fulfilled) return BadRequest("Order i kthyer ne dokument nuk mund te anulohet.");
        await using var tx = await _db.Database.BeginTransactionAsync();
        if (order.Status == OrderStatus.Confirmed)
        {
            foreach (var line in order.Lines.Where(x => x.ReservedQuantity > 0))
            {
                var inventory = await FindInventoryForLine(line);
                if (inventory is not null)
                {
                    inventory.QtyReserved = Math.Max(0, inventory.QtyReserved - line.ReservedQuantity);
                    inventory.UpdatedAt = DateTime.UtcNow;
                }
                line.ReservedQuantity = 0;
            }
        }

        order.Status = OrderStatus.Cancelled;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        await _audit.WriteAsync("CANCEL_SALES_ORDER", "SalesOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}");
        return Ok(new { order.Id, order.Status });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/create-outbound")]
    public async Task<IActionResult> CreateOutbound(Guid id)
    {
        var order = await _db.SalesOrders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Confirmed) return BadRequest("Vetem porosi e shitjes e konfirmuar mund te kthehet ne dalje.");
        if (order.OutboundDocumentId.HasValue) return Conflict("Ky order ka dokument dalje te krijuar.");

        var outbound = new OutboundDocument
        {
            DocumentNo = await NextOutboundNoAsync(),
            Status = DocumentStatus.Draft,
            PriceTier = order.PriceTier,
            CustomerId = order.CustomerId,
            Reference = order.OrderNo,
            Note = string.IsNullOrWhiteSpace(order.Note) ? "Krijuar nga porosi e shitjes" : order.Note
        };

        foreach (var line in order.Lines)
        {
            outbound.Lines.Add(new OutboundDocumentLine
            {
                ProductId = line.ProductId,
                FromBinId = line.FromBinId,
                LotNumber = line.LotNumber,
                BatchNumber = line.BatchNumber,
                ExpiryDate = line.ExpiryDate,
                PriceTier = line.PriceTier,
                Quantity = line.Quantity,
                ReservedQuantity = line.ReservedQuantity
            });
        }

        _db.OutboundDocuments.Add(outbound);
        order.OutboundDocumentId = outbound.Id;
        order.Status = OrderStatus.Fulfilled;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.WriteAsync("CREATE_OUTBOUND_FROM_SALES_ORDER", "SalesOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}, Outbound={outbound.DocumentNo}");
        return Ok(new { outbound.Id, outbound.DocumentNo });
    }

    private async Task<Inventory?> FindInventoryForLine(SalesOrderLine line)
    {
        return await _db.Inventories.FirstOrDefaultAsync(i =>
            i.BinId == line.FromBinId &&
            i.ProductId == line.ProductId &&
            i.LotNumber == line.LotNumber &&
            i.BatchNumber == line.BatchNumber &&
            i.ExpiryDate == line.ExpiryDate);
    }

    private async Task<string> NextSalesOrderNoAsync()
    {
        var next = await _db.SalesOrders.CountAsync() + 1;
        var no = $"PS-{next:D6}";
        while (await _db.SalesOrders.AnyAsync(x => x.OrderNo == no))
        {
            next++;
            no = $"PS-{next:D6}";
        }
        return no;
    }

    private async Task<string> NextOutboundNoAsync()
    {
        var next = await _db.OutboundDocuments.CountAsync() + 1;
        var no = $"OUT-{next:D6}";
        while (await _db.OutboundDocuments.AnyAsync(x => x.DocumentNo == no))
        {
            next++;
            no = $"OUT-{next:D6}";
        }
        return no;
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public record CreateSalesOrderRequest(Guid? CustomerId, int? PriceTier, string? Reference, string? Note, DateTime? RequestedDate);
public record AddSalesOrderLineRequest(Guid InventoryId, decimal Quantity, int? PriceTier);
public record SalesOrderDetailsDto(Guid Id, string OrderNo, string Status, int PriceTier, Guid? CustomerId, string? CustomerCode, string? CustomerName, string? Reference, string? Note, DateTime? RequestedDate, DateTime CreatedAt, Guid? OutboundDocumentId, List<SalesOrderLineDto> Lines);
public record SalesOrderLineDto(Guid Id, Guid ProductId, string ProductSku, string ProductName, Guid FromBinId, string FromBinCode, string? LotNumber, string? BatchNumber, DateTime? ExpiryDate, int PriceTier, decimal Quantity, decimal ReservedQuantity, decimal UnitPrice, decimal LineTotal);
