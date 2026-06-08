using SMD.Domain.Common;

namespace SMD.Domain.Entities;

public class Inventory : BaseEntity
{
    public Guid BinId { get; set; }
    public Bin Bin { get; set; } = null!;

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;

    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }

    public decimal QtyOnHand { get; set; } = 0;   // sasia aktuale ne depo
    public decimal QtyReserved { get; set; } = 0; // sasia e rezervuar
}
