using SMD.Domain.Common;
using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Domain.Entities
{
    public class InboundDocumentLine : BaseEntity
    {
        public Guid InboundDocumentId { get; set; }
        public InboundDocument InboundDocument { get; set; } = null!;

        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;

        public Guid? ToBinId { get; set; }
        public Bin? ToBin { get; set; }

        public string? LotNumber { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }

        public decimal Quantity { get; set; }
        public decimal PurchasePrice { get; set; }
    }
}
