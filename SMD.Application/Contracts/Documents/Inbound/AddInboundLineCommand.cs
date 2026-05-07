namespace SMD.Application.Contracts.Documents.Inbound;
public class AddInboundLineCommand
{
    public Guid ProductId { get; set; }
    public Guid ToBinId { get; set; }
    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public decimal Quantity { get; set; }
}
