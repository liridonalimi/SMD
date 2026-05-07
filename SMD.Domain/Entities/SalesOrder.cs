using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class SalesOrder : BaseEntity
{
    public string OrderNo { get; set; } = null!;
    public OrderStatus Status { get; set; } = OrderStatus.Draft;
    public OutboundPriceTier PriceTier { get; set; } = OutboundPriceTier.Retail;
    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public DateTime? RequestedDate { get; set; }
    public Guid? OutboundDocumentId { get; set; }
    public OutboundDocument? OutboundDocument { get; set; }
    public ICollection<SalesOrderLine> Lines { get; set; } = new List<SalesOrderLine>();
}
