namespace SMD.API.Contracts.Documents.Inbound
{
    public class CreateInboundDraftRequest
    {
        public Guid? SupplierId { get; set; }
        public string? Reference { get; set; } // PO-123
        public string? Note { get; set; }
    }
}
