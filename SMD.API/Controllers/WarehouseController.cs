using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using SMD.API.Contracts.Common;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/warehouses")]
public class WarehousesController : ControllerBase
{
    private readonly SmdDbContext _db;
    public WarehousesController(SmdDbContext db) => _db = db;

    // GET /api/warehouses/all
    [HttpGet("all")]
    public async Task<IActionResult> GetAll()
    {
        var warehouses = await _db.Warehouses
            .OrderBy(w => w.Code)
            .Select(w => new
            {
                w.Id,
                w.Code,
                w.Name,
                w.Address,
                w.IsActive
            })
            .ToListAsync();

        return Ok(warehouses);
    }

    // GET /api/warehouses/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var w = await _db.Warehouses
            .Where(x => x.Id == id)
            .Select(x => new
            {
                x.Id,
                x.Code,
                x.Name,
                x.Address,
                x.IsActive
            })
            .FirstOrDefaultAsync();

        return w is null ? NotFound() : Ok(w);
    }

    // POST /api/warehouses
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWarehouseRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Code dhe Name janë të detyrueshme.");

        var code = req.Code.Trim();

        var exists = await _db.Warehouses.AnyAsync(x => x.Code == code);
        if (exists) return Conflict("Depo me këtë Code ekziston.");

        var warehouse = new Warehouse
        {
            Code = code,
            Name = req.Name.Trim(),
            Address = string.IsNullOrWhiteSpace(req.Address) ? null : req.Address.Trim(),
            IsActive = true
        };

        _db.Warehouses.Add(warehouse);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = warehouse.Id }, new { warehouse.Id });
    }

    // PUT /api/warehouses/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateWarehouseRequest req)
    {
        var warehouse = await _db.Warehouses.FindAsync(id);
        if (warehouse is null) return NotFound();

        warehouse.Name = string.IsNullOrWhiteSpace(req.Name) ? warehouse.Name : req.Name.Trim();
        warehouse.Address = req.Address?.Trim();
        warehouse.IsActive = req.IsActive ?? warehouse.IsActive;
        warehouse.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/warehouses/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        var warehouse = await _db.Warehouses.FindAsync(id);
        if (warehouse is null) return NotFound();

        warehouse.IsActive = false;
        warehouse.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/warehouses/lookup
    [HttpGet("lookup")]
    public async Task<IActionResult> List()
    {
        var data = await _db.Warehouses
            .Where(w => w.IsActive)
            .OrderBy(w => w.Code)
            .Select(w => new LookupDto
            {
                Id = w.Id,
                Code = w.Code,
                Name = w.Name
            })
            .ToListAsync();

        return Ok(data);
    }

    public class CreateWarehouseRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Address { get; set; }
    }

    public class UpdateWarehouseRequest
    {
        public string? Name { get; set; }
        public string? Address { get; set; }
        public bool? IsActive { get; set; }
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
[Route("api/warehouses")]
public class WarehousesController : ControllerBase
{
    private readonly SmdDbContext _db;
    public WarehousesController(SmdDbContext db) => _db = db;

    /*
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var warehouses = await _db.Warehouses
            .OrderBy(w => w.Code)
            .Select(w => new { w.Id, w.Code, w.Name, w.Address, w.IsActive })
            .ToListAsync();

        return Ok(warehouses);
    }
    
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var w = await _db.Warehouses
            .Where(x => x.Id == id)
            .Select(x => new { x.Id, x.Code, x.Name, x.Address, x.IsActive })
            .FirstOrDefaultAsync();

        return w is null ? NotFound() : Ok(w);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWarehouseRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Code dhe Name janë të detyrueshme.");

        var code = req.Code.Trim();

        var exists = await _db.Warehouses.AnyAsync(x => x.Code == code);
        if (exists) return Conflict("Depo me këtë Code ekziston.");

        var warehouse = new Warehouse
        {
            Code = code,
            Name = req.Name.Trim(),
            Address = string.IsNullOrWhiteSpace(req.Address) ? null : req.Address.Trim(),
            IsActive = true
        };

        _db.Warehouses.Add(warehouse);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = warehouse.Id }, new { warehouse.Id });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateWarehouseRequest req)
    {
        var warehouse = await _db.Warehouses.FindAsync(id);
        if (warehouse is null) return NotFound();

        warehouse.Name = string.IsNullOrWhiteSpace(req.Name) ? warehouse.Name : req.Name.Trim();
        warehouse.Address = req.Address?.Trim();
        warehouse.IsActive = req.IsActive ?? warehouse.IsActive;
        warehouse.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        var warehouse = await _db.Warehouses.FindAsync(id);
        if (warehouse is null) return NotFound();

        warehouse.IsActive = false;
        warehouse.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var data = await _db.Warehouses
            .Where(w => w.IsActive)
            .OrderBy(w => w.Code)
            .Select(w => new LookupDto { Id = w.Id, Code = w.Code, Name = w.Name })
            .ToListAsync();

        return Ok(data);
    }

    public class CreateWarehouseRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Address { get; set; }
    }

    public class UpdateWarehouseRequest
    {
        public string? Name { get; set; }
        public string? Address { get; set; }
        public bool? IsActive { get; set; }
    }
}
*/