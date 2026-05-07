using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Infrastructure.Persistence;
using SMD.Application.Contracts.Documents.Audit;
using SMD.Application.Contracts.Responses;

namespace SMD.API.Controllers
{
    [Authorize(Roles = "Admin")]
    [ApiController]
    [Route("api/audit-logs")]
    public class AuditLogsController : ControllerBase
    {
        private readonly SmdDbContext _db;
        public AuditLogsController(SmdDbContext db) => _db = db;

        // GET /api/audit-logs?from=2026-01-01&to=2026-01-31&action=CONFIRM_INBOUND&userId=...&take=200
        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] AuditListQuery query)
        {
            var page = query.Page < 1 ? 1 : query.Page;
            var pageSize = query.PageSize < 1 ? 20 : query.PageSize;
            if (pageSize > 200) pageSize = 200; // limit

            var dbq = _db.AuditLogs.AsNoTracking().AsQueryable();

            // Date filters
            if (query.From.HasValue)
                dbq = dbq.Where(x => x.CreatedAt >= query.From.Value);

            if (query.To.HasValue)
                dbq = dbq.Where(x => x.CreatedAt <= query.To.Value);

            // Action + User
            if (!string.IsNullOrWhiteSpace(query.Action) && query.Action != "All")
                dbq = dbq.Where(x => x.Action == query.Action);

            if (query.UserId.HasValue)
                dbq = dbq.Where(x => x.UserId == query.UserId.Value);

            // Search (q)
            if (!string.IsNullOrWhiteSpace(query.Q))
            {
                var term = query.Q.Trim();
                var like = $"%{term}%";

                if (Guid.TryParse(term, out var uid))
                {
                    dbq = dbq.Where(x => x.UserId == uid);
                }
                else
                {
                    dbq = dbq.Where(x =>
                        EF.Functions.Like(x.Action ?? "", like) ||
                        EF.Functions.Like(x.Entity ?? "", like) ||
                        EF.Functions.Like(x.EntityId ?? "", like) ||
                        EF.Functions.Like(x.Details ?? "", like) ||
                        EF.Functions.Like(x.IpAddress ?? "", like)
                    );
                }
            }

            // Sort (normalize to avoid createdAt vs createdat mismatch)
            var sort = (query.Sort ?? "createdat_desc").Trim().ToLowerInvariant();
            dbq = sort switch
            {
                "createdat_asc" => dbq.OrderBy(x => x.CreatedAt),
                "createdat_desc" => dbq.OrderByDescending(x => x.CreatedAt),

                // accept UI variants:
                "createdat" => dbq.OrderByDescending(x => x.CreatedAt),
                "createdat_" => dbq.OrderByDescending(x => x.CreatedAt),
                "createdatasc" => dbq.OrderBy(x => x.CreatedAt),
                "createdatdesc" => dbq.OrderByDescending(x => x.CreatedAt),

                _ => dbq.OrderByDescending(x => x.CreatedAt),
            };

            var totalCount = await dbq.CountAsync();

            var items = await dbq
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(x => new
                {
                    x.Id,
                    x.CreatedAt,
                    x.UserId,
                    x.Action,
                    x.Entity,
                    x.EntityId,
                    x.Details,
                    x.IpAddress
                })
                .ToListAsync();

            return Ok(new { items, totalCount, page, pageSize });
        }

        // GET /api/audit-logs/actions  -> list e action-ëve për dropdown në UI
        [Authorize(policy: "CanViewAuditLogs")]
        [HttpGet("actions")]
        public async Task<IActionResult> GetActions()
        {
            var actions = await _db.AuditLogs.AsNoTracking()
                .Select(x => x.Action)
                .Distinct()
                .OrderBy(x => x)
                .ToListAsync();

            return Ok(actions);
        }
    }
}
