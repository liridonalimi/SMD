namespace SMD.API.Contracts.Inventory
{
    public class InventoryAdjustRequest
    {
        public Guid BinId { get; set; }
        public Guid ProductId { get; set; }
        public string? LotNumber { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public decimal QtyChange { get; set; } // + shto, - hiq
    }
}
