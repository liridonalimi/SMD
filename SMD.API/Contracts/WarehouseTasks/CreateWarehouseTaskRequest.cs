using SMD.Domain.Enums;

namespace SMD.API.Contracts.WarehouseTasks;

public class CreateWarehouseTaskRequest
{
    public WarehouseTaskType Type { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? FromBinId { get; set; }
    public Guid? ToBinId { get; set; }
    public decimal? Quantity { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
}
