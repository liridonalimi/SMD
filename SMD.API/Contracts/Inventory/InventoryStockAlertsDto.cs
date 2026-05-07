namespace SMD.API.Contracts.Inventory;

public class InventoryStockAlertsDto
{
    public int ProductsOutOfStock { get; set; }
    public int LowStockProducts { get; set; }
    public List<InventoryProductStockAlertDto> OutOfStockItems { get; set; } = [];
    public List<InventoryProductStockAlertDto> LowStockItems { get; set; } = [];
}

public class InventoryProductStockAlertDto
{
    public Guid ProductId { get; set; }
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string Barcode { get; set; } = "";
    public decimal QtyOnHand { get; set; }
    public decimal QtyReserved { get; set; }
    public decimal QtyAvailable { get; set; }
    public decimal MinStockLevel { get; set; }
    public decimal MissingToMinStock { get; set; }
    public bool HasInventoryRows { get; set; }
}
