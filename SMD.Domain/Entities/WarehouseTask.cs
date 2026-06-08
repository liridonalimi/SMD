using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class WarehouseTask : BaseEntity
{
    public string TaskNo { get; set; } = null!;
    public WarehouseTaskType Type { get; set; }
    public WarehouseTaskStatus Status { get; set; } = WarehouseTaskStatus.Open;

    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }

    public Guid? FromBinId { get; set; }
    public Bin? FromBin { get; set; }

    public Guid? ToBinId { get; set; }
    public Bin? ToBin { get; set; }

    public decimal? Quantity { get; set; }

    public Guid? AssignedToUserId { get; set; }
    public User? AssignedToUser { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public string? Reference { get; set; }
    public string? Note { get; set; }
}
