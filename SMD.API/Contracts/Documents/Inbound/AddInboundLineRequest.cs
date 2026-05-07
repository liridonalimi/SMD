namespace SMD.API.Contracts.Documents.Inbound
{
    // Shtimi i rreshtave te produkteve ne nje draft dokument, permban verem SKU, Shporta tek e cila shkon, Sasine
    public class AddInboundLineRequest
    {
        public Guid ProductId { get; set; }
        public Guid ToBinId { get; set; }
        public string? LotNumber { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public decimal Quantity { get; set; }
    }
}
