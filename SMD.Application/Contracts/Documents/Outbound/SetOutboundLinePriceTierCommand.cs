namespace SMD.Application.Contracts.Documents.Outbound;

public class SetOutboundLinePriceTierCommand
{
    public Guid DocumentId { get; set; }
    public Guid LineId { get; set; }
    public int PriceTier { get; set; }
}
