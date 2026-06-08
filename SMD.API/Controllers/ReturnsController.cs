using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.API.Contracts.Returns;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/returns")]
public class ReturnsController : ControllerBase
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;

    public ReturnsController(SmdDbContext db, AuditLogService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ReturnDocumentType? type = null, [FromQuery] DocumentStatus? status = null)
    {
        var query = _db.ReturnDocuments
            .AsNoTracking()
            .Include(x => x.Customer)
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .AsQueryable();

        if (type.HasValue) query = query.Where(x => x.Type == type.Value);
        if (status.HasValue) query = query.Where(x => x.Status == status.Value);

        var rows = await query
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .ToListAsync();

        return Ok(rows.Select(ToListItem).ToList());
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost]
    public async Task<IActionResult> CreateDraft([FromBody] CreateReturnDraftRequest req)
    {
        if (!Enum.IsDefined(typeof(ReturnDocumentType), req.Type))
            return BadRequest("Lloji i dokumentit te kthimit nuk eshte valid.");

        if (req.Type == ReturnDocumentType.CustomerReturn)
        {
            if (!req.CustomerId.HasValue)
                return BadRequest("Dokumenti i kthimit nga klienti duhet te lidhet me klient.");

            var customerExists = await _db.Customers.AnyAsync(x => x.Id == req.CustomerId.Value && x.IsActive);
            if (!customerExists) return BadRequest("Klienti i zgjedhur nuk ekziston ose nuk eshte aktiv.");

            if (req.SupplierId.HasValue)
                return BadRequest("Dokumenti i kthimit nga klienti nuk mund te lidhet me furnizues.");
        }
        else
        {
            if (!req.SupplierId.HasValue)
                return BadRequest("Dokumenti i kthimit te furnizuesi duhet te lidhet me furnizues.");

            var supplierExists = await _db.Suppliers.AnyAsync(x => x.Id == req.SupplierId.Value && x.IsActive);
            if (!supplierExists) return BadRequest("Furnizuesi i zgjedhur nuk ekziston ose nuk eshte aktiv.");

            if (req.CustomerId.HasValue)
                return BadRequest("Dokumenti i kthimit te furnizuesi nuk mund te lidhet me klient.");
        }

        var doc = new ReturnDocument
        {
            DocumentNo = await NextReturnNoAsync(req.Type),
            Type = req.Type,
            Status = DocumentStatus.Draft,
            CustomerId = req.Type == ReturnDocumentType.CustomerReturn ? req.CustomerId : null,
            SupplierId = req.Type == ReturnDocumentType.SupplierReturn ? req.SupplierId : null,
            Reference = Normalize(req.Reference),
            Note = Normalize(req.Note),
            CreatedAt = DateTime.UtcNow
        };

        _db.ReturnDocuments.Add(doc);
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CREATE_RETURN_DRAFT", "ReturnDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, Type={doc.Type}");

        return Ok(new ReturnDraftResponse(doc.Id, doc.DocumentNo, doc.Status));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var doc = await LoadReturnDocumentAsync(id, asNoTracking: true);
        return doc is null ? NotFound("Dokumenti i kthimit nuk u gjet.") : Ok(ToDetails(doc));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/lines")]
    public async Task<IActionResult> AddLine(Guid id, [FromBody] AddReturnLineRequest req)
    {
        if (req.Quantity <= 0)
            return BadRequest("Sasia duhet te jete me e madhe se zero.");
        if (req.Quantity != decimal.Truncate(req.Quantity))
            return BadRequest("Sasia duhet te jete numer i plote.");

        if (req.PriceTier.HasValue && !Enum.IsDefined(typeof(OutboundPriceTier), req.PriceTier.Value))
            return BadRequest("Lloji i cmimit nuk eshte valid.");

        var doc = await _db.ReturnDocuments
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doc is null) return NotFound("Dokumenti i kthimit nuk u gjet.");
        if (doc.Status != DocumentStatus.Draft) return BadRequest("Vetem dokumentet e kthimit me status draft mund te ndryshohen.");

        var productExists = await _db.Products.AnyAsync(x => x.Id == req.ProductId && x.IsActive);
        if (!productExists) return NotFound("Produkti nuk u gjet ose nuk eshte aktiv.");

        var binExists = await _db.Bins.AnyAsync(x => x.Id == req.BinId && x.IsActive);
        if (!binExists) return NotFound("Shporta nuk u gjet ose nuk eshte aktive.");

        var normalizedLot = Normalize(req.LotNumber);
        var normalizedBatch = Normalize(req.BatchNumber);
        var normalizedExpiry = req.ExpiryDate?.Date;
        var priceTier = doc.Type == ReturnDocumentType.CustomerReturn
            ? req.PriceTier ?? OutboundPriceTier.Retail
            : OutboundPriceTier.Retail;

        var existing = doc.Lines.FirstOrDefault(x =>
            x.ProductId == req.ProductId &&
            x.BinId == req.BinId &&
            x.LotNumber == normalizedLot &&
            x.BatchNumber == normalizedBatch &&
            x.ExpiryDate == normalizedExpiry &&
            x.PriceTier == priceTier);

        if (existing is not null)
        {
            existing.Quantity += req.Quantity;
            existing.UpdatedAt = DateTime.UtcNow;
            doc.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(new ReturnLineResponse(existing.Id));
        }

        var line = new ReturnDocumentLine
        {
            ReturnDocumentId = doc.Id,
            ProductId = req.ProductId,
            BinId = req.BinId,
            LotNumber = normalizedLot,
            BatchNumber = normalizedBatch,
            ExpiryDate = normalizedExpiry,
            PriceTier = priceTier,
            Quantity = req.Quantity,
            CreatedAt = DateTime.UtcNow
        };

        _db.ReturnDocumentLines.Add(line);
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("ADD_RETURN_LINE", "ReturnDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, LineId={line.Id}, Qty={line.Quantity}");

        return Ok(new ReturnLineResponse(line.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpDelete("{id:guid}/lines/{lineId:guid}")]
    public async Task<IActionResult> DeleteLine(Guid id, Guid lineId)
    {
        var doc = await _db.ReturnDocuments
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doc is null) return NotFound("Dokumenti i kthimit nuk u gjet.");
        if (doc.Status != DocumentStatus.Draft) return BadRequest("Vetem dokumentet e kthimit me status draft mund te ndryshohen.");

        var line = doc.Lines.FirstOrDefault(x => x.Id == lineId);
        if (line is null) return NotFound("Rreshti nuk u gjet.");

        _db.ReturnDocumentLines.Remove(line);
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("DELETE_RETURN_LINE", "ReturnDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, LineId={lineId}");

        return NoContent();
    }

    [Authorize(Policy = "CanConfirmDocuments")]
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();

        var doc = await _db.ReturnDocuments
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Bin)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doc is null) return NotFound("Dokumenti i kthimit nuk u gjet.");
        if (doc.Status == DocumentStatus.Confirmed) return Ok(ToDetails((await LoadReturnDocumentAsync(id, true))!));
        if (doc.Status != DocumentStatus.Draft) return BadRequest("Vetem dokumentet e kthimit me status draft mund te konfirmohen.");
        if (doc.Lines.Count == 0) return BadRequest("Dokumenti i kthimit duhet te kete se paku nje rresht me produkt.");

        var decimalLine = doc.Lines.FirstOrDefault(x => x.Quantity != decimal.Truncate(x.Quantity));
        if (decimalLine is not null)
            return BadRequest($"Sasia per produktin {decimalLine.Product.Sku} duhet te jete numer i plote.");

        var grouped = doc.Lines
            .GroupBy(x => new { x.ProductId, x.BinId, x.LotNumber, x.BatchNumber, x.ExpiryDate })
            .Select(g => new
            {
                g.Key.ProductId,
                g.Key.BinId,
                g.Key.LotNumber,
                g.Key.BatchNumber,
                g.Key.ExpiryDate,
                Quantity = g.Sum(x => x.Quantity),
                ProductSku = g.First().Product.Sku,
                ProductName = g.First().Product.Name,
                BinCode = g.First().Bin.Code
            })
            .ToList();

        if (doc.Type == ReturnDocumentType.CustomerReturn)
        {
            foreach (var line in grouped)
            {
                var inventory = await _db.Inventories.FirstOrDefaultAsync(x =>
                    x.BinId == line.BinId &&
                    x.ProductId == line.ProductId &&
                    x.LotNumber == line.LotNumber &&
                    x.BatchNumber == line.BatchNumber &&
                    x.ExpiryDate == line.ExpiryDate);

                if (inventory is null)
                {
                    inventory = new Inventory
                    {
                        BinId = line.BinId,
                        ProductId = line.ProductId,
                        LotNumber = line.LotNumber,
                        BatchNumber = line.BatchNumber,
                        ExpiryDate = line.ExpiryDate,
                        QtyOnHand = 0,
                        QtyReserved = 0
                    };
                    _db.Inventories.Add(inventory);
                }

                inventory.QtyOnHand += line.Quantity;
                inventory.UpdatedAt = DateTime.UtcNow;

                _db.StockMovements.Add(new StockMovement
                {
                    Type = StockMovementType.IN,
                    ProductId = line.ProductId,
                    ToBinId = line.BinId,
                    Quantity = line.Quantity,
                    Reference = doc.Reference ?? doc.DocumentNo,
                    Note = $"Kthim nga klienti: {doc.DocumentNo}",
                    PerformedByUserId = GetUserIdOrNull()
                });
            }
        }
        else
        {
            foreach (var line in grouped)
            {
                var inventory = await _db.Inventories.FirstOrDefaultAsync(x =>
                    x.BinId == line.BinId &&
                    x.ProductId == line.ProductId &&
                    x.LotNumber == line.LotNumber &&
                    x.BatchNumber == line.BatchNumber &&
                    x.ExpiryDate == line.ExpiryDate);

                if (inventory is null)
                {
                    await tx.RollbackAsync();
                    return BadRequest(
                        $"Produkti {line.ProductSku} - {line.ProductName} nuk ka gjendje ne inventar per shporten {line.BinCode}{BuildTrackingLabel(line.LotNumber, line.BatchNumber, line.ExpiryDate)}. Hiqe rreshtin ose zgjidh stok ekzistues nga lista e shportes.");
                }

                var available = inventory.QtyOnHand - inventory.QtyReserved;
                if (line.Quantity > available)
                {
                    await tx.RollbackAsync();
                    return BadRequest(
                        $"Sasia nuk mjafton per {line.ProductSku} - {line.ProductName} ne shporten {line.BinCode}{BuildTrackingLabel(line.LotNumber, line.BatchNumber, line.ExpiryDate)}. Kerkuar={line.Quantity:0.##}, te disponueshme={available:0.##}.");
                }

                inventory.QtyOnHand -= line.Quantity;
                inventory.UpdatedAt = DateTime.UtcNow;

                _db.StockMovements.Add(new StockMovement
                {
                    Type = StockMovementType.OUT,
                    ProductId = line.ProductId,
                    FromBinId = line.BinId,
                    Quantity = line.Quantity,
                    Reference = doc.Reference ?? doc.DocumentNo,
                    Note = $"Kthim te furnizuesi: {doc.DocumentNo}",
                    PerformedByUserId = GetUserIdOrNull()
                });
            }
        }

        doc.Status = DocumentStatus.Confirmed;
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        await _audit.WriteAsync("CONFIRM_RETURN", "ReturnDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, Type={doc.Type}, Lines={doc.Lines.Count}");

        var detail = await LoadReturnDocumentAsync(id, asNoTracking: true);
        return Ok(ToDetails(detail!));
    }

    [Authorize(Policy = "CanConfirmDocuments")]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var doc = await _db.ReturnDocuments.FirstOrDefaultAsync(x => x.Id == id);
        if (doc is null) return NotFound("Dokumenti i kthimit nuk u gjet.");
        if (doc.Status != DocumentStatus.Draft) return BadRequest("Vetem dokumentet e kthimit me status draft mund te anulohen.");

        doc.Status = DocumentStatus.Cancelled;
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CANCEL_RETURN", "ReturnDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, Type={doc.Type}");

        var detail = await LoadReturnDocumentAsync(id, asNoTracking: true);
        return Ok(ToDetails(detail!));
    }

    private async Task<ReturnDocument?> LoadReturnDocumentAsync(Guid id, bool asNoTracking)
    {
        var query = _db.ReturnDocuments
            .Include(x => x.Customer)
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Bin)
                    .ThenInclude(x => x.Rack)
                        .ThenInclude(x => x.Zone)
                            .ThenInclude(x => x.Warehouse)
            .AsQueryable();

        if (asNoTracking) query = query.AsNoTracking();

        return await query.FirstOrDefaultAsync(x => x.Id == id);
    }

    private async Task<string> NextReturnNoAsync(ReturnDocumentType type)
    {
        var prefix = type == ReturnDocumentType.CustomerReturn ? "KTH-K" : "KTH-F";
        var next = await _db.ReturnDocuments.CountAsync(x => x.Type == type) + 1;
        var docNo = $"{prefix}-{next:D6}";

        while (await _db.ReturnDocuments.AnyAsync(x => x.DocumentNo == docNo))
        {
            next++;
            docNo = $"{prefix}-{next:D6}";
        }

        return docNo;
    }

    private static ReturnListItemDto ToListItem(ReturnDocument doc) =>
        new(
            doc.Id,
            doc.DocumentNo,
            doc.Type,
            doc.Status,
            doc.Type == ReturnDocumentType.CustomerReturn ? doc.CustomerId : doc.SupplierId,
            doc.Type == ReturnDocumentType.CustomerReturn ? doc.Customer?.Code : doc.Supplier?.Code,
            doc.Type == ReturnDocumentType.CustomerReturn ? doc.Customer?.Name : doc.Supplier?.Name,
            doc.Reference,
            doc.Note,
            doc.CreatedAt,
            doc.UpdatedAt,
            doc.Lines.Count,
            ReturnTotal(doc));

    private static ReturnDetailsDto ToDetails(ReturnDocument doc) =>
        new(
            doc.Id,
            doc.DocumentNo,
            doc.Type,
            doc.Status,
            doc.CustomerId,
            doc.Customer?.Code,
            doc.Customer?.Name,
            doc.SupplierId,
            doc.Supplier?.Code,
            doc.Supplier?.Name,
            doc.Reference,
            doc.Note,
            doc.CreatedAt,
            doc.UpdatedAt,
            ReturnTotal(doc),
            doc.Lines
                .OrderBy(x => x.CreatedAt)
                .Select(x => new ReturnLineDto(
                    x.Id,
                    x.ProductId,
                    x.Product.Sku,
                    x.Product.Name,
                    x.Product.Barcode,
                    x.Product.Description,
                    x.Product.PurchasePrice,
                    x.Product.RetailPrice,
                    x.Product.WholesalePrice,
                    x.Product.VipPrice,
                    x.PriceTier,
                    x.BinId,
                    x.Bin.Code,
                    x.Bin.Name,
                    x.Bin.Rack.Code,
                    x.Bin.Rack.Zone.Code,
                    x.Bin.Rack.Zone.Warehouse.Code,
                    x.LotNumber,
                    x.BatchNumber,
                    x.ExpiryDate,
                    x.Quantity,
                    LineTotal(doc.Type, x)))
                .ToList());

    private static decimal ReturnTotal(ReturnDocument doc) => doc.Lines.Sum(x => LineTotal(doc.Type, x));

    private static decimal LineTotal(ReturnDocumentType type, ReturnDocumentLine line)
    {
        if (type == ReturnDocumentType.SupplierReturn)
            return line.Quantity * line.Product.PurchasePrice;

        var unitPrice = line.PriceTier == OutboundPriceTier.Wholesale
            ? line.Product.WholesalePrice
            : line.PriceTier == OutboundPriceTier.Vip
                ? line.Product.VipPrice
                : line.Product.RetailPrice;

        return line.Quantity * unitPrice;
    }

    private static string BuildTrackingLabel(string? lotNumber, string? batchNumber, DateTime? expiryDate)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(lotNumber)) parts.Add($"seria {lotNumber}");
        if (!string.IsNullOrWhiteSpace(batchNumber)) parts.Add($"grupi {batchNumber}");
        if (expiryDate.HasValue) parts.Add($"skadenca {expiryDate.Value:dd/MM/yyyy}");

        return parts.Count == 0 ? "" : $" ({string.Join(", ", parts)})";
    }

    private Guid? GetUserIdOrNull()
    {
        var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(s, out var id) ? id : null;
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
