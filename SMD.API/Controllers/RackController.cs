using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Common;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/racks")]
public class RacksController : ControllerBase
{
    private readonly SmdDbContext _db;
    public RacksController(SmdDbContext db) => _db = db;

    // GET /api/zones/{zoneId}/racks
    [HttpGet("/api/zones/{zoneId:guid}/racks")]
    public async Task<IActionResult> GetAll(Guid zoneId)
    {
        var racks = await _db.Racks
            .Where(r => r.ZoneId == zoneId)
            .OrderBy(r => r.Code)
            .Select(r => new { r.Id, r.Code, r.Name, r.IsActive })
            .ToListAsync();

        return Ok(racks);
    }

    // POST /api/zones/{zoneId}/racks
    [Authorize(Policy = "CanEditMasterData")]
    [HttpPost("/api/zones/{zoneId:guid}/racks")]
    public async Task<IActionResult> Create(Guid zoneId, [FromBody] CreateRackRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("ID dhe emri i raftit janë të detyrueshme.");

        var existsZone = await _db.Zones.AnyAsync(z => z.Id == zoneId);
        if (!existsZone) return NotFound("Zona nuk u gjet.");

        var rack = new Rack
        {
            ZoneId = zoneId,
            Code = req.Code.Trim(),
            Name = req.Name.Trim(),
            IsActive = true
        };

        _db.Racks.Add(rack);
        await _db.SaveChangesAsync();

        return Ok(new { rack.Id });
    }

    // GET /api/racks/lookup
    // GET /api/racks/lookup?zoneId=...
    [HttpGet("lookup")]
    public async Task<IActionResult> List([FromQuery] Guid? zoneId = null)
    {
        IQueryable<Rack> q = _db.Racks.Where(r => r.IsActive);

        if (zoneId.HasValue)
            q = q.Where(r => r.ZoneId == zoneId.Value);

        var data = await q
            .OrderBy(r => r.Code)
            .Select(r => new LookupDto
            {
                Id = r.Id,
                Code = r.Code,
                Name = r.Name
            })
            .ToListAsync();

        return Ok(data);
    }

    public class CreateRackRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}
