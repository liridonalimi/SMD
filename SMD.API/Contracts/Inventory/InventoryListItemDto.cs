namespace SMD.API.Contracts.Inventory;

public class InventoryListItemDto
{
    public Guid InventoryId { get; set; }

    public Guid ProductId { get; set; }
    public string ProductSku { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string ProductBarcode { get; set; } = "";
    public string ProductDescription { get; set; } = "";
    public string ProductUnitOfMeasure { get; set; } = "";
    public decimal ProductMinStockLevel { get; set; }
    public bool IsBelowMinStock { get; set; }

    public Guid BinId { get; set; }
    public string BinCode { get; set; } = "";
    public string BinName { get; set; } = "";

    public Guid RackId { get; set; }
    public string RackCode { get; set; } = "";
    public string RackName { get; set; } = "";

    public Guid ZoneId { get; set; }
    public string ZoneCode { get; set; } = "";
    public string ZoneName { get; set; } = "";

    public Guid WarehouseId { get; set; }
    public string WarehouseCode { get; set; } = "";
    public string WarehouseName { get; set; } = "";
    public string WarehouseAddress { get; set; } = "";

    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public bool IsExpired { get; set; }
    public bool IsNearExpiry { get; set; }

    public decimal QtyOnHand { get; set; }
    public decimal QtyReserved { get; set; }
    public decimal QtyAvailable { get; set; }
}
