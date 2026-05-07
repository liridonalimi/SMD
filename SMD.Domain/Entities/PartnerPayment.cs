using SMD.Domain.Common;

namespace SMD.Domain.Entities
{
    public class PartnerPayment : BaseEntity
    {
        public Guid? CustomerId { get; set; }
        public Customer? Customer { get; set; }

        public Guid? SupplierId { get; set; }
        public Supplier? Supplier { get; set; }

        public Guid? InboundDocumentId { get; set; }
        public InboundDocument? InboundDocument { get; set; }

        public Guid? OutboundDocumentId { get; set; }
        public OutboundDocument? OutboundDocument { get; set; }

        public decimal Amount { get; set; }
        public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
        public string? Reference { get; set; }
        public string? Note { get; set; }
    }
}
