using System;
using System.Collections.Generic;
using System.Text;
using SMD.Domain.Enums;

namespace SMD.Application.DTOs.Auth
{
    internal class UpdateUserRoleRequest
    {
        public UserRole Role { get; set; }
    }
}
