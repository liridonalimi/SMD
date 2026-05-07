namespace SMD.API.Contracts.Inventory;

public class InventorySummaryDto
{
    public int TotalProducts { get; set; }
    public decimal TotalQtyOnHand { get; set; }
    public decimal TotalQtyReserved { get; set; }
    public decimal TotalQtyAvailable { get; set; }

    public int ProductsInStock { get; set; }
    public int ProductsOutOfStock { get; set; }
    public int LowStockProducts { get; set; }
}
