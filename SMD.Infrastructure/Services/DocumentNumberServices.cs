using Microsoft.EntityFrameworkCore;
using SMD.Infrastructure.Persistence;

namespace SMD.API.Services
{
    public class DocumentNumberService
    {
        private readonly SmdDbContext _db;
        public DocumentNumberService(SmdDbContext db) => _db = db;

        public async Task<string> NextInboundNo()
        {
            var count = await _db.InboundDocuments.CountAsync();
            return $"IN-{(count + 1).ToString("D6")}";
        }

        public async Task<string> NextOutboundNo()
        {
            var count = await _db.OutboundDocuments.CountAsync();
            return $"OUT-{(count + 1).ToString("D6")}";
        }
    }
}