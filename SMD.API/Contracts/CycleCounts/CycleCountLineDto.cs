namespace SMD.API.Contracts.CycleCounts;

public class CycleCountLineDto
{
    public Guid Id { get; set; }
    public Guid InventoryId { get; set; }
    public Guid ProductId { get; set; }
    public string ProductSku { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string? ProductBarcode { get; set; }

    public Guid BinId { get; set; }
    public string BinCode { get; set; } = "";
    public string BinName { get; set; } = "";
    public string RackCode { get; set; } = "";
    public string ZoneCode { get; set; } = "";
    public string WarehouseCode { get; set; } = "";

    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }

    public decimal ExpectedQty { get; set; }
    public decimal ReservedQty { get; set; }
    public decimal? CountedQty { get; set; }
    public decimal VarianceQty { get; set; }
    public string? Note { get; set; }
}
