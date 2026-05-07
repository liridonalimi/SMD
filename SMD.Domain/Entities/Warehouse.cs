using SMD.Domain.Common;
using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Domain.Entities
{
    public class Warehouse : BaseEntity
    {
        public string Code { get; set; } = null!;   // p.sh. Depo-001
        public string Name { get; set; } = null!;   // p.sh. Depo Kryesore
        public string? Address { get; set; }
        public bool IsActive { get; set; } = true;
    }
}
