using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Application.DTOs.Auth;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;

namespace SMD.API.Controllers
{
    [ApiController]
    [Authorize(Policy = "CanManageUsers")] // vetëm Admin
    [Route("api/admin/users")]
    public class UsersAdminController : ControllerBase
    {
        private readonly SmdDbContext _db;
        public UsersAdminController(SmdDbContext db) => _db = db;

        // GET /api/admin/users
        [HttpGet]
        public async Task<IActionResult> List()
        {
            var users = await _db.Users.AsNoTracking()
                .OrderByDescending(u => u.CreatedAt)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.Email,
                    Role = u.Role.ToString(),
                    u.IsActive,
                    u.CreatedAt,
                    u.UpdatedAt
                })
                .ToListAsync();

            return Ok(users);
        }
        // PUT /api/admin/users/{id}/role
        [HttpPut("{id:guid}/role")]
        public async Task<IActionResult> UpdateRole(Guid id, [FromBody] UpdateUserRoleRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == id);
            if (user == null) return NotFound("Perdoruesi nuk u gjet.");

            user.Role = req.Role;
            user.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            return Ok(new { user.Id, user.Email, Role = user.Role.ToString() });
        }
    }
    public class UpdateUserRoleRequest
    {
        public UserRole Role { get; set; }
    }
}
