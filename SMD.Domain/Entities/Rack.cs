using System;
using System.Collections.Generic;
using System.Text;
using SMD.Domain.Common;

namespace SMD.Domain.Entities
{
    public class Rack : BaseEntity
    {
        public Guid ZoneId { get; set; }
        public Zone Zone { get; set; } = null!;

        public string Code { get; set; } = null!;
        public string Name { get; set; } = null!;
        public bool IsActive { get; set; } = true;

        public ICollection<Bin> Bins { get; set; } = new List<Bin>();
    }
}
