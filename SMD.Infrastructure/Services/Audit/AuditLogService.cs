using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace SMD.Infrastructure.Services.Audit
{
    public class AuditLogService
    {
        private readonly SmdDbContext _db;
        private readonly IHttpContextAccessor _http;

        public AuditLogService(SmdDbContext db, IHttpContextAccessor http)
        {
            _db = db;
            _http = http;
        }

        public async Task WriteAsync(string action, string entity, string entityId, string? details = null)
        {
            var ctx = _http.HttpContext;
            var userIdStr = ctx?.User?.FindFirstValue(ClaimTypes.NameIdentifier);

            Guid? userId = Guid.TryParse(userIdStr, out var id) ? id : null;
            var ip = ctx?.Connection.RemoteIpAddress?.ToString();

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = userId,
                Action = action,
                Entity = entity,
                EntityId = entityId,
                Details = details,
                IpAddress = ip
            });

            await _db.SaveChangesAsync();
        }
    }
}
