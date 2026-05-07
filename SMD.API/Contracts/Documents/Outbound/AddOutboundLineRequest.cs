namespace SMD.API.Contracts.Documents.Outbound
{
    public class AddOutboundLineRequest
    {
        public Guid ProductId { get; set; }
        public Guid FromBinId { get; set; }
        public string? LotNumber { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public decimal Quantity { get; set; }
    }
}
