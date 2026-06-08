using Microsoft.EntityFrameworkCore;
using SMD.Application.Contracts.Responses;
using SMD.Application.Services;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;

namespace SMD.Infrastructure.Services.Dashboard;

public class DashboardService : IDashboardService
{
    private readonly SmdDbContext _db;

    public DashboardService(SmdDbContext db)
    {
        _db = db;
    }

    public async Task<DashboardSummaryResponse> GetSummaryAsync(CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);

        var inboundToday = await _db.InboundDocuments
            .AsNoTracking()
            .CountAsync(x => x.CreatedAt >= today && x.CreatedAt < tomorrow, ct);

        var outboundToday = await _db.OutboundDocuments
            .AsNoTracking()
            .CountAsync(x => x.CreatedAt >= today && x.CreatedAt < tomorrow, ct);

        var inboundDrafts = await _db.InboundDocuments
            .AsNoTracking()
            .CountAsync(x => x.Status == DocumentStatus.Draft, ct);

        var outboundDrafts = await _db.OutboundDocuments
            .AsNoTracking()
            .CountAsync(x => x.Status == DocumentStatus.Draft, ct);

        var products = await _db.Products
            .AsNoTracking()
            .CountAsync(ct);

        var bins = await _db.Bins
            .AsNoTracking()
            .CountAsync(ct);

        var auditLogs = await _db.AuditLogs
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .Take(10)
            .Select(x => new AuditLogItemDto
            {
                Action = x.Action,
                Entity = x.Entity,
                EntityId = x.EntityId,
                CreatedAt = x.CreatedAt,
                IpAddress = x.IpAddress,
                Details = x.Details
            })
            .ToListAsync(ct);

        var expiredInventoryCount = await _db.Inventories
            .AsNoTracking()
            .CountAsync(x => x.ExpiryDate.HasValue && x.ExpiryDate.Value < today && (x.QtyOnHand - x.QtyReserved) > 0, ct);

        var nearExpiryInventoryCount = await _db.Inventories
            .AsNoTracking()
            .CountAsync(x => x.ExpiryDate.HasValue && x.ExpiryDate.Value >= today && x.ExpiryDate.Value <= today.AddDays(30) && (x.QtyOnHand - x.QtyReserved) > 0, ct);

