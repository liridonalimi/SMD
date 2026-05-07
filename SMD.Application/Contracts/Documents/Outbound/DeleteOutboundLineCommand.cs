namespace SMD.Application.Contracts.Documents.Outbound;
public class DeleteOutboundLineCommand
{
    public Guid DocumentId { get; set; }
    public Guid LineId { get; set; }
}
