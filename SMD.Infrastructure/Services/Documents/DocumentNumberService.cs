using Microsoft.EntityFrameworkCore;
using SMD.Application.Services.Documents;
using SMD.Infrastructure.Persistence;

namespace SMD.Infrastructure.Services.Documents
{
    public class DocumentNumberService : IDocumentNumberService
    {
        private readonly SmdDbContext _db;
        public DocumentNumberService(SmdDbContext db) => _db = db;

        public async Task<string> NextInboundNo()
        {
            var count = await _db.InboundDocuments.CountAsync();
            return $"IN-{(count + 1):D6}";
        }

        public async Task<string> NextOutboundNo()
        {
            var count = await _db.OutboundDocuments.CountAsync();
            return $"OUT-{(count + 1):D6}";
        }
    }
}
