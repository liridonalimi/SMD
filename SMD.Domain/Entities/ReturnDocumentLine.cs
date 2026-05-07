using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class ReturnDocumentLine : BaseEntity
{
    public Guid ReturnDocumentId { get; set; }
    public ReturnDocument ReturnDocument { get; set; } = null!;

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;

    public Guid BinId { get; set; }
    public Bin Bin { get; set; } = null!;

    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }

    public OutboundPriceTier PriceTier { get; set; } = OutboundPriceTier.Retail;
    public decimal Quantity { get; set; }
}
