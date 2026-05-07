namespace SMD.API.Contracts.Inventory;

public class InventoryChartsDto
{
    public List<WarehouseStockPoint> StockByWarehouse { get; set; } = new();
    public List<ProductPoint> LowStockTop { get; set; } = new();
    public List<ProductPoint> OutOfStockTop { get; set; } = new();
    public List<ProductPoint> TopMovers30d { get; set; } = new();
}

public class WarehouseStockPoint
{
    public Guid WarehouseId { get; set; }
    public string WarehouseCode { get; set; } = "";
    public string WarehouseName { get; set; } = "";
    public decimal QtyOnHand { get; set; }
    public decimal QtyReserved { get; set; }
    public decimal QtyAvailable { get; set; }
}

public class ProductPoint
{
    public Guid ProductId { get; set; }
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Value { get; set; }
}
