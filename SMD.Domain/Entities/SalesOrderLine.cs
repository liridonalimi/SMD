using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class SalesOrderLine : BaseEntity
{
    public Guid SalesOrderId { get; set; }
    public SalesOrder SalesOrder { get; set; } = null!;
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public Guid FromBinId { get; set; }
    public Bin FromBin { get; set; } = null!;
    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public OutboundPriceTier PriceTier { get; set; } = OutboundPriceTier.Retail;
    public decimal Quantity { get; set; }
    public decimal ReservedQuantity { get; set; }
}
