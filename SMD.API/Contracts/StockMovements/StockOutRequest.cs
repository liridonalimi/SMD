namespace SMD.API.Contracts.StockMovements
{
    public class StockOutRequest
    {
        public Guid ProductId { get; set; }
        public Guid FromBinId { get; set; }
        public decimal Quantity { get; set; }
        public string? Reference { get; set; }
        public string? Note { get; set; }
    }
}
