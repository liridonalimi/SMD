using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class StockMovement : BaseEntity
{
    public StockMovementType Type { get; set; }

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;

    // FROM (opsionale për IN)
    public Guid? FromBinId { get; set; }
    public Bin? FromBin { get; set; }

    // TO (opsionale për OUT)
    public Guid? ToBinId { get; set; }
    public Bin? ToBin { get; set; }

    public decimal Quantity { get; set; }

    // fushat e audit
    public Guid? PerformedByUserId { get; set; }   // nga JWT (UserId)
    public string? Reference { get; set; }         // p.sh. PO-123, SO-55
    public string? Note { get; set; }              // arsye/koment
}