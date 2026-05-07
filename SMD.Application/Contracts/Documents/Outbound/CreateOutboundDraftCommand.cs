namespace SMD.Application.Contracts.Documents.Outbound;
public class CreateOutboundDraftCommand
{
    public Guid? CustomerId { get; set; }
    public int? PriceTier { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
}
