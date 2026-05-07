using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Common;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/zones")]
public class ZonesController : ControllerBase
{
    private readonly SmdDbContext _db;
    public ZonesController(SmdDbContext db) => _db = db;

    // GET /api/warehouses/{warehouseId}/zones
    [HttpGet("/api/warehouses/{warehouseId:guid}/zones")]
    public async Task<IActionResult> GetAll(Guid warehouseId)
    {
        var zones = await _db.Zones
            .Where(z => z.WarehouseId == warehouseId)
            .OrderBy(z => z.Code)
            .Select(z => new { z.Id, z.Code, z.Name, z.IsActive })
            .ToListAsync();

        return Ok(zones);
    }

    // POST /api/warehouses/{warehouseId}/zones
    [HttpPost("/api/warehouses/{warehouseId:guid}/zones")]
    public async Task<IActionResult> Create(Guid warehouseId, [FromBody] CreateZoneRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Code dhe Name janë të detyrueshme.");

        var existsWarehouse = await _db.Warehouses.AnyAsync(w => w.Id == warehouseId);
        if (!existsWarehouse) return NotFound("Warehouse not found.");

        var zone = new Zone
        {
            WarehouseId = warehouseId,
            Code = req.Code.Trim(),
            Name = req.Name.Trim(),
            IsActive = true
        };

        _db.Zones.Add(zone);
        await _db.SaveChangesAsync();

        return Ok(new { zone.Id });
    }

    // GET /api/zones/lookup
    // GET /api/zones/lookup?warehouseId=...
    [HttpGet("lookup")]
    public async Task<IActionResult> List([FromQuery] Guid? warehouseId = null)
    {
        IQueryable<Zone> q = _db.Zones.Where(z => z.IsActive);

        if (warehouseId.HasValue)
            q = q.Where(z => z.WarehouseId == warehouseId.Value);

        var data = await q
            .OrderBy(z => z.Code)
            .Select(z => new LookupDto
            {
                Id = z.Id,
                Code = z.Code,
                Name = z.Name
            })
            .ToListAsync();

        return Ok(data);
    }

    public class CreateZoneRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}

/*
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Common;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/warehouses/{warehouseId:guid}/zones")]
public class ZonesController : ControllerBase
{
    private readonly SmdDbContext _db;
    public ZonesController(SmdDbContext db) => _db = db;

    /*
    [HttpGet]
    public async Task<IActionResult> GetAll(Guid warehouseId)
    {
        var zones = await _db.Zones
            .Where(z => z.WarehouseId == warehouseId)
            .OrderBy(z => z.Code)
            .Select(z => new { z.Id, z.Code, z.Name, z.IsActive })
            .ToListAsync();

        return Ok(zones);
    }
    
    [HttpPost]
    public async Task<IActionResult> Create(Guid warehouseId, [FromBody] CreateZoneRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Code dhe Name janë të detyrueshme.");

        var existsWarehouse = await _db.Warehouses.AnyAsync(w => w.Id == warehouseId);
        if (!existsWarehouse) return NotFound("Warehouse not found.");

        var zone = new Zone
        {
            WarehouseId = warehouseId,
            Code = req.Code.Trim(),
            Name = req.Name.Trim(),
            IsActive = true
        };

        _db.Zones.Add(zone);
        await _db.SaveChangesAsync();

        return Ok(new { zone.Id });
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? warehouseId = null)
    {
        var q = _db.Zones.Where(z => z.IsActive);

        if (warehouseId.HasValue)
            q = q.Where(z => z.WarehouseId == warehouseId.Value);

        var data = await q
            .OrderBy(z => z.Code)
            .Select(z => new LookupDto { Id = z.Id, Code = z.Code, Name = z.Name })
            .ToListAsync();

        return Ok(data);
    }

    public class CreateZoneRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}
*/