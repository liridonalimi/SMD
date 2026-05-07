namespace SMD.Application.Contracts.Documents.Outbound;

public class SetOutboundPriceTierCommand
{
    public Guid DocumentId { get; set; }
    public int PriceTier { get; set; }
}
