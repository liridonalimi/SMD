using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SMD.Application.Services.Exports;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using SMD.API.Contracts.Inventory;

namespace SMD.API.Controllers
{
    [Authorize(Policy = "CanExport")]
    [ApiController]
    [Route("api/exports/documents")]
    public class DocumentExportController : ControllerBase
    {
        private readonly IExportService _exports;

        public DocumentExportController(IExportService exports) => _exports = exports;

        [HttpGet("inbound/{id:guid}/pdf")]
        public async Task<IActionResult> InboundPdf(Guid id)
        {
            try
            {
                var (bytes, filename) = await _exports.ExportInboundPdfAsync(id);
                return File(bytes, "application/pdf", filename);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
        }

        [HttpGet("outbound/{id:guid}/pdf")]
        public async Task<IActionResult> OutboundPdf(Guid id)
        {
            try
            {
                var (bytes, filename) = await _exports.ExportOutboundPdfAsync(id);
                return File(bytes, "application/pdf", filename);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
        }
        
        [HttpGet("inbound/{id:guid}/excel")]
        public async Task<IActionResult> ExportInboundExcel(Guid id)
        {
            try
            {
                var (bytes, filename) = await _exports.ExportInboundExcelAsync(id);

                return File(
                    bytes,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    filename
                );
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
        }

        [HttpGet("outbound/{id:guid}/excel")]
        public async Task<IActionResult> ExportOutboundExcel(Guid id)
        {
            try
            {
                var (bytes, filename) = await _exports.ExportOutboundExcelAsync(id);

                return File(
                    bytes,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    filename
                );
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
        }

        [HttpGet("inventory/excel")]
        public async Task<IActionResult> ExportInventoryExcel([FromQuery] InventoryListQuery query)
        {
            var exportQuery = new InventoryExportQuery
            {
                Search = query.Search,
                WarehouseId = query.WarehouseId,
                ZoneId = query.ZoneId,
                RackId = query.RackId,
                BinId = query.BinId,
                ProductId = query.ProductId,
                OnlyInStock = query.OnlyInStock,
                OnlyOutOfStock = query.OnlyOutOfStock,
                OnlyBelowMinStock = query.OnlyBelowMinStock,
                LowStockThreshold = query.LowStockThreshold,
                SortBy = query.SortBy,
                SortDir = query.SortDir
            };

            var (bytes, filename) = await _exports.ExportInventoryExcelAsync(exportQuery);

            Response.Headers.Append("Access-Control-Expose-Headers", "Content-Disposition");

            return File(
                bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename
            );
        }

    }
}
