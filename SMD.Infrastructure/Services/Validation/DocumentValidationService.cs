using Microsoft.EntityFrameworkCore;
using SMD.Domain.Entities;
using SMD.Infrastructure.Persistence;

namespace SMD.Infrastructure.Services.Validation
{
    public class DocumentValidationService
    {
        private readonly SmdDbContext _db;
        public DocumentValidationService(SmdDbContext db) => _db = db;

        public async Task<(bool ok, string? error)> ValidateInboundLinesAsync(List<InboundDocumentLine> lines)
        {
            if (lines.Count == 0) return (false, "Dokumenti duhet te kete te pakten 1 rresht me produkte.");

            // Qty > 0
            if (lines.Any(l => l.Quantity <= 0))
                return (false, "Sasia e produkteve ne rreshta duhet te jete > 0.");

            // Check Product exists
            var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
            var existingProducts = await _db.Products.Where(p => productIds.Contains(p.Id)).Select(p => p.Id).ToListAsync();
            if (existingProducts.Count != productIds.Count)
                return (false, "Nuk ka nje ose me shume produkte ne rreshta.");

            if (lines.Any(l => !l.ToBinId.HasValue))
                return (false, "Cdo produkt ne pranim duhet te kete shporte te zgjedhur.");

            // Check Bin exists
            var binIds = lines.Select(l => l.ToBinId!.Value).Distinct().ToList();
            var existingBins = await _db.Bins.Where(b => binIds.Contains(b.Id)).Select(b => b.Id).ToListAsync();
            if (existingBins.Count != binIds.Count)
                return (false, "Nje ose me shume lokacione (bins) ne rreshta nuk ekzistojne.");

            if (lines.Any(l => string.IsNullOrWhiteSpace(l.LotNumber)))
                return (false, "Seria eshte e detyrueshme per cdo produkt ne pranim.");

            if (lines.Any(l => string.IsNullOrWhiteSpace(l.BatchNumber)))
                return (false, "Grupi i prodhimit eshte i detyrueshem per cdo produkt ne pranim.");

            if (lines.Any(l => !l.ExpiryDate.HasValue))
                return (false, "Skadenca eshte e detyrueshme per cdo produkt ne pranim.");

            if (lines.Any(l => l.ExpiryDate.HasValue && l.ExpiryDate.Value.Date < DateTime.UtcNow.Date))
                return (false, "Skadenca nuk mund te jete ne te kaluaren.");

            if (lines.Any(l => !string.IsNullOrWhiteSpace(l.LotNumber) && l.LotNumber!.Trim().Length > 80))
                return (false, "Seria nuk mund te kete me shume se 80 karaktere.");

            if (lines.Any(l => !string.IsNullOrWhiteSpace(l.BatchNumber) && l.BatchNumber!.Trim().Length > 80))
                return (false, "Grupi i prodhimit nuk mund te kete me shume se 80 karaktere.");

            /*            
            // Optional: no duplicates (Product + ToBin) Nese klienti kerkon qe cdo produkt ne shporte te jete vecmas i regjistruar
            var dup = lines.GroupBy(l => new { l.ProductId, l.ToBinId }).Any(g => g.Count() > 1);
            if (dup) return (false, "Ke rreshta te dyfishuara (i njejti Produkt + Shport). Bashkoji ne nje rresht.");
            */
            return (true, null);
        }

        public async Task<(bool ok, string? error)> ValidateOutboundLinesAsync(List<OutboundDocumentLine> lines)
        {
            if (lines.Count == 0) return (false, "Dokumenti duhet te kete te pakten 1 rresht me produkte.");

            if (lines.Any(l => l.Quantity <= 0))
                return (false, "Sasia e produkteve ne rreshta duhet te jete > 0.");

            if (lines.Any(l => l.Quantity != decimal.Truncate(l.Quantity)))
                return (false, "Sasia e produkteve ne dalje duhet te jete numer i plote.");

            if (lines.Any(l => l.ReservedQuantity != decimal.Truncate(l.ReservedQuantity)))
                return (false, "Sasia e rezervuar ne dalje duhet te jete numer i plote.");

            var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
            var existingProducts = await _db.Products.Where(p => productIds.Contains(p.Id)).Select(p => p.Id).ToListAsync();
            if (existingProducts.Count != productIds.Count)
                return (false, "Nuk ka nje ose me shume produkte ne rreshta.");

            var binIds = lines.Select(l => l.FromBinId).Distinct().ToList();
            var existingBins = await _db.Bins.Where(b => binIds.Contains(b.Id)).Select(b => b.Id).ToListAsync();
            if (existingBins.Count != binIds.Count)
                return (false, "Nje ose me shume lokacione (bins) ne linja nuk ekzistojne.");

            if (lines.Any(l => !string.IsNullOrWhiteSpace(l.LotNumber) && l.LotNumber!.Trim().Length > 80))
                return (false, "Seria nuk mund te kete me shume se 80 karaktere.");

            if (lines.Any(l => !string.IsNullOrWhiteSpace(l.BatchNumber) && l.BatchNumber!.Trim().Length > 80))
                return (false, "Grupi i prodhimit nuk mund te kete me shume se 80 karaktere.");

            /*
            // Optional: no duplicates (Product + FromBin)
            var dup = lines.GroupBy(l => new { l.ProductId, l.FromBinId }).Any(g => g.Count() > 1);
            if (dup) return (false, "Ke rreshta te dyfishuara (i njejti Produkt + Shport). Bashkoji ne nje rresht.");
            */
            return (true, null);
        }

        public async Task<(bool ok, string? error)> ValidateOutboundAvailabilityAsync(List<OutboundDocumentLine> lines)
        {
            // Group requested qty per Bin+Product+Lot/Batch/Expiry
            var request = lines
                .GroupBy(l => new { l.FromBinId, l.ProductId, l.LotNumber, l.BatchNumber, l.ExpiryDate })
                .Select(g => new
                {
                    g.Key.FromBinId,
                    g.Key.ProductId,
                    g.Key.LotNumber,
                    g.Key.BatchNumber,
                    g.Key.ExpiryDate,
                    Qty = g.Sum(x => x.Quantity),
                    ReservedQty = g.Sum(x => x.ReservedQuantity)
                })
                .ToList();

            foreach (var r in request)
            {
                var inv = await _db.Inventories
                    .FirstOrDefaultAsync(i =>
                        i.BinId == r.FromBinId &&
                        i.ProductId == r.ProductId &&
                        i.LotNumber == r.LotNumber &&
                        i.BatchNumber == r.BatchNumber &&
                        i.ExpiryDate == r.ExpiryDate);

                if (inv == null)
                    return (false, "Nuk ka rresht ne inventar per kombinimin e zgjedhur te produktit, shportes dhe lotit.");

                var available = inv.QtyOnHand - inv.QtyReserved + r.ReservedQty;
                if (r.Qty > available)
                    return (false, $"Sasia nuk mjafton per Product={r.ProductId} ne Bin={r.FromBinId}. Available={available}");
            }

            return (true, null);
        }
    }
}
