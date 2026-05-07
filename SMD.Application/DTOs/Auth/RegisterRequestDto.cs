using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Application.DTOs.Auth
{
    public class RegisterRequestDto
    {
        public string Username { get; set; } = null!;
        public string Email { get; set; } = null!;
        public string Password { get; set; } = null!;
    }
}
