using SMD.Domain.Common;

namespace SMD.Domain.Entities;

public class CycleCountLine : BaseEntity
{
    public Guid CycleCountId { get; set; }
    public CycleCount CycleCount { get; set; } = null!;

    public Guid InventoryId { get; set; }
    public Inventory Inventory { get; set; } = null!;

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;

    public Guid BinId { get; set; }
    public Bin Bin { get; set; } = null!;

    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }

    public decimal ExpectedQty { get; set; }
    public decimal ReservedQty { get; set; }
    public decimal? CountedQty { get; set; }

    public string? Note { get; set; }
}
