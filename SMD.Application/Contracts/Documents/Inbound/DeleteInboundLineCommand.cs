namespace SMD.Application.Contracts.Documents.Inbound;
public class DeleteInboundLineCommand
{
    public Guid DocumentId { get; set; }
    public Guid LineId { get; set; }
}
