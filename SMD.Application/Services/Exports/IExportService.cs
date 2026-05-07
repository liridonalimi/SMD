using System;
using System.Threading.Tasks;

namespace SMD.Application.Services.Exports;

public interface IExportService
{
    Task<(byte[] Bytes, string FileName)> ExportInboundPdfAsync(Guid id);
    Task<(byte[] Bytes, string FileName)> ExportOutboundPdfAsync(Guid id);

    Task<(byte[] Bytes, string FileName)> ExportInboundExcelAsync(Guid id);
    Task<(byte[] Bytes, string FileName)> ExportOutboundExcelAsync(Guid id);

    Task<(byte[] Bytes, string FileName)> ExportInventoryCsvAsync();
    Task<(byte[] Bytes, string FileName)> ExportInventoryExcelAsync(InventoryExportQuery query);

    //Task<(byte[] Bytes, string FileName)> ExportStockMovementsCsvAsync(DateTime? from, DateTime? to);
}
