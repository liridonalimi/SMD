using System;
using System.Collections.Generic;
using System.Text;
using SMD.Domain.Common;

namespace SMD.Domain.Entities
{
    public class Zone : BaseEntity
    {
        public Guid WarehouseId { get; set; }
        public Warehouse Warehouse { get; set; } = null!;

        public string Code { get; set; } = null!;
        public string Name { get; set; } = null!;
        public bool IsActive { get; set; } = true;

        public ICollection<Rack> Racks { get; set; } = new List<Rack>();
    }
}
