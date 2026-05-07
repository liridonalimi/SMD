using CsvHelper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.Infrastructure.Persistence;
using System.Globalization;
using System.Text;
using SMD.Infrastructure.Services.Audit;
using SMD.Application.Services.Exports;

namespace SMD.API.Controllers
{
    [Authorize(Policy = "CanExport")]
    [ApiController]
    [Route("api/exports/reports")]
    public class ReportExportController : ControllerBase
    {
        private readonly IExportService _exports;
        public ReportExportController(IExportService exports) => _exports = exports;

        [HttpGet("inventory.csv")]
        public async Task<IActionResult> InventoryCsv()
        {
            var (bytes, filename) = await _exports.ExportInventoryCsvAsync();
            return File(bytes, "text/csv", filename);
        }
        /*
        [HttpGet("stock-movements.csv")]
        public async Task<IActionResult> StockMovementsCsv([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var (bytes, filename) = await _exports.ExportStockMovementsCsvAsync(from, to);
            return File(bytes, "text/csv", filename);
        }
        */
    }
}