namespace SMD.API.Contracts.Documents.Outbound
{
    public class CreateOutboundDraftRequest
    {
        public Guid? CustomerId { get; set; }
        public int? PriceTier { get; set; }
        public string? Reference { get; set; } // SO-123
        public string? Note { get; set; }
    }
}
