using System;
using System.Collections.Generic;
using System.Text;
using SMD.Domain.Common;
using SMD.Domain.Enums;
using System.ComponentModel.DataAnnotations;

namespace SMD.Domain.Entities
{
    public class InboundDocument : BaseEntity
    {
        public string DocumentNo { get; set; } = null!;
        public DocumentStatus Status { get; set; } = DocumentStatus.Draft;
        public Guid? SupplierId { get; set; }
        public Supplier? Supplier { get; set; }
        public string? Reference { get; set; } // PO-123
        public string? Note { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
        public ICollection<InboundDocumentLine> Lines { get; set; }
            = new List<InboundDocumentLine>();
    }
}
