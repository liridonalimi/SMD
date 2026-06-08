namespace SMD.Application.Contracts.Responses;

public class DashboardSummaryResponse
{
    public int InboundTodayCount { get; set; }
    public int OutboundTodayCount { get; set; }
    public int PendingDraftsCount { get; set; }

    public int TotalProducts { get; set; }
    public int TotalBins { get; set; }
    public int ExpiredInventoryCount { get; set; }
    public int NearExpiryInventoryCount { get; set; }
    public int OutOfStockProductsCount { get; set; }
    public int LowStockProductsCount { get; set; }
    public int UnpaidDocumentsCount { get; set; }
    public int OpenWarehouseTasksCount { get; set; }
    public int UnassignedWarehouseTasksCount { get; set; }
    public int StaleWarehouseTasksCount { get; set; }
    public decimal CustomerDebtTotal { get; set; }
    public decimal SupplierPayableTotal { get; set; }

    public List<AuditLogItemDto> LatestAuditLogs { get; set; } = new();
    public List<DashboardExpiryAlertItemDto> ExpiryAlerts { get; set; } = new();
    public List<DashboardLowStockAlertItemDto> LowStockAlerts { get; set; } = new();
    public List<DashboardPartnerBalanceAlertItemDto> TopCustomerDebtors { get; set; } = new();
    public List<DashboardPartnerBalanceAlertItemDto> TopSupplierPayables { get; set; } = new();
    public List<DashboardPaymentAlertItemDto> PaymentAlerts { get; set; } = new();
    public List<DashboardWarehouseTaskAlertItemDto> WarehouseTaskAlerts { get; set; } = new();
}

public class AuditLogItemDto
{
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public string? EntityId { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? IpAddress { get; set; }
    public string? Details { get; set; }
}

public class DashboardExpiryAlertItemDto
{
    public Guid InventoryId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string WarehouseName { get; set; } = "";
    public string BinCode { get; set; } = "";
    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime ExpiryDate { get; set; }
    public decimal AvailableQty { get; set; }
    public bool IsExpired { get; set; }
}

public class DashboardLowStockAlertItemDto
{
    public Guid ProductId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public decimal AvailableQty { get; set; }
    public decimal MinStockLevel { get; set; }
    public bool IsOutOfStock { get; set; }
}

public class DashboardPartnerBalanceAlertItemDto
{
    public Guid PartnerId { get; set; }
    public string PartnerType { get; set; } = "";
    public string PartnerCode { get; set; } = "";
    public string PartnerName { get; set; } = "";
    public decimal Balance { get; set; }
    public DateTime? LastPaymentDate { get; set; }
}

public class DashboardPaymentAlertItemDto
{
    public Guid DocumentId { get; set; }
    public string DocumentType { get; set; } = "";
    public string DocumentNo { get; set; } = "";
    public string? PartnerCode { get; set; }
    public string? PartnerName { get; set; }
    public decimal Balance { get; set; }
    public string PaymentStatus { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public class DashboardWarehouseTaskAlertItemDto
{
    public Guid TaskId { get; set; }
    public string TaskNo { get; set; } = "";
    public string Type { get; set; } = "";
    public string Status { get; set; } = "";
    public string? ProductCode { get; set; }
    public string? ProductName { get; set; }
    public string? FromBinCode { get; set; }
    public string? ToBinCode { get; set; }
    public decimal? Quantity { get; set; }
    public string? AssignedToUsername { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsUnassigned { get; set; }
    public bool IsStale { get; set; }
}
