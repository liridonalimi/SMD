namespace SMD.API.Contracts.Inventory
{
    public class InventoryReserveRequest
    {
        public Guid BinId { get; set; }
        public Guid ProductId { get; set; }
        public string? LotNumber { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public decimal Qty { get; set; }
    }
}
