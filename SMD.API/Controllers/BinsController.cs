using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Common;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/bins")]
public class BinsController : ControllerBase
{
    private readonly SmdDbContext _db;
    public BinsController(SmdDbContext db) => _db = db;

    // GET /api/racks/{rackId}/bins
    [HttpGet("/api/racks/{rackId:guid}/bins")]
    public async Task<IActionResult> GetAll(Guid rackId)
    {
        var bins = await _db.Bins
            .Where(b => b.RackId == rackId)
            .OrderBy(b => b.Code)
            .Select(b => new { b.Id, b.Code, b.Name, b.IsActive })
            .ToListAsync();

        return Ok(bins);
    }

    // POST /api/racks/{rackId}/bins
    //[HttpPost("/api/racks/{rackId:guid}/bins")]
    [HttpPost]
    public async Task<IActionResult> Create(Guid rackId, [FromBody] CreateBinRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Code dhe Name janë të detyrueshme.");

        var existsRack = await _db.Racks.AnyAsync(r => r.Id == rackId);
        if (!existsRack) return NotFound("Rafti nuk u gjet.");

        var bin = new Bin
        {
            RackId = rackId,
            Code = req.Code.Trim(),
            Name = req.Name.Trim(),
            IsActive = true
        };

        _db.Bins.Add(bin);
        await _db.SaveChangesAsync();

        return Ok(new { bin.Id });
    }

    // GET /api/bins
    // GET /api/bins?rackId=...
    [HttpGet("lookup")]
    public async Task<IActionResult> List([FromQuery] Guid? rackId = null)
    {
        IQueryable<Bin> q = _db.Bins.Where(b => b.IsActive);

        if (rackId.HasValue)
            q = q.Where(b => b.RackId == rackId.Value);

        var data = await q
            .OrderBy(b => b.Code)
            .Select(b => new LookupDto { Id = b.Id, Code = b.Code, Name = b.Name })
            .ToListAsync();

        return Ok(data);
    }

    public class CreateBinRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}