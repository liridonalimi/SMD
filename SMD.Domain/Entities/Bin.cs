using SMD.Domain.Common;

namespace SMD.Domain.Entities;

public class Bin : BaseEntity
{
    public Guid RackId { get; set; }
    public Rack Rack { get; set; } = null!;

    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public bool IsActive { get; set; } = true;
}
