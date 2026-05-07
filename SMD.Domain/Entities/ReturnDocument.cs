using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class ReturnDocument : BaseEntity
{
    public string DocumentNo { get; set; } = null!;
    public ReturnDocumentType Type { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Draft;

    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public Guid? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }

    public string? Reference { get; set; }
    public string? Note { get; set; }
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public ICollection<ReturnDocumentLine> Lines { get; set; } = new List<ReturnDocumentLine>();
}
