namespace SMD.Application.Services.Exports;

public class InventoryExportQuery
{
	public string? Search { get; set; }

	public Guid? WarehouseId { get; set; }
	public Guid? ZoneId { get; set; }
	public Guid? RackId { get; set; }
	public Guid? BinId { get; set; }
	public Guid? ProductId { get; set; }

	public bool OnlyInStock { get; set; } = false;
	public bool OnlyOutOfStock { get; set; } = false;
	public bool OnlyBelowMinStock { get; set; } = false;
	public decimal? LowStockThreshold { get; set; }

	public string SortBy { get; set; } = "sku";
	public string SortDir { get; set; } = "asc";
}
