namespace SMD.API.Contracts.StockMovements
{
    public class StockAdjustRequest
    {
        public Guid BinId { get; set; }
        public Guid ProductId { get; set; }
        public decimal QuantityChange { get; set; }
        public string Reason { get; set; } = string.Empty;
        public string? Reference { get; set; }
    }
}
