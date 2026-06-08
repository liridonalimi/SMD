using Microsoft.EntityFrameworkCore;
using SMD.Application.Common.Results;
using SMD.Application.Contracts.Documents.Inbound;
using SMD.Application.Contracts.Documents.Outbound;
using SMD.Application.Contracts.Documents.Responses;
using SMD.Application.Services.Documents;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using SMD.Infrastructure.Services.Validation;
using SMD.Infrastructure.Services.WarehouseTasks;

namespace SMD.Infrastructure.Services.Documents;

public class DocumentService : IDocumentService
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;
    private readonly DocumentValidationService _validator;
    private readonly ReplenishmentTaskService _replenishment;

    private readonly IDocumentNumberService _numbers;
    public DocumentService(
        SmdDbContext db,
        AuditLogService audit,
        DocumentValidationService validator,
        IDocumentNumberService numbers,
        ReplenishmentTaskService replenishment)
    {
        _db = db;
        _audit = audit;
        _validator = validator;
        _numbers = numbers;
        _replenishment = replenishment;
    }

    private static string? NormalizeText(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static bool IsWholeNumber(decimal value) => decimal.Truncate(value) == value;

    private static string FormatWholeQty(decimal value) => decimal.Truncate(value).ToString("0");

    private static string BuildInventoryLabel(Inventory inventory)
    {
        var product = inventory.Product == null
            ? "produkti"
            : $"{inventory.Product.Sku} - {inventory.Product.Name}";
        var bin = inventory.Bin == null
            ? "shporta e zgjedhur"
            : $"{inventory.Bin.Code} - {inventory.Bin.Name}";
        var tracking = new[]
        {
            string.IsNullOrWhiteSpace(inventory.LotNumber) ? null : $"Seria: {inventory.LotNumber}",
            string.IsNullOrWhiteSpace(inventory.BatchNumber) ? null : $"Grupi: {inventory.BatchNumber}",
            inventory.ExpiryDate.HasValue ? $"Skadenca: {inventory.ExpiryDate.Value:dd.MM.yyyy}" : null
        }.Where(x => x != null);

        var trackingText = tracking.Any() ? $" ({string.Join(", ", tracking)})" : "";
        return $"{product} ne {bin}{trackingText}";
    }

    private static string BuildStockShortageMessage(Inventory inventory, decimal requested, decimal available)
    {
        var missing = Math.Max(requested - available, 0);
        return $"Sasia nuk mjafton per {BuildInventoryLabel(inventory)}. Duhen edhe: {FormatWholeQty(missing)}, ne dispozicion: {FormatWholeQty(available)}.";
    }

    private async Task<Inventory?> FindOutboundInventoryAsync(OutboundDocumentLine line)
    {
        return await _db.Inventories
            .Include(i => i.Product)
            .Include(i => i.Bin)
            .FirstOrDefaultAsync(i =>
                i.BinId == line.FromBinId &&
                i.ProductId == line.ProductId &&
                i.LotNumber == line.LotNumber &&
                i.BatchNumber == line.BatchNumber &&
                i.ExpiryDate == line.ExpiryDate);
    }

    private static string? ReserveInventoryQuantity(Inventory inventory, decimal quantity)
    {
        if (quantity <= 0) return null;

        var available = inventory.QtyOnHand - inventory.QtyReserved;
        if (quantity > available)
            return BuildStockShortageMessage(inventory, quantity, available);

        inventory.QtyReserved += quantity;
        inventory.UpdatedAt = DateTime.UtcNow;
        return null;
    }

    private static decimal ReleaseInventoryReservation(Inventory inventory, decimal quantity)
    {
        if (quantity <= 0) return 0;

        var released = Math.Min(quantity, inventory.QtyReserved);
        inventory.QtyReserved -= released;
        inventory.UpdatedAt = DateTime.UtcNow;
        return released;
    }

    public async Task<ServiceResult<DraftResponse>> CreateInboundDraftAsync(CreateInboundDraftCommand cmd)
    {
        if (cmd.SupplierId.HasValue && !await _db.Suppliers.AnyAsync(x => x.Id == cmd.SupplierId.Value && x.IsActive))
            return ServiceResult<DraftResponse>.BadRequest("Furnitori i zgjedhur nuk ekziston ose nuk eshte aktiv.");

        var docNo = await _numbers.NextInboundNo();

        var doc = new InboundDocument
        {
            DocumentNo = docNo,
            Status = DocumentStatus.Draft,
            SupplierId = cmd.SupplierId,
            Reference = cmd.Reference?.Trim(),
            Note = cmd.Note?.Trim(),
            CreatedAt = DateTime.UtcNow,
            //IsActive = true
        };

        _db.InboundDocuments.Add(doc);
        await _db.SaveChangesAsync();

        // audit opsional
        await _audit.WriteAsync("CREATE_INBOUND_DRAFT", "InboundDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}");

        return ServiceResult<DraftResponse>.Ok(new DraftResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));
    }

    public async Task<ServiceResult<DraftResponse>> CreateOutboundDraftAsync(CreateOutboundDraftCommand cmd)
    {
        if (cmd.CustomerId.HasValue && !await _db.Customers.AnyAsync(x => x.Id == cmd.CustomerId.Value && x.IsActive))
            return ServiceResult<DraftResponse>.BadRequest("Klienti i zgjedhur nuk ekziston ose nuk eshte aktiv.");

        var priceTier = OutboundPriceTier.Retail;
        if (cmd.PriceTier.HasValue)
        {
            if (!Enum.IsDefined(typeof(OutboundPriceTier), cmd.PriceTier.Value))
                return ServiceResult<DraftResponse>.BadRequest("Lloji i cmimit per outbound nuk eshte valid.");

            priceTier = (OutboundPriceTier)cmd.PriceTier.Value;
        }

        var docNo = await _numbers.NextOutboundNo();

        var doc = new OutboundDocument
        {
            DocumentNo = docNo,
            Status = DocumentStatus.Draft,
            PriceTier = priceTier,
            CustomerId = cmd.CustomerId,
            Reference = cmd.Reference?.Trim(),
            Note = cmd.Note?.Trim(),
            CreatedAt = DateTime.UtcNow,
            //IsActive = true
        };

        _db.OutboundDocuments.Add(doc);
        await _db.SaveChangesAsync();

        // audit opsional
        // await _audit.WriteAsync("CREATE_OUTBOUND_DRAFT", "OutboundDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}");

        return ServiceResult<DraftResponse>.Ok(new DraftResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));
    }

    public async Task<ServiceResult<SetOutboundPriceTierResponse>> SetOutboundPriceTierAsync(SetOutboundPriceTierCommand cmd)
    {
        if (!Enum.IsDefined(typeof(OutboundPriceTier), cmd.PriceTier))
            return ServiceResult<SetOutboundPriceTierResponse>.BadRequest("Lloji i cmimit per outbound nuk eshte valid.");

        var doc = await _db.OutboundDocuments.FirstOrDefaultAsync(x => x.Id == cmd.DocumentId);
        if (doc == null)
            return ServiceResult<SetOutboundPriceTierResponse>.NotFound("Dokumenti dales (Outbound) nuk u gjet.");

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<SetOutboundPriceTierResponse>.BadRequest("Lloji i cmimit mund te ndryshohet vetem sa kohe dokumenti eshte Draft.");

        doc.PriceTier = (OutboundPriceTier)cmd.PriceTier;
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("SET_OUTBOUND_PRICE_TIER", "OutboundDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, PriceTier={doc.PriceTier}");

        return ServiceResult<SetOutboundPriceTierResponse>.Ok(new SetOutboundPriceTierResponse(doc.Id, (int)doc.PriceTier));
    }

    public async Task<ServiceResult<SetOutboundLinePriceTierResponse>> SetOutboundLinePriceTierAsync(SetOutboundLinePriceTierCommand cmd)
    {
        if (!Enum.IsDefined(typeof(OutboundPriceTier), cmd.PriceTier))
            return ServiceResult<SetOutboundLinePriceTierResponse>.BadRequest("Lloji i cmimit per outbound line nuk eshte valid.");

        var doc = await _db.OutboundDocuments
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == cmd.DocumentId);

        if (doc == null)
            return ServiceResult<SetOutboundLinePriceTierResponse>.NotFound("Dokumenti dales (Outbound) nuk u gjet.");

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<SetOutboundLinePriceTierResponse>.BadRequest("Cmimi i rreshtit mund te ndryshohet vetem sa kohe dokumenti eshte Draft.");

        var line = doc.Lines.FirstOrDefault(x => x.Id == cmd.LineId);
        if (line == null)
            return ServiceResult<SetOutboundLinePriceTierResponse>.NotFound("Rreshti nuk u gjet.");

        line.PriceTier = (OutboundPriceTier)cmd.PriceTier;
        line.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("SET_OUTBOUND_LINE_PRICE_TIER", "OutboundDocument", doc.Id.ToString(), $"DocNo={doc.DocumentNo}, LineId={line.Id}, PriceTier={line.PriceTier}");

        return ServiceResult<SetOutboundLinePriceTierResponse>.Ok(new SetOutboundLinePriceTierResponse(doc.Id, line.Id, (int)line.PriceTier));
    }

    public async Task<ServiceResult<ConfirmResponse>> ConfirmInboundAsync(Guid id, Guid? userId)
    {
        var doc = await _db.InboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (doc == null) return ServiceResult<ConfirmResponse>.NotFound("Inbound dokumenti nuk ekziston.");
        if (doc.Status == DocumentStatus.Confirmed)
            return ServiceResult<ConfirmResponse>.Ok(new ConfirmResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<ConfirmResponse>.BadRequest("Vetem Draft dokumentet mund te konfirmohen.");
        if (doc.Lines.Count == 0)
            return ServiceResult<ConfirmResponse>.BadRequest("Dokumenti duhet se paku te ket 1 rresht.");

        var (ok, error) = await _validator.ValidateInboundLinesAsync(doc.Lines.ToList());
        if (!ok) return ServiceResult<ConfirmResponse>.BadRequest(error!);

        await using var tx = await _db.Database.BeginTransactionAsync();

        var grouped = doc.Lines
            .GroupBy(l => new { l.ProductId, l.ToBinId, l.LotNumber, l.BatchNumber, l.ExpiryDate })
            .Select(g => new
            {
                g.Key.ProductId,
                ToBinId = g.Key.ToBinId!.Value,
                g.Key.LotNumber,
                g.Key.BatchNumber,
                g.Key.ExpiryDate,
                Quantity = g.Sum(x => x.Quantity)
            })
            .ToList();

        foreach (var l in grouped)
        {
            var inv = await _db.Inventories
                .FirstOrDefaultAsync(i =>
                    i.BinId == l.ToBinId &&
                    i.ProductId == l.ProductId &&
                    i.LotNumber == l.LotNumber &&
                    i.BatchNumber == l.BatchNumber &&
                    i.ExpiryDate == l.ExpiryDate);

            if (inv == null)
            {
                inv = new Inventory
                {
                    BinId = l.ToBinId,
                    ProductId = l.ProductId,
                    LotNumber = l.LotNumber,
                    BatchNumber = l.BatchNumber,
                    ExpiryDate = l.ExpiryDate,
                    QtyOnHand = 0,
                    QtyReserved = 0
                };
                _db.Inventories.Add(inv);
            }

            inv.QtyOnHand += l.Quantity;
            inv.UpdatedAt = DateTime.UtcNow;

            _db.StockMovements.Add(new StockMovement
            {
                Type = StockMovementType.IN,
                ProductId = l.ProductId,
                FromBinId = null,
                ToBinId = l.ToBinId,
                Quantity = l.Quantity,
                Reference = doc.Reference ?? doc.DocumentNo,
                Note = $"Inbound Confirm: {doc.DocumentNo}",
                PerformedByUserId = userId
            });
        }

        doc.Status = DocumentStatus.Confirmed;
        doc.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            await tx.RollbackAsync();
            return ServiceResult<ConfirmResponse>.Conflict("Concurrency conflict (Dikush eshte duke punur ne kete dokument.). Ju lutem provoni perseri.");
        }

        await _audit.WriteAsync("CONFIRM_INBOUND", "InboundDocument", doc.Id.ToString(),
            $"DocNo={doc.DocumentNo}, Lines={doc.Lines.Count}, Reference={doc.Reference}");

        return ServiceResult<ConfirmResponse>.Ok(new ConfirmResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));
    }

    public async Task<ServiceResult<ConfirmResponse>> ConfirmOutboundAsync(Guid id, Guid? userId)
    {
        var doc = await _db.OutboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (doc == null) return ServiceResult<ConfirmResponse>.NotFound("Dokumenti dales (Outbound) nuk u gjet!");
        if (doc.Status == DocumentStatus.Confirmed)
            return ServiceResult<ConfirmResponse>.Ok(new ConfirmResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<ConfirmResponse>.BadRequest("Vetem Draft Dokumentet mund te konfirmohen.");
        if (doc.Lines.Count == 0)
            return ServiceResult<ConfirmResponse>.BadRequest("Dokumenti duhet se paku te ket 1 rresht.");

        var (ok, error) = await _validator.ValidateOutboundLinesAsync(doc.Lines.ToList());
        if (!ok) return ServiceResult<ConfirmResponse>.BadRequest(error!);

        var (ok2, error2) = await _validator.ValidateOutboundAvailabilityAsync(doc.Lines.ToList());
        if (!ok2) return ServiceResult<ConfirmResponse>.BadRequest(error2!);

        await using var tx = await _db.Database.BeginTransactionAsync();

        var grouped = doc.Lines
            .GroupBy(l => new { l.ProductId, l.FromBinId, l.LotNumber, l.BatchNumber, l.ExpiryDate })
            .Select(g => new
            {
                g.Key.ProductId,
                g.Key.FromBinId,
                g.Key.LotNumber,
                g.Key.BatchNumber,
                g.Key.ExpiryDate,
                Quantity = g.Sum(x => x.Quantity),
                ReservedQuantity = g.Sum(x => x.ReservedQuantity)
            })
            .ToList();

        foreach (var l in grouped)
        {
            var inv = await _db.Inventories
                .FirstOrDefaultAsync(i =>
                    i.BinId == l.FromBinId &&
                    i.ProductId == l.ProductId &&
                    i.LotNumber == l.LotNumber &&
                    i.BatchNumber == l.BatchNumber &&
                    i.ExpiryDate == l.ExpiryDate);

            if (inv == null)
            {
                await tx.RollbackAsync();
                return ServiceResult<ConfirmResponse>.BadRequest("Mungon rreshti i sakte i inventarit per lotin ose skadencen e zgjedhur.");
            }

            var available = inv.QtyOnHand - inv.QtyReserved + l.ReservedQuantity;
            if (l.Quantity > available)
            {
                await tx.RollbackAsync();
                return ServiceResult<ConfirmResponse>.BadRequest($"Sasia nuk mjafton. Available={available}");
            }

            ReleaseInventoryReservation(inv, l.ReservedQuantity);
            inv.QtyOnHand -= l.Quantity;
            if (inv.QtyOnHand < 0 || inv.QtyReserved > inv.QtyOnHand)
            {
                await tx.RollbackAsync();
                return ServiceResult<ConfirmResponse>.BadRequest("Rezervimi i stokut nuk perputhet me sasine fizike ne inventar.");
            }

            inv.UpdatedAt = DateTime.UtcNow;

            _db.StockMovements.Add(new StockMovement
            {
                Type = StockMovementType.OUT,
                ProductId = l.ProductId,
                FromBinId = l.FromBinId,
                ToBinId = null,
                Quantity = l.Quantity,
                Reference = doc.Reference ?? doc.DocumentNo,
                Note = $"Outbound Confirm: {doc.DocumentNo}",
                PerformedByUserId = userId
            });
        }

        foreach (var line in doc.Lines)
        {
            line.ReservedQuantity = 0;
            line.UpdatedAt = DateTime.UtcNow;
        }

        doc.Status = DocumentStatus.Confirmed;
        doc.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            await tx.RollbackAsync();
            return ServiceResult<ConfirmResponse>.Conflict("Konflikt, dikush tjeter tashme eshte duke e konfirmuar kete dokument. Ju lutem provoni perseri.");
        }

        await _audit.WriteAsync("CONFIRM_OUTBOUND", "OutboundDocument", doc.Id.ToString(),
            $"DocNo={doc.DocumentNo}, Lines={doc.Lines.Count}, Reference={doc.Reference}");

        var replenishmentPairs = grouped
            .Select(x => (x.ProductId, x.FromBinId))
            .ToList();
        var createdReplenishment = await _replenishment.CreateForLowPickBinsAsync(replenishmentPairs, doc.DocumentNo);
        if (createdReplenishment > 0)
        {
            await _audit.WriteAsync(
                "AUTO_REPLENISHMENT_TASKS",
                "OutboundDocument",
                doc.Id.ToString(),
                $"DocNo={doc.DocumentNo}, CreatedTasks={createdReplenishment}");
        }

        return ServiceResult<ConfirmResponse>.Ok(new ConfirmResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));
    }

    public async Task<ServiceResult<LineResponse>> AddInboundLineAsync(Guid docId, AddInboundLineCommand cmd)
    {
        var doc = await _db.InboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == docId);

        if (doc == null) return ServiceResult<LineResponse>.NotFound("Dokumenti hyres (Inbound) nuk u gjet.");
        if (doc.Status != DocumentStatus.Draft) return ServiceResult<LineResponse>.BadRequest("Vetëm dokumentet Draft mund të editohen (shtohen/fshihen rreshta).");
        if (cmd.Quantity <= 0) return ServiceResult<LineResponse>.BadRequest("Sasia duhet te jet > 0.");

        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == cmd.ProductId);
        if (product is null)
            return ServiceResult<LineResponse>.NotFound("Produkti qe keni dhene nuk ekziston.");
        if (!await _db.Bins.AnyAsync(b => b.Id == cmd.ToBinId))
            return ServiceResult<LineResponse>.NotFound("Shporta ku doni ti vendosni nuk ekziston.");

        var normalizedLot = NormalizeText(cmd.LotNumber);
        var normalizedBatch = NormalizeText(cmd.BatchNumber);
        var normalizedExpiry = cmd.ExpiryDate?.Date;

        var existing = doc.Lines.FirstOrDefault(l =>
            l.ProductId == cmd.ProductId &&
            l.ToBinId == cmd.ToBinId &&
            l.LotNumber == normalizedLot &&
            l.BatchNumber == normalizedBatch &&
            l.ExpiryDate == normalizedExpiry);
        if (existing != null)
        {
            var before = existing.Quantity;
            existing.Quantity += cmd.Quantity;
            existing.UpdatedAt = DateTime.UtcNow;
            doc.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _audit.WriteAsync(
                action: "ADD_LINE_INBOUND",
                entity: "InboundDocument",
                entityId: doc.Id.ToString(),
                details: $"DocNo={doc.DocumentNo}, LineId={existing.Id}, ProductId={cmd.ProductId}, ToBinId={cmd.ToBinId}, QtyBefore={before}, QtyAdded={cmd.Quantity}, QtyAfter={existing.Quantity}"
            );

            return ServiceResult<LineResponse>.Ok(new LineResponse(existing.Id));
        }

        var placeholder = doc.Lines.FirstOrDefault(l =>
            l.ProductId == cmd.ProductId &&
            !l.ToBinId.HasValue &&
            string.IsNullOrWhiteSpace(l.LotNumber) &&
            string.IsNullOrWhiteSpace(l.BatchNumber) &&
            !l.ExpiryDate.HasValue);
        if (placeholder != null)
        {
            placeholder.ToBinId = cmd.ToBinId;
            placeholder.LotNumber = normalizedLot;
            placeholder.BatchNumber = normalizedBatch;
            placeholder.ExpiryDate = normalizedExpiry;
            placeholder.Quantity = cmd.Quantity;
            placeholder.UpdatedAt = DateTime.UtcNow;
            doc.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _audit.WriteAsync(
                action: "COMPLETE_INBOUND_PLACEHOLDER_LINE",
                entity: "InboundDocument",
                entityId: doc.Id.ToString(),
                details: $"DocNo={doc.DocumentNo}, LineId={placeholder.Id}, ProductId={cmd.ProductId}, ToBinId={cmd.ToBinId}, Qty={cmd.Quantity}"
            );

            return ServiceResult<LineResponse>.Ok(new LineResponse(placeholder.Id));
        }

        var now = DateTime.UtcNow;

        var line = new InboundDocumentLine
        {
            InboundDocumentId = docId,
            ProductId = cmd.ProductId,
            ToBinId = cmd.ToBinId,
            LotNumber = normalizedLot,
            BatchNumber = normalizedBatch,
            ExpiryDate = normalizedExpiry,
            Quantity = cmd.Quantity,
            PurchasePrice = product.PurchasePrice,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.InboundDocumentLines.Add(line);
        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            action: "ADD_LINE_INBOUND",
            entity: "InboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, LineId={line.Id}, ProductId={cmd.ProductId}, ToBinId={cmd.ToBinId}, QtyAdded={cmd.Quantity}"
        );

        return ServiceResult<LineResponse>.Ok(new LineResponse(line.Id));
    }

    public async Task<ServiceResult<LineResponse>> AddOutboundLineAsync(Guid docId, AddOutboundLineCommand cmd)
    {
        var doc = await _db.OutboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == docId);

        if (doc == null) return ServiceResult<LineResponse>.NotFound("Dokumenti dales (outbound) nuk ekziston.");
        if (doc.Status != DocumentStatus.Draft) return ServiceResult<LineResponse>.BadRequest("Vetem Draft Dokumentet mund te konfirmohen.");
        if (cmd.Quantity <= 0) return ServiceResult<LineResponse>.BadRequest("Sasia duhet te jete me e madhe se 0.");
        if (!IsWholeNumber(cmd.Quantity)) return ServiceResult<LineResponse>.BadRequest("Sasia duhet te jete numer i plote.");

        var productLabel = await _db.Products
            .Where(p => p.Id == cmd.ProductId)
            .Select(p => p.Sku + " - " + p.Name)
            .FirstOrDefaultAsync();
        if (productLabel == null)
            return ServiceResult<LineResponse>.NotFound("Produkti qe keni dhene nuk ekzsiton.");
        var binLabel = await _db.Bins
            .Where(b => b.Id == cmd.FromBinId)
            .Select(b => b.Code + " - " + b.Name)
            .FirstOrDefaultAsync();
        if (binLabel == null)
            return ServiceResult<LineResponse>.NotFound("Shporta nga e cila doni te beni daljen nuk ekziston.");

        var normalizedLot = NormalizeText(cmd.LotNumber);
        var normalizedBatch = NormalizeText(cmd.BatchNumber);
        var normalizedExpiry = cmd.ExpiryDate?.Date;

        var inventoryRows = await _db.Inventories
            .Include(i => i.Product)
            .Include(i => i.Bin)
            .Where(i => i.BinId == cmd.FromBinId && i.ProductId == cmd.ProductId)
            .ToListAsync();

        if (inventoryRows.Count == 0)
            return ServiceResult<LineResponse>.BadRequest($"Produkti {productLabel} nuk ka fare stok ne shporten {binLabel}. Zgjidh shporte tjeter ose kontrollo inventarin.");

        Inventory? inv;
        if (normalizedLot != null || normalizedBatch != null || normalizedExpiry != null)
        {
            inv = inventoryRows.FirstOrDefault(i =>
                i.LotNumber == normalizedLot &&
                i.BatchNumber == normalizedBatch &&
                i.ExpiryDate == normalizedExpiry);

            if (inv == null)
                return ServiceResult<LineResponse>.BadRequest("Seria, grupi ose skadenca e zgjedhur nuk u gjet ne inventar per kete shporte.");
        }
        else
        {
            var today = DateTime.UtcNow.Date;
            inv = inventoryRows
                .Where(i => (i.QtyOnHand - i.QtyReserved) > 0)
                .OrderBy(i => i.ExpiryDate.HasValue ? (i.ExpiryDate.Value < today ? 2 : 0) : 1)
                .ThenBy(i => i.ExpiryDate ?? DateTime.MaxValue)
                .ThenByDescending(i => i.QtyOnHand - i.QtyReserved)
                .ThenBy(i => i.CreatedAt)
                .FirstOrDefault();

            if (inv == null)
                return ServiceResult<LineResponse>.BadRequest("Nuk ka sasi te disponueshme ne inventar per kete shporte.");
        }

        var existing = doc.Lines.FirstOrDefault(l =>
            l.ProductId == cmd.ProductId &&
            l.FromBinId == cmd.FromBinId &&
            l.LotNumber == inv.LotNumber &&
            l.BatchNumber == inv.BatchNumber &&
            l.ExpiryDate == inv.ExpiryDate);
        var available = inv.QtyOnHand - inv.QtyReserved;
        if (cmd.Quantity > available)
            return ServiceResult<LineResponse>.BadRequest(BuildStockShortageMessage(inv, cmd.Quantity, available));

        var reserveError = ReserveInventoryQuantity(inv, cmd.Quantity);
        if (reserveError != null)
            return ServiceResult<LineResponse>.BadRequest(reserveError);

        if (existing != null)
        {
            var before = existing.Quantity;
            existing.Quantity += cmd.Quantity;
            existing.ReservedQuantity += cmd.Quantity;
            existing.UpdatedAt = DateTime.UtcNow;
            doc.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            await _audit.WriteAsync(
                action: "ADD_LINE_OUTBOUND",
                entity: "OutboundDocument",
                entityId: doc.Id.ToString(),
                details: $"DocNo={doc.DocumentNo}, LineId={existing.Id}, ProductId={cmd.ProductId}, FromBinId={cmd.FromBinId}, Lot={inv.LotNumber}, Batch={inv.BatchNumber}, Expiry={inv.ExpiryDate:yyyy-MM-dd}, QtyBefore={before}, QtyAdded={cmd.Quantity}, QtyAfter={existing.Quantity}"
            );

            return ServiceResult<LineResponse>.Ok(new LineResponse(existing.Id));
        }

        var line = new OutboundDocumentLine
        {
            OutboundDocumentId = docId,
            ProductId = cmd.ProductId,
            FromBinId = cmd.FromBinId,
            LotNumber = inv.LotNumber,
            BatchNumber = inv.BatchNumber,
            ExpiryDate = inv.ExpiryDate,
            PriceTier = doc.PriceTier,
            Quantity = cmd.Quantity,
            ReservedQuantity = cmd.Quantity
        };

        _db.OutboundDocumentLines.Add(line);
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            action: "ADD_LINE_OUTBOUND",
            entity: "OutboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, LineId={line.Id}, ProductId={cmd.ProductId}, FromBinId={cmd.FromBinId}, Lot={line.LotNumber}, Batch={line.BatchNumber}, Expiry={line.ExpiryDate:yyyy-MM-dd}, QtyAdded={cmd.Quantity}"
        );

        return ServiceResult<LineResponse>.Ok(new LineResponse(line.Id));
    }

    public async Task<ServiceResult<CancelResponse>> CancelInboundAsync(CancelInboundCommand cmd)
    {
        var doc = await _db.InboundDocuments.Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == cmd.DocumentId);

        if (doc == null) return ServiceResult<CancelResponse>.NotFound("Dokumenti hyres nuk ekzsiton.");

        if (doc.Status == DocumentStatus.Confirmed)
            return ServiceResult<CancelResponse>.BadRequest("Dokumenti eshte i konfirmuar dhe nuk mund te anulohet.");

        if (doc.Status == DocumentStatus.Cancelled)
            return ServiceResult<CancelResponse>.Ok(new CancelResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<CancelResponse>.BadRequest("Vetem Draft dokumentet mund te anulohen.");

        var linesDeleted = doc.Lines.Count;
        if (linesDeleted > 0) _db.InboundDocumentLines.RemoveRange(doc.Lines);

        doc.Status = DocumentStatus.Cancelled;
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CANCEL_INBOUND", "InboundDocument", doc.Id.ToString(),
            $"DocNo={doc.DocumentNo}, StatusBefore=Draft, StatusAfter=Cancelled, LinesDeleted={linesDeleted}, Reference={doc.Reference}");

        return ServiceResult<CancelResponse>.Ok(new CancelResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));
    }

    public async Task<ServiceResult<CancelResponse>> CancelOutboundAsync(CancelOutboundCommand cmd)
    {
        var doc = await _db.OutboundDocuments.Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == cmd.DocumentId);

        if (doc == null) return ServiceResult<CancelResponse>.NotFound("Dokumenti dales (outbound) nuk ekzsiton.");

        if (doc.Status == DocumentStatus.Confirmed)
            return ServiceResult<CancelResponse>.BadRequest("Dokumenti eshte i konfirmuar dhe nuk mund te anulohet.");

        if (doc.Status == DocumentStatus.Cancelled)
            return ServiceResult<CancelResponse>.Ok(new CancelResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<CancelResponse>.BadRequest("Vetem Draft dokumentet mund te anulohen.");

        foreach (var line in doc.Lines.Where(l => l.ReservedQuantity > 0))
        {
            var inv = await FindOutboundInventoryAsync(line);
            if (inv != null)
                ReleaseInventoryReservation(inv, line.ReservedQuantity);
        }

        var linesDeleted = doc.Lines.Count;
        if (linesDeleted > 0) _db.OutboundDocumentLines.RemoveRange(doc.Lines);

        doc.Status = DocumentStatus.Cancelled;
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CANCEL_OUTBOUND", "OutboundDocument", doc.Id.ToString(),
            $"DocNo={doc.DocumentNo}, StatusBefore=Draft, StatusAfter=Cancelled, LinesDeleted={linesDeleted}, Reference={doc.Reference}");

        return ServiceResult<CancelResponse>.Ok(new CancelResponse(doc.Id, doc.DocumentNo, doc.Status.ToString()));
    }

    public async Task<ServiceResult<DecrementLineResponse>> DecrementInboundLineAsync(DecrementInboundLineCommand cmd)
    {
        if (cmd.Quantity <= 0)
            return ServiceResult<DecrementLineResponse>.BadRequest("Sasia për zbritje duhet të jetë > 0.");

        var doc = await _db.InboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == cmd.DocumentId);

        if (doc == null)
            return ServiceResult<DecrementLineResponse>.NotFound("Dokumenti hyrës (Inbound) nuk u gjet.");

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<DecrementLineResponse>.BadRequest("Vetëm dokumentet Draft mund të editohen.");

        var line = doc.Lines.FirstOrDefault(l => l.Id == cmd.LineId);
        if (line == null)
            return ServiceResult<DecrementLineResponse>.NotFound("Rreshti nuk u gjet.");

        var now = DateTime.UtcNow;

        if (cmd.Quantity >= line.Quantity)
        {
            _db.InboundDocumentLines.Remove(line);
            doc.UpdatedAt = now;

            await _db.SaveChangesAsync();

            await _audit.WriteAsync(
                action: "DELETE_LINE_INBOUND",
                entity: "InboundDocument",
                entityId: doc.Id.ToString(),
                details: $"DocNo={doc.DocumentNo}, LineId={line.Id}, QtyBefore={line.Quantity}, QtyRemoved={cmd.Quantity}, Result=Deleted"
            );

            return ServiceResult<DecrementLineResponse>.Ok(
                new DecrementLineResponse(line.Id, 0, true)
            );
        }

        var before = line.Quantity;
        line.Quantity -= cmd.Quantity;
        line.UpdatedAt = now;
        doc.UpdatedAt = now;

        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            action: "DECREMENT_LINE_INBOUND",
            entity: "InboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, LineId={line.Id}, QtyBefore={before}, QtyRemoved={cmd.Quantity}, QtyAfter={line.Quantity}"
        );

        return ServiceResult<DecrementLineResponse>.Ok(
            new DecrementLineResponse(line.Id, line.Quantity, false)
        );
    }

    public async Task<ServiceResult<DecrementLineResponse>> AdjustOutboundLineQuantityAsync(AdjustOutboundLineQuantityCommand cmd)
    {
        if (cmd.Delta == 0)
            return ServiceResult<DecrementLineResponse>.BadRequest("Ndryshimi i sasise nuk mund te jete 0.");
        if (!IsWholeNumber(cmd.Delta))
            return ServiceResult<DecrementLineResponse>.BadRequest("Ndryshimi i sasise duhet te jete numer i plote.");

        var doc = await _db.OutboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == cmd.DocumentId);

        if (doc == null)
            return ServiceResult<DecrementLineResponse>.NotFound("Dokumenti dales (Outbound) nuk u gjet.");

        if (doc.Status != DocumentStatus.Draft)
            return ServiceResult<DecrementLineResponse>.BadRequest("Vetem dokumentet Draft mund te editohen.");

        var line = doc.Lines.FirstOrDefault(l => l.Id == cmd.LineId);
        if (line == null)
            return ServiceResult<DecrementLineResponse>.NotFound("Rreshti nuk u gjet.");

        var now = DateTime.UtcNow;
        var quantityAfter = line.Quantity + cmd.Delta;
        Inventory? inv = null;

        if (cmd.Delta > 0 || line.ReservedQuantity > 0)
        {
            inv = await FindOutboundInventoryAsync(line);
            if (inv == null)
                return ServiceResult<DecrementLineResponse>.BadRequest("Nuk u gjet rreshti i sakte i inventarit per kete linje.");
        }

        if (cmd.Delta > 0)
        {
            var reserveError = ReserveInventoryQuantity(inv!, cmd.Delta);
            if (reserveError != null)
                return ServiceResult<DecrementLineResponse>.BadRequest(reserveError);
        }

        if (quantityAfter <= 0)
        {
            if (inv != null)
                ReleaseInventoryReservation(inv, line.ReservedQuantity);

            _db.OutboundDocumentLines.Remove(line);
            doc.UpdatedAt = now;

            await _db.SaveChangesAsync();

            await _audit.WriteAsync(
                action: "DELETE_LINE_OUTBOUND_BY_ADJUST",
                entity: "OutboundDocument",
                entityId: doc.Id.ToString(),
                details: $"DocNo={doc.DocumentNo}, LineId={line.Id}, Delta={cmd.Delta}, QuantityAfter=0"
            );

            return ServiceResult<DecrementLineResponse>.Ok(
                new DecrementLineResponse(line.Id, 0, true)
            );
        }

        var before = line.Quantity;
        if (cmd.Delta < 0 && inv != null)
        {
            var released = ReleaseInventoryReservation(inv, Math.Min(line.ReservedQuantity, Math.Abs(cmd.Delta)));
            line.ReservedQuantity -= released;
        }
        else if (cmd.Delta > 0)
        {
            line.ReservedQuantity += cmd.Delta;
        }

        line.Quantity = quantityAfter;
        line.UpdatedAt = now;
        doc.UpdatedAt = now;

        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            action: cmd.Delta > 0 ? "INCREMENT_LINE_OUTBOUND" : "DECREMENT_LINE_OUTBOUND",
            entity: "OutboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, LineId={line.Id}, QuantityBefore={before:0.##}, Delta={cmd.Delta:0.##}, QuantityAfter={line.Quantity:0.##}"
        );

        return ServiceResult<DecrementLineResponse>.Ok(
            new DecrementLineResponse(line.Id, line.Quantity, false)
        );
    }

    public async Task<ServiceResult<DeleteLineResponse>> DeleteInboundLineAsync(DeleteInboundLineCommand cmd)
    {
        var doc = await _db.InboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == cmd.DocumentId);

        if (doc == null) return ServiceResult<DeleteLineResponse>.NotFound("Dokumenti hyres (inbound) nuk ekzsiton.");
        if (doc.Status != DocumentStatus.Draft) return ServiceResult<DeleteLineResponse>.BadRequest("Vetëm Draft dokumenti mund të ndryshohet.");

        var line = doc.Lines.FirstOrDefault(x => x.Id == cmd.LineId);
        if (line == null) return ServiceResult<DeleteLineResponse>.NotFound("Rreshti nuk u gjet.");

        var qty = line.Quantity;
        var productId = line.ProductId;
        var toBinId = line.ToBinId;

        _db.InboundDocumentLines.Remove(line);
        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            action: "DELETE_LINE_INBOUND",
            entity: "InboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, LineId={cmd.LineId}, ProductId={productId}, ToBinId={toBinId}, QtyDeleted={qty}"
        );

        return ServiceResult<DeleteLineResponse>.Ok(new DeleteLineResponse(cmd.LineId, "Rreshti u fshi."));
    }

    public async Task<ServiceResult<DeleteLineResponse>> DeleteOutboundLineAsync(DeleteOutboundLineCommand cmd)
    {
        var doc = await _db.OutboundDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == cmd.DocumentId);

        if (doc == null) return ServiceResult<DeleteLineResponse>.NotFound("Dokumenti dales (outbound) nuk ekzsiton.");
        if (doc.Status != DocumentStatus.Draft) return ServiceResult<DeleteLineResponse>.BadRequest("Vetëm Draft dokumenti mund të ndryshohet.");

        var line = doc.Lines.FirstOrDefault(x => x.Id == cmd.LineId);
        if (line == null) return ServiceResult<DeleteLineResponse>.NotFound("Rreshti nuk u gjet.");

        var qty = line.Quantity;
        var productId = line.ProductId;
        var fromBinId = line.FromBinId;

        if (line.ReservedQuantity > 0)
        {
            var inv = await FindOutboundInventoryAsync(line);
            if (inv == null)
                return ServiceResult<DeleteLineResponse>.BadRequest("Nuk u gjet rreshti i sakte i inventarit per kete linje.");

            ReleaseInventoryReservation(inv, line.ReservedQuantity);
        }

        _db.OutboundDocumentLines.Remove(line);
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            action: "DELETE_LINE_OUTBOUND",
            entity: "OutboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, LineId={cmd.LineId}, ProductId={productId}, FromBinId={fromBinId}, QtyDeleted={qty}"
        );

        return ServiceResult<DeleteLineResponse>.Ok(new DeleteLineResponse(cmd.LineId, "Rreshti u fshi."));
    }

    public async Task<ServiceResult<InboundDocumentDetailsResponse>> GetInboundByIdAsync(Guid id)
    {
        var doc = await _db.InboundDocuments
            .AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new InboundDocumentDetailsResponse(
                d.Id,
                d.DocumentNo,
                (int)d.Status,
                d.SupplierId,
                d.Supplier != null ? d.Supplier.Code : null,
                d.Supplier != null ? d.Supplier.Name : null,
                d.Reference,
                d.Note,
                d.CreatedAt,
                d.UpdatedAt,
                d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)),
                _db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m,
                d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) - (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m),
                d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) <= 0m
                    ? "Pa vlere"
                    : (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m
                        ? "I papaguar"
                        : (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice))
                            ? "I paguar plotesisht"
                            : "I paguar pjeserisht",
                _db.PartnerPayments
                    .Where(p => p.InboundDocumentId == d.Id)
                    .OrderByDescending(p => p.PaymentDate)
                    .ThenByDescending(p => p.Id)
                    .Select(p => new DocumentPaymentHistoryItemResponse(
                        p.Id,
                        p.Amount,
                        p.PaymentDate,
                        p.Reference,
                        p.Note))
                    .ToList(),
                d.Lines.Select(l => new InboundLineDetailsResponse(
                    l.Id,
                    l.ProductId,
                    l.Product.Sku,
                    l.Product.Name,
                    l.Product.Barcode,
                    l.Product.Description,
                    l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice,
                    l.Product.RetailPrice,
                    l.Product.WholesalePrice,
                    l.Product.VipPrice,
                    l.ToBinId,
                    l.ToBin != null ? l.ToBin.Code : null,
                    l.ToBin != null ? l.ToBin.Name : null,
                    l.LotNumber,
                    l.BatchNumber,
                    l.ExpiryDate,
                    l.Quantity
                )).ToList()
            ))
            .FirstOrDefaultAsync();

        return doc is null
            ? ServiceResult<InboundDocumentDetailsResponse>.NotFound("Dokumenti hyres (Inbound) nuk u gjet!")
            : ServiceResult<InboundDocumentDetailsResponse>.Ok(doc);
    }

    public async Task<ServiceResult<OutboundDocumentDetailsResponse>> GetOutboundByIdAsync(Guid id)
    {
        var doc = await _db.OutboundDocuments
            .AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new OutboundDocumentDetailsResponse(
                d.Id,
                d.DocumentNo,
                (int)d.Status,
                (int)d.PriceTier,
                d.CustomerId,
                d.Customer != null ? d.Customer.Code : null,
                d.Customer != null ? d.Customer.Name : null,
                d.Reference,
                d.Note,
                d.CreatedAt,
                d.UpdatedAt,
                d.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail
                        ? l.Product.RetailPrice
                        : l.PriceTier == OutboundPriceTier.Wholesale
                            ? l.Product.WholesalePrice
                            : l.Product.VipPrice)),
                _db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m,
                d.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail
                        ? l.Product.RetailPrice
                        : l.PriceTier == OutboundPriceTier.Wholesale
                            ? l.Product.WholesalePrice
                            : l.Product.VipPrice)) - (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m),
                d.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail
                        ? l.Product.RetailPrice
                        : l.PriceTier == OutboundPriceTier.Wholesale
                            ? l.Product.WholesalePrice
                            : l.Product.VipPrice)) <= 0m
                    ? "Pa vlere"
                    : (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m
                        ? "I papaguar"
                        : (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (
                            l.PriceTier == OutboundPriceTier.Retail
                                ? l.Product.RetailPrice
                                : l.PriceTier == OutboundPriceTier.Wholesale
                                    ? l.Product.WholesalePrice
                                    : l.Product.VipPrice))
                            ? "I paguar plotesisht"
                            : "I paguar pjeserisht",
                _db.PartnerPayments
                    .Where(p => p.OutboundDocumentId == d.Id)
                    .OrderByDescending(p => p.PaymentDate)
                    .ThenByDescending(p => p.Id)
                    .Select(p => new DocumentPaymentHistoryItemResponse(
                        p.Id,
                        p.Amount,
                        p.PaymentDate,
                        p.Reference,
                        p.Note))
                    .ToList(),
                d.Lines.Select(l => new OutboundLineDetailsResponse(
                    l.Id,
                    l.ProductId,
                    l.Product.Sku,
                    l.Product.Name,
                    l.Product.Barcode,
                    l.Product.Description,
                    (int)l.PriceTier,
                    l.Product.PurchasePrice,
                    l.Product.RetailPrice,
                    l.Product.WholesalePrice,
                    l.Product.VipPrice,
                    l.FromBinId,
                    l.FromBin.Code,
                    l.FromBin.Name,
                    l.LotNumber,
                    l.BatchNumber,
                    l.ExpiryDate,
                    l.Quantity,
                    l.ReservedQuantity
                )).ToList()
            ))
            .FirstOrDefaultAsync();

        return doc is null
            ? ServiceResult<OutboundDocumentDetailsResponse>.NotFound("Dokumenti dales (outbound) nuk ekziston.")
            : ServiceResult<OutboundDocumentDetailsResponse>.Ok(doc);
    }

    public async Task<ServiceResult<PagedResponse<DocumentListItemResponse>>> ListInboundAsync(InboundListQuery q)
    {
        var page = q.Page < 1 ? 1 : q.Page;
        var pageSize = q.PageSize < 1 ? 1 : q.PageSize > 100 ? 100 : q.PageSize;
        //var sort = (q.Sort ?? "createdat_desc").Trim().ToLowerInvariant();
        var sort = string.IsNullOrWhiteSpace(q.Sort)
            ? "createdat_desc"
            : q.Sort.Trim().ToLowerInvariant();

        var query = _db.InboundDocuments.AsNoTracking().AsQueryable();

        if (q.Status.HasValue) query = query.Where(d => d.Status == q.Status.Value);
        if (q.From.HasValue) query = query.Where(d => d.CreatedAt >= q.From.Value);
        if (q.To.HasValue) query = query.Where(d => d.CreatedAt <= q.To.Value);
        if (q.EmptyOnly == true) query = query.Where(d => !d.Lines.Any());
        if (q.AttentionOnly == true) query = query.Where(d =>
            !d.Lines.Any()
            || string.IsNullOrWhiteSpace(d.Reference)
            || string.IsNullOrWhiteSpace(d.Note)
            || (d.Status == DocumentStatus.Draft && d.Lines.Any()));

        var paymentStatus = q.PaymentStatus?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(paymentStatus))
        {
            query = paymentStatus switch
            {
                "unpaid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m),
                "partial" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) < d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice))),
                "paid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice))),
                "novalue" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) <= 0m),
                _ => query
            };
        }

        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var s = q.Q.Trim();
            query = query.Where(d => d.DocumentNo.Contains(s) || (d.Reference != null && d.Reference.Contains(s)));
            /*query = query.Where(d =>
                EF.Functions.ILike(d.DocumentNo, $"%{s}%") || (d.Reference != null && EF.Functions.ILike(d.Reference, $"%{s}%"))
            );
            */
        }

        // Sorting (UI friendly)
        query = sort switch
        {
            "createdat_asc" => query.OrderBy(d => d.CreatedAt),
            "createdat_desc" => query.OrderByDescending(d => d.CreatedAt),

            "documentno_asc" => query.OrderBy(d => d.DocumentNo),
            "documentno_desc" => query.OrderByDescending(d => d.DocumentNo),

            "status_asc" => query.OrderBy(d => d.Status).ThenByDescending(d => d.CreatedAt),
            "status_desc" => query.OrderByDescending(d => d.Status).ThenByDescending(d => d.CreatedAt),

            _ => query.OrderByDescending(d => d.CreatedAt)
        };

        var total = await query.CountAsync();

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DocumentListItemResponse(
                d.Id,
                d.DocumentNo,
                d.Status.ToString(),
                d.SupplierId,
                d.Supplier != null ? d.Supplier.Code : null,
                d.Supplier != null ? d.Supplier.Name : null,
                d.Reference,
                d.Note,
                d.CreatedAt,
                d.UpdatedAt,
                d.Lines.Count,
                d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)),
                _db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m,
                d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) - (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m),
                d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) <= 0m
                    ? "Pa vlere"
                    : (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m
                        ? "I papaguar"
                        : (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice))
                            ? "I paguar plotesisht"
                            : "I paguar pjeserisht"
            ))
            .ToListAsync();

        return ServiceResult<PagedResponse<DocumentListItemResponse>>.Ok(
            new PagedResponse<DocumentListItemResponse>(page, pageSize, total, sort, items)
        );
    }

    public async Task<ServiceResult<InboundListSummaryResponse>> GetInboundListSummaryAsync(InboundListQuery q)
    {
        var query = _db.InboundDocuments.AsNoTracking().AsQueryable();

        if (q.Status.HasValue) query = query.Where(d => d.Status == q.Status.Value);
        if (q.From.HasValue) query = query.Where(d => d.CreatedAt >= q.From.Value);
        if (q.To.HasValue) query = query.Where(d => d.CreatedAt <= q.To.Value);
        if (q.EmptyOnly == true) query = query.Where(d => !d.Lines.Any());
        if (q.AttentionOnly == true) query = query.Where(d =>
            !d.Lines.Any()
            || string.IsNullOrWhiteSpace(d.Reference)
            || string.IsNullOrWhiteSpace(d.Note)
            || (d.Status == DocumentStatus.Draft && d.Lines.Any()));

        var paymentStatus = q.PaymentStatus?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(paymentStatus))
        {
            query = paymentStatus switch
            {
                "unpaid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m),
                "partial" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) < d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice))),
                "paid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.InboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice))),
                "novalue" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (l.PurchasePrice > 0m ? l.PurchasePrice : l.Product.PurchasePrice)) <= 0m),
                _ => query
            };
        }

        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var s = q.Q.Trim();
            query = query.Where(d => d.DocumentNo.Contains(s) || (d.Reference != null && d.Reference.Contains(s)));
        }

        var totalDocuments = await query.CountAsync();
        var draftCount = await query.CountAsync(d => d.Status == DocumentStatus.Draft);
        var confirmedCount = await query.CountAsync(d => d.Status == DocumentStatus.Confirmed);
        var cancelledCount = await query.CountAsync(d => d.Status == DocumentStatus.Cancelled);
        var emptyDocumentsCount = await query.CountAsync(d => !d.Lines.Any());
        var attentionCount = await query.CountAsync(d =>
            !d.Lines.Any()
            || string.IsNullOrWhiteSpace(d.Reference)
            || string.IsNullOrWhiteSpace(d.Note)
            || (d.Status == DocumentStatus.Draft && d.Lines.Any()));

        return ServiceResult<InboundListSummaryResponse>.Ok(
            new InboundListSummaryResponse(
                totalDocuments,
                draftCount,
                confirmedCount,
                cancelledCount,
                emptyDocumentsCount,
                attentionCount
            )
        );
    }

    public async Task<ServiceResult<PagedResponse<DocumentListItemResponse>>> ListOutboundAsync(OutboundListQuery q)
    {
        var page = q.Page < 1 ? 1 : q.Page;
        var pageSize = q.PageSize < 1 ? 1 : q.PageSize > 100 ? 100 : q.PageSize;
        //var sort = (q.Sort ?? "createdat_desc").Trim().ToLowerInvariant();
        var sort = string.IsNullOrWhiteSpace(q.Sort)
            ? "createdat_desc"
            : q.Sort.Trim().ToLowerInvariant();

        var query = _db.OutboundDocuments.AsNoTracking().AsQueryable();

        if (q.Status.HasValue) query = query.Where(d => d.Status == q.Status.Value);
        if (q.From.HasValue) query = query.Where(d => d.CreatedAt >= q.From.Value);
        if (q.To.HasValue) query = query.Where(d => d.CreatedAt <= q.To.Value);
        if (q.EmptyOnly == true) query = query.Where(d => !d.Lines.Any());
        if (q.AttentionOnly == true) query = query.Where(d =>
            !d.Lines.Any()
            || string.IsNullOrWhiteSpace(d.Reference)
            || string.IsNullOrWhiteSpace(d.Note)
            || (d.Status == DocumentStatus.Draft && d.Lines.Any()));

        var paymentStatus = q.PaymentStatus?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(paymentStatus))
        {
            query = paymentStatus switch
            {
                "unpaid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m),
                "partial" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) < d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice))),
                "paid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice))),
                "novalue" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) <= 0m),
                _ => query
            };
        }

        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var s = q.Q.Trim();
            query = query.Where(d => d.DocumentNo.Contains(s) || (d.Reference != null && d.Reference.Contains(s)));
        }

        query = sort switch
        {
            "createdat_asc" => query.OrderBy(d => d.CreatedAt),
            "createdat_desc" => query.OrderByDescending(d => d.CreatedAt),

            "documentno_asc" => query.OrderBy(d => d.DocumentNo),
            "documentno_desc" => query.OrderByDescending(d => d.DocumentNo),

            "status_asc" => query.OrderBy(d => d.Status).ThenByDescending(d => d.CreatedAt),
            "status_desc" => query.OrderByDescending(d => d.Status).ThenByDescending(d => d.CreatedAt),

            _ => query.OrderByDescending(d => d.CreatedAt)
        };

        var total = await query.CountAsync();

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DocumentListItemResponse(
                d.Id,
                d.DocumentNo,
                d.Status.ToString(),
                d.CustomerId,
                d.Customer != null ? d.Customer.Code : null,
                d.Customer != null ? d.Customer.Name : null,
                d.Reference,
                d.Note,
                d.CreatedAt,
                d.UpdatedAt,
                d.Lines.Count,
                d.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail
                        ? l.Product.RetailPrice
                        : l.PriceTier == OutboundPriceTier.Wholesale
                            ? l.Product.WholesalePrice
                            : l.Product.VipPrice)),
                _db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m,
                d.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail
                        ? l.Product.RetailPrice
                        : l.PriceTier == OutboundPriceTier.Wholesale
                            ? l.Product.WholesalePrice
                            : l.Product.VipPrice)) - (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m),
                d.Lines.Sum(l => l.Quantity * (
                    l.PriceTier == OutboundPriceTier.Retail
                        ? l.Product.RetailPrice
                        : l.PriceTier == OutboundPriceTier.Wholesale
                            ? l.Product.WholesalePrice
                            : l.Product.VipPrice)) <= 0m
                    ? "Pa vlere"
                    : (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m
                        ? "I papaguar"
                        : (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (
                            l.PriceTier == OutboundPriceTier.Retail
                                ? l.Product.RetailPrice
                                : l.PriceTier == OutboundPriceTier.Wholesale
                                    ? l.Product.WholesalePrice
                                    : l.Product.VipPrice))
                            ? "I paguar plotesisht"
                            : "I paguar pjeserisht"
            ))
            .ToListAsync();

        return ServiceResult<PagedResponse<DocumentListItemResponse>>.Ok(
            new PagedResponse<DocumentListItemResponse>(page, pageSize, total, sort, items)
        );
    }

    public async Task<ServiceResult<InboundListSummaryResponse>> GetOutboundListSummaryAsync(OutboundListQuery q)
    {
        var query = _db.OutboundDocuments.AsNoTracking().AsQueryable();

        if (q.Status.HasValue) query = query.Where(d => d.Status == q.Status.Value);
        if (q.From.HasValue) query = query.Where(d => d.CreatedAt >= q.From.Value);
        if (q.To.HasValue) query = query.Where(d => d.CreatedAt <= q.To.Value);
        if (q.EmptyOnly == true) query = query.Where(d => !d.Lines.Any());
        if (q.AttentionOnly == true) query = query.Where(d =>
            !d.Lines.Any()
            || string.IsNullOrWhiteSpace(d.Reference)
            || string.IsNullOrWhiteSpace(d.Note)
            || (d.Status == DocumentStatus.Draft && d.Lines.Any()));

        var paymentStatus = q.PaymentStatus?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(paymentStatus))
        {
            query = paymentStatus switch
            {
                "unpaid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) <= 0m),
                "partial" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) < d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice))),
                "paid" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) > 0m
                    && (_db.PartnerPayments.Where(p => p.OutboundDocumentId == d.Id).Select(p => (decimal?)p.Amount).Sum() ?? 0m) >= d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice))),
                "novalue" => query.Where(d =>
                    d.Status == DocumentStatus.Confirmed
                    && d.Lines.Sum(l => l.Quantity * (
                        l.PriceTier == OutboundPriceTier.Retail
                            ? l.Product.RetailPrice
                            : l.PriceTier == OutboundPriceTier.Wholesale
                                ? l.Product.WholesalePrice
                                : l.Product.VipPrice)) <= 0m),
                _ => query
            };
        }

        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var s = q.Q.Trim();
            query = query.Where(d => d.DocumentNo.Contains(s) || (d.Reference != null && d.Reference.Contains(s)));
        }

        var totalDocuments = await query.CountAsync();
        var draftCount = await query.CountAsync(d => d.Status == DocumentStatus.Draft);
        var confirmedCount = await query.CountAsync(d => d.Status == DocumentStatus.Confirmed);
        var cancelledCount = await query.CountAsync(d => d.Status == DocumentStatus.Cancelled);
        var emptyDocumentsCount = await query.CountAsync(d => !d.Lines.Any());
        var attentionCount = await query.CountAsync(d =>
            !d.Lines.Any()
            || string.IsNullOrWhiteSpace(d.Reference)
            || string.IsNullOrWhiteSpace(d.Note)
            || (d.Status == DocumentStatus.Draft && d.Lines.Any()));

        return ServiceResult<InboundListSummaryResponse>.Ok(
            new InboundListSummaryResponse(
                totalDocuments,
                draftCount,
                confirmedCount,
                cancelledCount,
                emptyDocumentsCount,
                attentionCount
            )
        );
    }
}
