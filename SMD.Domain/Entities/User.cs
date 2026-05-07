using SMD.Domain.Common;
using SMD.Domain.Enums;
using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Domain.Entities
{
    public class User : BaseEntity
    {
        public string Username { get; set; } = null!;
        public string Email { get; set; } = null!;
        public string PasswordHash { get; set; } = null!;
        public UserRole Role { get; set; }
        public bool IsActive { get; set; } = true;
    }
}
