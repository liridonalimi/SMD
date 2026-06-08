using SMD.Domain.Enums;

namespace SMD.API.Contracts.WarehouseTasks;

public class WarehouseTaskListQuery
{
    public WarehouseTaskStatus? Status { get; set; }
    public WarehouseTaskType? Type { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public Guid? ProductId { get; set; }
    public bool? NeedsHelp { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
}
