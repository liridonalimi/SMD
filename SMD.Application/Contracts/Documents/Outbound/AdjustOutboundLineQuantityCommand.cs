namespace SMD.Application.Contracts.Documents.Outbound;

public sealed class AdjustOutboundLineQuantityCommand
{
    public Guid DocumentId { get; set; }
    public Guid LineId { get; set; }
    public decimal Delta { get; set; }
}
