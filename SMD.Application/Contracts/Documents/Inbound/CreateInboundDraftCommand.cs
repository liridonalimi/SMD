namespace SMD.Application.Contracts.Documents.Inbound;
public class CreateInboundDraftCommand
{
    public Guid? SupplierId { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
}
