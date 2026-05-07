namespace SMD.API.Contracts.Inventory;

public class InventoryListQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;

    public string? Search { get; set; }

    public Guid? WarehouseId { get; set; }
    public Guid? ZoneId { get; set; }
    public Guid? RackId { get; set; }
    public Guid? BinId { get; set; }
    public Guid? ProductId { get; set; }

    public bool OnlyInStock { get; set; } = false;
    public bool OnlyOutOfStock { get; set; } = false;
    public bool OnlyBelowMinStock { get; set; } = false;
    public string? ExpiryFilter { get; set; }
    public decimal? LowStockThreshold { get; set; }

    public string SortBy { get; set; } = "sku";   // sku|name|qty|available
    public string SortDir { get; set; } = "asc";  // asc|desc
}
