namespace SMD.API.Contracts.CycleCounts;

public class CreateCycleCountRequest
{
    public Guid? WarehouseId { get; set; }
    public Guid? ZoneId { get; set; }
    public Guid? RackId { get; set; }
    public Guid? BinId { get; set; }
    public Guid? ProductId { get; set; }
    public bool OnlyWithStock { get; set; } = true;
    public string? Reference { get; set; }
    public string? Note { get; set; }
}
