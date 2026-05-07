using SMD.Domain.Common;
using SMD.Domain.Enums;

namespace SMD.Domain.Entities;

public class CycleCount : BaseEntity
{
    public string CountNo { get; set; } = null!;
    public CycleCountStatus Status { get; set; } = CycleCountStatus.Draft;

    public string? Reference { get; set; }
    public string? Note { get; set; }

    public Guid? WarehouseId { get; set; }
    public Guid? ZoneId { get; set; }
    public Guid? RackId { get; set; }
    public Guid? BinId { get; set; }
    public Guid? ProductId { get; set; }

    public DateTime? CompletedAt { get; set; }
    public Guid? CompletedByUserId { get; set; }

    public ICollection<CycleCountLine> Lines { get; set; } = new List<CycleCountLine>();
}
