using SMD.Domain.Common;
using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Domain.Entities
{
    public class AuditLog : BaseEntity
    {
        public Guid? UserId { get; set; }
        public string Action { get; set; } = null!;
        public string Entity { get; set; } = null!;
        public string EntityId { get; set; } = null!;
        public string? Details { get; set; }
        public string? IpAddress { get; set; }
    }
}
