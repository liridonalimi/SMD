using SMD.Domain.Enums;

namespace SMD.API.Contracts.Returns;

public class AddReturnLineRequest
{
    public Guid ProductId { get; set; }
    public Guid BinId { get; set; }
    public string? LotNumber { get; set; }
    public string? BatchNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public OutboundPriceTier? PriceTier { get; set; }
    public decimal Quantity { get; set; }
}
