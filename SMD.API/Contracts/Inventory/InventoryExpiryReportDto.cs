namespace SMD.API.Contracts.Inventory;

public class InventoryExpiryReportDto
{
    public int ExpiredCount { get; set; }
    public int ExpiringIn7DaysCount { get; set; }
    public int ExpiringIn30DaysCount { get; set; }
    public List<InventoryExpiryItemDto> ExpiredItems { get; set; } = [];
    public List<InventoryExpiryItemDto> ExpiringIn7DaysItems { get; set; } = [];
    public List<InventoryExpiryItemDto> ExpiringIn30DaysItems { get; set; } = [];
}

public class InventoryExpiryItemDto
{
    public Guid InventoryId { get; set; }
    public Guid ProductId { get; set; }
    public string ProductSku { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public string BinCode { get; set; } = string.Empty;
    public string WarehouseCode { get; set; } = string.Empty;
    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime ExpiryDate { get; set; }
    public decimal QtyAvailable { get; set; }
}
