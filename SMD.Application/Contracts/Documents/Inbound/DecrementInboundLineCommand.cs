namespace SMD.Application.Contracts.Documents.Inbound;

public sealed class DecrementInboundLineCommand
{
    public Guid DocumentId { get; set; }
    public Guid LineId { get; set; }
    public decimal Quantity { get; set; }
}
