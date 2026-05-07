using SMD.Domain.Common;
using SMD.Domain.Enums;
using System;
using System.Collections.Generic;
using System.Text;
using System.ComponentModel.DataAnnotations;

namespace SMD.Domain.Entities
{
    public class OutboundDocument : BaseEntity
    {
        public string DocumentNo { get; set; } = null!;
        public DocumentStatus Status { get; set; } = DocumentStatus.Draft;
        public OutboundPriceTier PriceTier { get; set; } = OutboundPriceTier.Retail;
        public Guid? CustomerId { get; set; }
        public Customer? Customer { get; set; }
        public string? Reference { get; set; } // SO-456
        public string? Note { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
        public ICollection<OutboundDocumentLine> Lines { get; set; }
            = new List<OutboundDocumentLine>();
    }
}
