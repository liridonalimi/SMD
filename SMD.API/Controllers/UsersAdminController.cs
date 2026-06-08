using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Security;

namespace SMD.API.Controllers;

[ApiController]
[Authorize(Policy = "CanManageUsers")]
[Route("api/admin/users")]
public class UsersAdminController : ControllerBase
{
    private readonly SmdDbContext _db;
    public UsersAdminController(SmdDbContext db) => _db = db;

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

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAdminUserRequest req)
    {
        var username = (req.Username ?? string.Empty).Trim();
        var email = (req.Email ?? string.Empty).Trim().ToLowerInvariant();
        var password = req.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(username))
            return BadRequest("Username eshte i detyrueshem.");

        if (string.IsNullOrWhiteSpace(email))
            return BadRequest("Email eshte i detyrueshem.");

        if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
            return BadRequest("Password duhet te kete te pakten 6 karaktere.");

        var emailExists = await _db.Users.AnyAsync(x => x.Email.ToLower() == email);
        if (emailExists)
            return BadRequest("Ekziston nje perdorues me kete email.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            Email = email,
            PasswordHash = PasswordHasher.Hash(password),
            Role = req.Role,
            IsActive = req.IsActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            user.Id,
            user.Username,
            user.Email,
            Role = user.Role.ToString(),
            user.IsActive
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAdminUserRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == id);
        if (user == null) return NotFound("Perdoruesi nuk u gjet.");

        var username = (req.Username ?? string.Empty).Trim();
        var email = (req.Email ?? string.Empty).Trim().ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(username))
            return BadRequest("Username eshte i detyrueshem.");

        if (string.IsNullOrWhiteSpace(email))
            return BadRequest("Email eshte i detyrueshem.");

        var emailUsedByAnother = await _db.Users.AnyAsync(x => x.Id != id && x.Email.ToLower() == email);
        if (emailUsedByAnother)
            return BadRequest("Email perdoret nga nje perdorues tjeter.");

        user.Username = username;
        user.Email = email;
        user.Role = req.Role;
        user.IsActive = req.IsActive;

        var newPassword = (req.Password ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(newPassword))
        {
            if (newPassword.Length < 6)
                return BadRequest("Password duhet te kete te pakten 6 karaktere.");

            user.PasswordHash = PasswordHasher.Hash(newPassword);
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            user.Id,
            user.Username,
            user.Email,
            Role = user.Role.ToString(),
            user.IsActive,
            user.UpdatedAt
        });
    }

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

public class CreateAdminUserRequest
{
    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public UserRole Role { get; set; } = UserRole.Worker;
    public bool IsActive { get; set; } = true;
}

public class UpdateAdminUserRequest
{
    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public UserRole Role { get; set; } = UserRole.Worker;
    public bool IsActive { get; set; } = true;
}
