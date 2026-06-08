using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/suppliers")]
public class SuppliersController : ControllerBase
{
    private readonly SmdDbContext _db;

    public SuppliersController(SmdDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? q, [FromQuery] bool includeInactive = false)
    {
        var query = _db.Suppliers.AsNoTracking().AsQueryable();

        if (!includeInactive)
            query = query.Where(x => x.IsActive);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(x =>
                x.Code.Contains(term) ||
                x.Name.Contains(term) ||
                (x.ContactPerson != null && x.ContactPerson.Contains(term)) ||
                (x.Phone != null && x.Phone.Contains(term)) ||
                (x.Email != null && x.Email.Contains(term)));
        }

        var items = await query
            .OrderBy(x => x.Code)
            .Select(x => new
            {
                x.Id,
                x.Code,
                x.Name,
                x.ContactPerson,
                x.Phone,
                x.Email,
                x.Address,
                x.Note,
                x.IsActive
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string? q)
    {
        var query = _db.Suppliers.AsNoTracking().Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term));
        }

        var items = await query
            .OrderBy(x => x.Code)
            .Select(x => new { x.Id, x.Code, x.Name })
            .Take(100)
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var item = await _db.Suppliers.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.Code,
                x.Name,
                x.ContactPerson,
                x.Phone,
                x.Email,
                x.Address,
                x.Note,
                x.IsActive
            })
            .FirstOrDefaultAsync();

        return item is null ? NotFound() : Ok(item);
    }

    [Authorize(Policy = "CanEditMasterData")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPartnerRequest req)
    {
        var validation = await ValidateUniqueAsync(req.Code, req.Name, req.Email, null);
        if (validation is not null) return validation;

        var entity = new Supplier
        {
            Code = req.Code.Trim(),
            Name = req.Name.Trim(),
            ContactPerson = Normalize(req.ContactPerson),
            Phone = Normalize(req.Phone),
            Email = Normalize(req.Email),
            Address = Normalize(req.Address),
            Note = Normalize(req.Note),
            IsActive = req.IsActive ?? true
        };

        _db.Suppliers.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, new { entity.Id });
    }

    [Authorize(Policy = "CanEditMasterData")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertPartnerRequest req)
    {
        var entity = await _db.Suppliers.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var validation = await ValidateUniqueAsync(req.Code, req.Name, req.Email, id);
        if (validation is not null) return validation;

        entity.Code = req.Code.Trim();
        entity.Name = req.Name.Trim();
        entity.ContactPerson = Normalize(req.ContactPerson);
        entity.Phone = Normalize(req.Phone);
        entity.Email = Normalize(req.Email);
        entity.Address = Normalize(req.Address);
        entity.Note = Normalize(req.Note);
        entity.IsActive = req.IsActive ?? entity.IsActive;
        entity.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<IActionResult?> ValidateUniqueAsync(string? codeRaw, string? nameRaw, string? emailRaw, Guid? id)
    {
        var code = codeRaw?.Trim();
        var name = nameRaw?.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name))
            return BadRequest("Kodi dhe emri jane te detyrueshem.");

        if (await _db.Suppliers.AnyAsync(x => x.Code == code && x.Id != id))
            return Conflict("Ekziston furnizues tjeter me kete kod.");

        var email = Normalize(emailRaw);
        if (email is not null && await _db.Suppliers.AnyAsync(x => x.Email == email && x.Id != id))
            return Conflict("Ekziston furnizues tjeter me kete email.");
        return null;
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
