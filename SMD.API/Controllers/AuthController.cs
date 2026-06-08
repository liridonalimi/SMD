using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SMD.Application.DTOs.Auth;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Security;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace SMD.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly SmdDbContext _context;
    private readonly IConfiguration _configuration;

    public AuthController(SmdDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
    {
        var email = (request.Email ?? "").Trim().ToLowerInvariant();
        var password = request.Password ?? "";

        var user = await _context.Users.SingleOrDefaultAsync(x => x.Email.ToLower() == email);

        if (user == null)
            return Unauthorized("Ky përdorues nuk ekziston!");

        if (!user.IsActive)
            return Unauthorized("Ky përdorues është joaktiv!");

        if (!PasswordHasher.Verify(password, user.PasswordHash))
            return Unauthorized("Fjalkalimi është i gabuar!");

        var token = GenerateJwtToken(user);

        return Ok(new { token });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequestDto request)
    {
        var email = (request.Email ?? "").Trim().ToLowerInvariant();

        var exists = await _context.Users.AnyAsync(x => x.Email.ToLower() == email);
        if (exists)
            return BadRequest("Ky përdorues tashmë ekziston!");

        var user = new Domain.Entities.User
        {
            Id = Guid.NewGuid(),
            Username = request.Username.Trim(),
            Email = email,
            PasswordHash = PasswordHasher.Hash(request.Password),
            Role = Domain.Enums.UserRole.Worker,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return Ok("Përdoruesi u regjistrua me sukses.");
    }

    private string GenerateJwtToken(Domain.Entities.User user)
    {
        var jwt = _configuration.GetSection("Jwt");

        var expiresMinutesStr = jwt["ExpiresMinutes"];
        var expiresMinutes = 120;
        if (int.TryParse(expiresMinutesStr, out var m) && m > 0) expiresMinutes = m;

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwt["Issuer"],
            audience: jwt["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
