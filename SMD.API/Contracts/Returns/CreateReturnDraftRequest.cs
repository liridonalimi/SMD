using SMD.Domain.Enums;

namespace SMD.API.Contracts.Returns;

public class CreateReturnDraftRequest
{
    public ReturnDocumentType Type { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? SupplierId { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
}
