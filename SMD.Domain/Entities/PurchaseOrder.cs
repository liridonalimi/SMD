using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class PurchaseOrder : BaseEntity
{
    public string OrderNo { get; set; } = null!;
    public OrderStatus Status { get; set; } = OrderStatus.Draft;
    public Guid? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public DateTime? ExpectedDate { get; set; }
    public Guid? InboundDocumentId { get; set; }
    public InboundDocument? InboundDocument { get; set; }
    public ICollection<PurchaseOrderLine> Lines { get; set; } = new List<PurchaseOrderLine>();
}