        var stockByProduct = await _db.Inventories
            .AsNoTracking()
            .GroupBy(x => x.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                AvailableQty = g.Sum(x => x.QtyOnHand - x.QtyReserved)
            })
            .ToListAsync(ct);

        var stockMap = stockByProduct.ToDictionary(x => x.ProductId, x => x.AvailableQty);
        var stockAlertProducts = await _db.Products
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new
            {
                x.Id,
                x.Sku,
                x.Name,
                MinStockLevel = x.MinStockLevel > 0 ? x.MinStockLevel : 5m
            })
            .ToListAsync(ct);

        var stockAlertRows = stockAlertProducts
            .Select(x =>
            {
                stockMap.TryGetValue(x.Id, out var availableQty);
                return new DashboardLowStockAlertItemDto
                {
                    ProductId = x.Id,
                    ProductCode = x.Sku,
                    ProductName = x.Name,
                    AvailableQty = availableQty,
                    MinStockLevel = x.MinStockLevel,
                    IsOutOfStock = availableQty <= 0
                };
            })
            .Where(x => x.IsOutOfStock || x.AvailableQty <= x.MinStockLevel)
            .OrderByDescending(x => x.IsOutOfStock)
            .ThenBy(x => x.AvailableQty)
            .ThenBy(x => x.ProductCode)
            .ToList();

        var outOfStockProductsCount = stockAlertRows.Count(x => x.IsOutOfStock);
        var lowStockProductsCount = stockAlertRows.Count(x => !x.IsOutOfStock);
        var lowStockAlerts = stockAlertRows.Take(6).ToList();

        var expiryAlerts = await _db.Inventories
            .AsNoTracking()
            .Where(x => x.ExpiryDate.HasValue && x.ExpiryDate.Value <= today.AddDays(30) && (x.QtyOnHand - x.QtyReserved) > 0)
            .OrderBy(x => x.ExpiryDate)
            .ThenByDescending(x => x.QtyOnHand - x.QtyReserved)
            .Take(6)
            .Select(x => new DashboardExpiryAlertItemDto
            {
                InventoryId = x.Id,
                ProductCode = x.Product.Sku,
                ProductName = x.Product.Name,
                WarehouseName = x.Bin.Rack.Zone.Warehouse.Name,
                BinCode = x.Bin.Code,
                LotNumber = x.LotNumber,
                BatchNumber = x.BatchNumber,
                ExpiryDate = x.ExpiryDate!.Value,
                AvailableQty = x.QtyOnHand - x.QtyReserved,
                IsExpired = x.ExpiryDate.Value < today
            })
            .ToListAsync(ct);

        var customerBalanceRows = await _db.OutboundDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.CustomerId != null)
            .Select(x => new
            {
                PartnerId = x.CustomerId!.Value,
                PartnerCode = x.Customer!.Code,
                PartnerName = x.Customer!.Name,
                DocumentTotal = x.Lines.Sum(line => line.Quantity * (
                    line.PriceTier == OutboundPriceTier.Retail
                        ? line.Product.RetailPrice
                        : line.PriceTier == OutboundPriceTier.Wholesale
                            ? line.Product.WholesalePrice
                            : line.Product.VipPrice)),
                PaidTotal = _db.PartnerPayments
                    .Where(p => p.OutboundDocumentId == x.Id)
                    .Select(p => (decimal?)p.Amount)
                    .Sum() ?? 0m
            })
            .ToListAsync(ct);

        var supplierBalanceRows = await _db.InboundDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.SupplierId != null)
            .Select(x => new
            {
                PartnerId = x.SupplierId!.Value,
                PartnerCode = x.Supplier!.Code,
                PartnerName = x.Supplier!.Name,
                DocumentTotal = x.Lines.Sum(line => line.Quantity * (line.PurchasePrice > 0m ? line.PurchasePrice : line.Product.PurchasePrice)),
                PaidTotal = _db.PartnerPayments
                    .Where(p => p.InboundDocumentId == x.Id)
                    .Select(p => (decimal?)p.Amount)
                    .Sum() ?? 0m
            })
            .ToListAsync(ct);

        var customerReturnBalanceRows = await _db.ReturnDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.Type == ReturnDocumentType.CustomerReturn && x.CustomerId != null)
            .Select(x => new
            {
                PartnerId = x.CustomerId!.Value,
                PartnerCode = x.Customer!.Code,
                PartnerName = x.Customer!.Name,
                DocumentTotal = -x.Lines.Sum(line => line.Quantity * (
                    line.PriceTier == OutboundPriceTier.Retail
                        ? line.Product.RetailPrice
                        : line.PriceTier == OutboundPriceTier.Wholesale
                            ? line.Product.WholesalePrice
                            : line.Product.VipPrice)),
                PaidTotal = 0m
            })
            .ToListAsync(ct);

        var supplierReturnBalanceRows = await _db.ReturnDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.Type == ReturnDocumentType.SupplierReturn && x.SupplierId != null)
            .Select(x => new
            {
                PartnerId = x.SupplierId!.Value,
                PartnerCode = x.Supplier!.Code,
                PartnerName = x.Supplier!.Name,
                DocumentTotal = -x.Lines.Sum(line => line.Quantity * line.Product.PurchasePrice),
                PaidTotal = 0m
            })
            .ToListAsync(ct);

        customerBalanceRows.AddRange(customerReturnBalanceRows);
        supplierBalanceRows.AddRange(supplierReturnBalanceRows);

        var topCustomerDebtors = customerBalanceRows
            .GroupBy(x => new { x.PartnerId, x.PartnerCode, x.PartnerName })
            .Select(g => new DashboardPartnerBalanceAlertItemDto
            {
                PartnerId = g.Key.PartnerId,
                PartnerType = "customer",
                PartnerCode = g.Key.PartnerCode,
                PartnerName = g.Key.PartnerName,
                Balance = g.Sum(x => x.DocumentTotal - x.PaidTotal),
                LastPaymentDate = null
            })
            .Where(x => x.Balance > 0)
            .OrderByDescending(x => x.Balance)
            .ThenBy(x => x.PartnerCode)
            .Take(5)
            .ToList();

        var topSupplierPayables = supplierBalanceRows
            .GroupBy(x => new { x.PartnerId, x.PartnerCode, x.PartnerName })
            .Select(g => new DashboardPartnerBalanceAlertItemDto
            {
                PartnerId = g.Key.PartnerId,
                PartnerType = "supplier",
                PartnerCode = g.Key.PartnerCode,
                PartnerName = g.Key.PartnerName,
                Balance = g.Sum(x => x.DocumentTotal - x.PaidTotal),
                LastPaymentDate = null
            })
            .Where(x => x.Balance > 0)
            .OrderByDescending(x => x.Balance)
            .ThenBy(x => x.PartnerCode)
            .Take(5)
            .ToList();

        var unpaidOutboundDocuments = await _db.OutboundDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.CustomerId != null)
            .Select(x => new
            {
                x.Id,
                x.DocumentNo,
                x.CreatedAt,
                PartnerCode = x.Customer!.Code,
                PartnerName = x.Customer!.Name,
                DocumentTotal = x.Lines.Sum(line => line.Quantity * (
                    line.PriceTier == OutboundPriceTier.Retail
                        ? line.Product.RetailPrice
                        : line.PriceTier == OutboundPriceTier.Wholesale
                            ? line.Product.WholesalePrice
                            : line.Product.VipPrice)),
                PaidTotal = _db.PartnerPayments
                    .Where(p => p.OutboundDocumentId == x.Id)
                    .Select(p => (decimal?)p.Amount)
                    .Sum() ?? 0m
            })
            .ToListAsync(ct);

        var unpaidInboundDocuments = await _db.InboundDocuments
            .AsNoTracking()
            .Where(x => x.Status == DocumentStatus.Confirmed && x.SupplierId != null)
            .Select(x => new
            {
                x.Id,
                x.DocumentNo,
                x.CreatedAt,
                PartnerCode = x.Supplier!.Code,
                PartnerName = x.Supplier!.Name,
                DocumentTotal = x.Lines.Sum(line => line.Quantity * (line.PurchasePrice > 0m ? line.PurchasePrice : line.Product.PurchasePrice)),
                PaidTotal = _db.PartnerPayments
                    .Where(p => p.InboundDocumentId == x.Id)
                    .Select(p => (decimal?)p.Amount)
                    .Sum() ?? 0m
            })
            .ToListAsync(ct);

        var paymentAlerts = unpaidOutboundDocuments
            .Select(x => new DashboardPaymentAlertItemDto
            {
                DocumentId = x.Id,
                DocumentType = "outbound",
                DocumentNo = x.DocumentNo,
                PartnerCode = x.PartnerCode,
                PartnerName = x.PartnerName,
                Balance = x.DocumentTotal - x.PaidTotal,
                PaymentStatus = ToPaymentStatus(x.DocumentTotal, x.PaidTotal),
                CreatedAt = x.CreatedAt
            })
            .Concat(unpaidInboundDocuments.Select(x => new DashboardPaymentAlertItemDto
            {
                DocumentId = x.Id,
                DocumentType = "inbound",
                DocumentNo = x.DocumentNo,
                PartnerCode = x.PartnerCode,
                PartnerName = x.PartnerName,
                Balance = x.DocumentTotal - x.PaidTotal,
                PaymentStatus = ToPaymentStatus(x.DocumentTotal, x.PaidTotal),
                CreatedAt = x.CreatedAt
            }))
            .Where(x => x.Balance > 0)
            .OrderByDescending(x => x.Balance)
            .ThenByDescending(x => x.CreatedAt)
            .Take(6)
            .ToList();

        var staleTaskCutoff = DateTime.UtcNow.AddHours(-24);
        var activeTaskStatuses = new[] { WarehouseTaskStatus.Open, WarehouseTaskStatus.InProgress, WarehouseTaskStatus.Blocked };

        var activeWarehouseTasks = await _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.Product)
            .Include(x => x.FromBin)
            .Include(x => x.ToBin)
            .Include(x => x.AssignedToUser)
            .Where(x => activeTaskStatuses.Contains(x.Status))
            .ToListAsync(ct);

        var openWarehouseTasksCount = activeWarehouseTasks.Count;
        var unassignedWarehouseTasksCount = activeWarehouseTasks.Count(x => x.AssignedToUserId == null);
        var staleWarehouseTasksCount = activeWarehouseTasks.Count(x => x.CreatedAt <= staleTaskCutoff);

        var warehouseTaskAlerts = activeWarehouseTasks
            .OrderByDescending(x => x.AssignedToUserId == null)
            .ThenByDescending(x => x.Status == WarehouseTaskStatus.Blocked)
            .ThenByDescending(x => x.CreatedAt <= staleTaskCutoff)
            .ThenBy(x => x.Status == WarehouseTaskStatus.InProgress ? 0 : 1)
            .ThenBy(x => x.CreatedAt)
            .Take(6)
            .Select(x => new DashboardWarehouseTaskAlertItemDto
            {
                TaskId = x.Id,
                TaskNo = x.TaskNo,
                Type = x.Type.ToString(),
                Status = x.Status.ToString(),
                ProductCode = x.Product?.Sku,
                ProductName = x.Product?.Name,
                FromBinCode = x.FromBin?.Code,
                ToBinCode = x.ToBin?.Code,
                Quantity = x.Quantity,
                AssignedToUsername = x.AssignedToUser?.Username,
                Reference = x.Reference,
                Note = x.Note,
                CreatedAt = x.CreatedAt,
                IsUnassigned = x.AssignedToUserId == null,
                IsStale = x.CreatedAt <= staleTaskCutoff
            })
            .ToList();

        return new DashboardSummaryResponse
        {
            InboundTodayCount = inboundToday,
            OutboundTodayCount = outboundToday,
            PendingDraftsCount = inboundDrafts + outboundDrafts,
            TotalProducts = products,
            TotalBins = bins,
            ExpiredInventoryCount = expiredInventoryCount,
            NearExpiryInventoryCount = nearExpiryInventoryCount,
            OutOfStockProductsCount = outOfStockProductsCount,
            LowStockProductsCount = lowStockProductsCount,
            UnpaidDocumentsCount = paymentAlerts.Count,
            OpenWarehouseTasksCount = openWarehouseTasksCount,
            UnassignedWarehouseTasksCount = unassignedWarehouseTasksCount,
            StaleWarehouseTasksCount = staleWarehouseTasksCount,
            CustomerDebtTotal = customerBalanceRows.Sum(x => x.DocumentTotal - x.PaidTotal),
            SupplierPayableTotal = supplierBalanceRows.Sum(x => x.DocumentTotal - x.PaidTotal),
            LatestAuditLogs = auditLogs,
            ExpiryAlerts = expiryAlerts,
            LowStockAlerts = lowStockAlerts,
            TopCustomerDebtors = topCustomerDebtors,
            TopSupplierPayables = topSupplierPayables,
            PaymentAlerts = paymentAlerts,
            WarehouseTaskAlerts = warehouseTaskAlerts
        };
    }

    private static string ToPaymentStatus(decimal documentTotal, decimal paidTotal)
    {
        if (documentTotal <= 0) return "Pa vlere";
        if (paidTotal <= 0) return "i papaguar";
        if (paidTotal >= documentTotal) return "i paguar plotesisht";
        return "i paguar pjeserisht";
    }
}
