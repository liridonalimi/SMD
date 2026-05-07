using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using SMD.Application.Services.Documents;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/purchase-orders")]
public class PurchaseOrdersController : ControllerBase
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;
    private readonly IDocumentNumberService _numbers;

    public PurchaseOrdersController(SmdDbContext db, AuditLogService audit, IDocumentNumberService numbers)
    {
        _db = db;
        _audit = audit;
        _numbers = numbers;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] OrderStatus? status = null, [FromQuery] string? q = null)
    {
        var query = _db.PurchaseOrders.AsNoTracking().AsQueryable();
        if (status.HasValue) query = query.Where(x => x.Status == status.Value);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(x => x.OrderNo.Contains(term) || (x.Reference != null && x.Reference.Contains(term)) || (x.Supplier != null && x.Supplier.Name.Contains(term)));
        }

        var items = await query
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .Select(x => new OrderListItemDto(
                x.Id,
                x.OrderNo,
                x.Status.ToString(),
                x.SupplierId,
                x.Supplier != null ? x.Supplier.Code : null,
                x.Supplier != null ? x.Supplier.Name : null,
                x.Reference,
                x.Note,
                x.CreatedAt,
                x.Lines.Count,
                x.Lines.Sum(l => l.Quantity * l.UnitPrice),
                x.InboundDocumentId))
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var order = await _db.PurchaseOrders
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new PurchaseOrderDetailsDto(
                x.Id,
                x.OrderNo,
                x.Status.ToString(),
                x.SupplierId,
                x.Supplier != null ? x.Supplier.Code : null,
                x.Supplier != null ? x.Supplier.Name : null,
                x.Reference,
                x.Note,
                x.ExpectedDate,
                x.CreatedAt,
                x.InboundDocumentId,
                x.Lines.OrderBy(l => l.CreatedAt).Select(l => new PurchaseOrderLineDto(
                    l.Id,
                    l.ProductId,
                    l.Product.Sku,
                    l.Product.Name,
                    l.Quantity,
                    l.UnitPrice,
                    l.Quantity * l.UnitPrice)).ToList()))
            .FirstOrDefaultAsync();

        return order is null ? NotFound("Purchase order nuk u gjet.") : Ok(order);
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePurchaseOrderRequest req)
    {
        if (!req.ExpectedDate.HasValue)
            return BadRequest("Data e pritshme eshte e detyrueshme.");

        if (req.SupplierId.HasValue && !await _db.Suppliers.AnyAsync(x => x.Id == req.SupplierId.Value && x.IsActive))
            return BadRequest("Furnizuesi nuk ekziston ose nuk eshte aktiv.");

        var order = new PurchaseOrder
        {
            OrderNo = await NextPurchaseOrderNoAsync(),
            Status = OrderStatus.Draft,
            SupplierId = req.SupplierId,
            Reference = Normalize(req.Reference),
            Note = Normalize(req.Note),
            ExpectedDate = req.ExpectedDate?.Date
        };

        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync();
        await _audit.WriteAsync("CREATE_PURCHASE_ORDER", "PurchaseOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}");
        return CreatedAtAction(nameof(Get), new { id = order.Id }, new { order.Id, order.OrderNo });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/lines")]
    public async Task<IActionResult> AddLine(Guid id, [FromBody] AddPurchaseOrderLineRequest req)
    {
        var order = await _db.PurchaseOrders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound("Porosia e blerjes nuk u gjet.");
        if (order.Status != OrderStatus.Draft) return BadRequest("Rreshtat mund te ndryshohen vetem ne Draft.");
        if (req.Quantity <= 0) return BadRequest("Sasia duhet te jete me e madhe se 0.");
        if (decimal.Truncate(req.Quantity) != req.Quantity) return BadRequest("Sasia duhet te jete numer i plote.");
        if (req.UnitPrice < 0) return BadRequest("Cmimi nuk mund te jete negativ.");
        if (!await _db.Products.AnyAsync(x => x.Id == req.ProductId && x.IsActive)) return BadRequest("Produkti nuk ekziston ose nuk eshte aktiv.");

        var existing = await _db.PurchaseOrderLines.FirstOrDefaultAsync(x => x.PurchaseOrderId == id && x.ProductId == req.ProductId);
        if (existing is not null)
        {
            existing.Quantity += req.Quantity;
            existing.UnitPrice = req.UnitPrice;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.PurchaseOrderLines.Add(new PurchaseOrderLine
            {
                PurchaseOrderId = id,
                ProductId = req.ProductId,
                Quantity = req.Quantity,
                UnitPrice = req.UnitPrice
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { order.Id });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpDelete("{id:guid}/lines/{lineId:guid}")]
    public async Task<IActionResult> DeleteLine(Guid id, Guid lineId)
    {
        var order = await _db.PurchaseOrders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Draft) return BadRequest("Rreshtat mund te fshihen vetem ne Draft.");
        var line = await _db.PurchaseOrderLines.FirstOrDefaultAsync(x => x.Id == lineId && x.PurchaseOrderId == id);
        if (line is null) return NotFound();
        _db.PurchaseOrderLines.Remove(line);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "CanConfirmDocuments")]
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id)
    {
        var order = await _db.PurchaseOrders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Draft) return BadRequest("Vetem Draft mund te konfirmohet.");
        if (!order.Lines.Any()) return BadRequest("Order-i duhet te kete se paku 1 rresht.");
        order.Status = OrderStatus.Confirmed;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.WriteAsync("CONFIRM_PURCHASE_ORDER", "PurchaseOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}");
        return Ok(new { order.Id, order.Status });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var order = await _db.PurchaseOrders
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status == OrderStatus.Fulfilled) return BadRequest("Order i kthyer ne dokument nuk mund te anulohet.");
        order.Status = OrderStatus.Cancelled;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.WriteAsync("CANCEL_PURCHASE_ORDER", "PurchaseOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}");
        return Ok(new { order.Id, order.Status });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/create-inbound")]
    public async Task<IActionResult> CreateInbound(Guid id)
    {
        var order = await _db.PurchaseOrders
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (order is null) return NotFound();
        if (order.Status != OrderStatus.Confirmed) return BadRequest("Vetem porosi e blerjes e konfirmuar mund te kthehet ne pranim.");
        if (order.InboundDocumentId.HasValue) return Conflict("Ky order ka dokument pranim te krijuar.");

        var inbound = new InboundDocument
        {
            DocumentNo = await _numbers.NextInboundNo(),
            Status = DocumentStatus.Draft,
            SupplierId = order.SupplierId,
            Reference = order.OrderNo,
            Note = string.IsNullOrWhiteSpace(order.Note) ? "Krijuar nga porosi e blerjes" : order.Note
        };

        foreach (var line in order.Lines)
        {
            inbound.Lines.Add(new InboundDocumentLine
            {
                ProductId = line.ProductId,
                ToBinId = null,
                LotNumber = null,
                BatchNumber = null,
                ExpiryDate = null,
                Quantity = line.Quantity,
                PurchasePrice = line.UnitPrice
            });
        }

        _db.InboundDocuments.Add(inbound);
        order.InboundDocumentId = inbound.Id;
        order.Status = OrderStatus.Fulfilled;
        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.WriteAsync("CREATE_INBOUND_FROM_PURCHASE_ORDER", "PurchaseOrder", order.Id.ToString(), $"OrderNo={order.OrderNo}, Inbound={inbound.DocumentNo}");
        return Ok(new { inbound.Id, inbound.DocumentNo });
    }

    private async Task<string> NextPurchaseOrderNoAsync()
    {
        var next = await _db.PurchaseOrders.CountAsync() + 1;
        var no = $"PB-{next:D6}";
        while (await _db.PurchaseOrders.AnyAsync(x => x.OrderNo == no))
        {
            next++;
            no = $"PB-{next:D6}";
        }
        return no;
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public record CreatePurchaseOrderRequest(Guid? SupplierId, string? Reference, string? Note, DateTime? ExpectedDate);
public record AddPurchaseOrderLineRequest(Guid ProductId, decimal Quantity, decimal UnitPrice);
public record OrderListItemDto(Guid Id, string OrderNo, string Status, Guid? PartnerId, string? PartnerCode, string? PartnerName, string? Reference, string? Note, DateTime CreatedAt, int LineCount, decimal Total, Guid? LinkedDocumentId);
public record PurchaseOrderDetailsDto(Guid Id, string OrderNo, string Status, Guid? SupplierId, string? SupplierCode, string? SupplierName, string? Reference, string? Note, DateTime? ExpectedDate, DateTime CreatedAt, Guid? InboundDocumentId, List<PurchaseOrderLineDto> Lines);
public record PurchaseOrderLineDto(Guid Id, Guid ProductId, string ProductSku, string ProductName, decimal Quantity, decimal UnitPrice, decimal LineTotal);
