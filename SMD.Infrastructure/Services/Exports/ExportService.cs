using CsvHelper;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SMD.Application.Services.Exports;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using System.Globalization;
using System.Text;
using ClosedXML.Excel;


namespace SMD.Infrastructure.Services.Exports;

public class ExportService : IExportService
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;

    public ExportService(SmdDbContext db, AuditLogService audit)
    {
        _db = db;
        _audit = audit;
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public async Task<(byte[] Bytes, string FileName)> ExportInboundPdfAsync(Guid id)
    {
        var doc = await _db.InboundDocuments
            .Include(d => d.Lines).ThenInclude(l => l.Product)
            .Include(d => d.Lines).ThenInclude(l => l.ToBin)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (doc == null)
            throw new KeyNotFoundException("Inbound dokumenti nuk u gjet.");

        var totalQty = doc.Lines.Sum(x => x.Quantity);
        var printedAt = DateTime.Now;
        var statusText = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Draft => "Ne pergatitje",
            SMD.Domain.Enums.DocumentStatus.Confirmed => "Konfirmuar",
            SMD.Domain.Enums.DocumentStatus.Cancelled => "Anuluar",
            _ => doc.Status.ToString()
        };

        var statusBackground = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => Colors.Green.Lighten4,
            SMD.Domain.Enums.DocumentStatus.Cancelled => Colors.Red.Lighten4,
            _ => Colors.Amber.Lighten4
        };

        var statusForeground = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => Colors.Green.Darken3,
            SMD.Domain.Enums.DocumentStatus.Cancelled => Colors.Red.Darken3,
            _ => Colors.Amber.Darken4
        };

        var watermarkText = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Cancelled => "ANULUAR",
            SMD.Domain.Enums.DocumentStatus.Draft => "DRAFT",
            _ => null
        };

        var pdf = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(11));

                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(header =>
                        {
                            header.Item().Text("SMD").SemiBold().FontSize(11).FontColor(Colors.BlueGrey.Darken1);
                            header.Item().PaddingTop(2).Text("Flete Pranimi Malli").SemiBold().FontSize(22);
                            header.Item().PaddingTop(3).Text($"Dokumenti hyres • {doc.DocumentNo}")
                                .FontSize(12).FontColor(Colors.Grey.Darken2);
                        });

                        row.ConstantItem(120).AlignRight().AlignMiddle().Background(statusBackground).Border(1).BorderColor(statusForeground).Padding(8).Column(badge =>
                        {
                            badge.Item().AlignCenter().Text("Statusi i dokumentit").FontSize(9).FontColor(Colors.Grey.Darken2);
                            badge.Item().AlignCenter().Text(statusText).SemiBold().FontSize(12).FontColor(statusForeground);
                        });
                    });

                    col.Item().PaddingTop(14).Row(row =>
                    {
                        row.RelativeItem().Border(1).BorderColor(Colors.Grey.Lighten1).Padding(10).Column(meta =>
                        {
                            meta.Spacing(4);
                            meta.Item().Text(text =>
                            {
                                text.Span("Nr. Dokumentit: ").SemiBold();
                                text.Span(doc.DocumentNo);
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Referenca: ").SemiBold();
                                text.Span(string.IsNullOrWhiteSpace(doc.Reference) ? "-" : doc.Reference);
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Shenimi: ").SemiBold();
                                text.Span(string.IsNullOrWhiteSpace(doc.Note) ? "-" : doc.Note);
                            });
                        });

                        row.ConstantItem(18);

                        row.RelativeItem().Border(1).BorderColor(Colors.Grey.Lighten1).Padding(10).Column(meta =>
                        {
                            meta.Spacing(4);
                            meta.Item().Text(text =>
                            {
                                text.Span("Data e krijimit: ").SemiBold();
                                text.Span(doc.CreatedAt.ToString("dd.MM.yyyy HH:mm"));
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Data e printimit: ").SemiBold();
                                text.Span(printedAt.ToString("dd.MM.yyyy HH:mm"));
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Rreshta: ").SemiBold();
                                text.Span(doc.Lines.Count.ToString());
                            });
                        });
                    });

                    col.Item().PaddingTop(12).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                });

                page.Content().PaddingTop(10).Column(col =>
                {
                    if (doc.Lines.Count == 0)
                    {
                        col.Item().PaddingTop(10).Border(1).BorderColor(Colors.Grey.Lighten1).Background(Colors.Grey.Lighten5).Padding(18).AlignCenter().Text("Ky dokument nuk ka rreshta te regjistruar.")
                            .FontSize(12).FontColor(Colors.Grey.Darken2);
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(28);
                                columns.RelativeColumn(2);
                                columns.RelativeColumn(3);
                                columns.RelativeColumn(5);
                                columns.RelativeColumn(3);
                                columns.ConstantColumn(60);
                            });

                            static IContainer HeaderCell(IContainer c) =>
                                c.Background(Colors.BlueGrey.Lighten5).BorderBottom(1).BorderColor(Colors.Grey.Lighten1).PaddingVertical(8).PaddingHorizontal(6);

                            static IContainer BodyCell(IContainer c) =>
                                c.BorderBottom(1).BorderColor(Colors.Grey.Lighten3).PaddingVertical(7).PaddingHorizontal(6);

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("#").SemiBold();
                                header.Cell().Element(HeaderCell).Text("SKU").SemiBold();
                                header.Cell().Element(HeaderCell).Text("Barkodi").SemiBold();
                                header.Cell().Element(HeaderCell).Text("Produkti").SemiBold();
                                header.Cell().Element(HeaderCell).Text("Shporta").SemiBold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Sasia").SemiBold();
                            });

                            foreach (var entry in doc.Lines.Select((line, index) => new { line, index }))
                            {
                                table.Cell().Element(BodyCell).Text((entry.index + 1).ToString());
                                table.Cell().Element(BodyCell).Text(entry.line.Product?.Sku ?? "-");
                                table.Cell().Element(BodyCell).Text(entry.line.Product?.Barcode ?? "-");
                                table.Cell().Element(BodyCell).Column(cell =>
                                {
                                    cell.Item().Text(entry.line.Product?.Name ?? "-").SemiBold();
                                    if (!string.IsNullOrWhiteSpace(entry.line.Product?.Description))
                                        cell.Item().PaddingTop(1).Text(entry.line.Product.Description).FontSize(9).FontColor(Colors.Grey.Darken1);
                                });
                                table.Cell().Element(BodyCell).Text(string.IsNullOrWhiteSpace(entry.line.ToBin?.Name)
                                    ? (entry.line.ToBin?.Code ?? "-")
                                    : $"{entry.line.ToBin?.Code} - {entry.line.ToBin?.Name}");
                                table.Cell().Element(BodyCell).AlignRight().Text(entry.line.Quantity.ToString("0.##"));
                            }
                        });
                    }

                    col.Item().PaddingTop(12).Row(row =>
                    {
                        row.RelativeItem().Border(1).BorderColor(Colors.Grey.Lighten1).Background(Colors.BlueGrey.Lighten5).Padding(12).Column(summary =>
                        {
                            summary.Spacing(4);
                            summary.Item().Text("Permbledhje").SemiBold().FontSize(12);
                            summary.Item().Text(text =>
                            {
                                text.Span("Totali i rreshtave: ");
                                text.Span(doc.Lines.Count.ToString()).SemiBold();
                            });
                            summary.Item().Text(text =>
                            {
                                text.Span("Totali i sasise: ");
                                text.Span(totalQty.ToString("0.##")).SemiBold();
                            });
                            summary.Item().Text(text =>
                            {
                                text.Span("Statusi i dokumentit: ");
                                text.Span(statusText).SemiBold();
                            });
                        });
                    });

                    col.Item().PaddingTop(14).ShowEntire().Row(row =>
                    {
                        row.RelativeItem().Column(signature =>
                        {
                            signature.Item().Text("Pranoi nga").SemiBold();
                            signature.Item().PaddingTop(14).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        });
                        row.ConstantItem(24);
                        row.RelativeItem().Column(signature =>
                        {
                            signature.Item().Text("Kontrolloi").SemiBold();
                            signature.Item().PaddingTop(14).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        });
                        row.ConstantItem(24);
                        row.RelativeItem().Column(signature =>
                        {
                            signature.Item().Text("Data / Nenshkrimi").SemiBold();
                            signature.Item().PaddingTop(14).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        });
                    });
                });

                page.Footer().AlignCenter().Text(txt =>
                {
                    txt.Span("Gjeneruar nga SMD • ").FontSize(9).FontColor(Colors.Grey.Darken1);
                    txt.Span($"Faqe ").FontColor(Colors.Grey.Darken1);
                    txt.CurrentPageNumber().FontColor(Colors.Grey.Darken1);
                    txt.Span(" / ").FontColor(Colors.Grey.Darken1);
                    txt.TotalPages().FontColor(Colors.Grey.Darken1);
                });

                if (!string.IsNullOrWhiteSpace(watermarkText))
                {
                    page.Background().AlignCenter().AlignMiddle().Text(watermarkText)
                        .FontSize(68).FontColor(Colors.Grey.Lighten2).SemiBold();
                }
            });
        }).GeneratePdf();

        await _audit.WriteAsync(
            action: "EXPORT_INBOUND_PDF",
            entity: "InboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, Status={doc.Status}, Lines={doc.Lines.Count}, TotalQty={totalQty:0.##}"
        );

        return (pdf, $"{doc.DocumentNo}_{doc.Status.ToString()}.pdf");
    }

    public async Task<(byte[] Bytes, string FileName)> ExportOutboundPdfAsync(Guid id)
    {
        var doc = await _db.OutboundDocuments
            .Include(d => d.Lines).ThenInclude(l => l.Product)
            .Include(d => d.Lines).ThenInclude(l => l.FromBin)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (doc == null)
            throw new KeyNotFoundException("Outbound dokumenti nuk u gjet.");

        var totalQty = doc.Lines.Sum(x => x.Quantity);
        var printedAt = DateTime.Now;
        var statusText = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Draft => "Ne pergatitje",
            SMD.Domain.Enums.DocumentStatus.Confirmed => "Konfirmuar",
            SMD.Domain.Enums.DocumentStatus.Cancelled => "Anuluar",
            _ => doc.Status.ToString()
        };

        var statusBackground = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => Colors.Green.Lighten4,
            SMD.Domain.Enums.DocumentStatus.Cancelled => Colors.Red.Lighten4,
            _ => Colors.Amber.Lighten4
        };

        var statusForeground = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => Colors.Green.Darken3,
            SMD.Domain.Enums.DocumentStatus.Cancelled => Colors.Red.Darken3,
            _ => Colors.Amber.Darken4
        };

        var watermarkText = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Cancelled => "ANULUAR",
            SMD.Domain.Enums.DocumentStatus.Draft => "DRAFT",
            _ => null
        };

        var pdf = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(11));

                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(header =>
                        {
                            header.Item().Text("SMD").SemiBold().FontSize(11).FontColor(Colors.BlueGrey.Darken1);
                            header.Item().PaddingTop(2).Text("Flete Dalese Malli").SemiBold().FontSize(22);
                            header.Item().PaddingTop(3).Text($"Dokumenti dales • {doc.DocumentNo}")
                                .FontSize(12).FontColor(Colors.Grey.Darken2);
                        });

                        row.ConstantItem(120).AlignRight().AlignMiddle().Background(statusBackground).Border(1).BorderColor(statusForeground).Padding(8).Column(badge =>
                        {
                            badge.Item().AlignCenter().Text("Statusi").FontSize(9).FontColor(Colors.Grey.Darken2);
                            badge.Item().AlignCenter().Text(statusText).SemiBold().FontSize(12).FontColor(statusForeground);
                        });
                    });

                    col.Item().PaddingTop(14).Row(row =>
                    {
                        row.RelativeItem().Border(1).BorderColor(Colors.Grey.Lighten1).Padding(10).Column(meta =>
                        {
                            meta.Spacing(4);
                            meta.Item().Text(text =>
                            {
                                text.Span("Nr. Dokumentit: ").SemiBold();
                                text.Span(doc.DocumentNo);
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Referenca: ").SemiBold();
                                text.Span(string.IsNullOrWhiteSpace(doc.Reference) ? "-" : doc.Reference);
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Shenimi: ").SemiBold();
                                text.Span(string.IsNullOrWhiteSpace(doc.Note) ? "-" : doc.Note);
                            });
                        });

                        row.ConstantItem(18);

                        row.RelativeItem().Border(1).BorderColor(Colors.Grey.Lighten1).Padding(10).Column(meta =>
                        {
                            meta.Spacing(4);
                            meta.Item().Text(text =>
                            {
                                text.Span("Data e krijimit: ").SemiBold();
                                text.Span(doc.CreatedAt.ToString("dd.MM.yyyy HH:mm"));
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Data e printimit: ").SemiBold();
                                text.Span(printedAt.ToString("dd.MM.yyyy HH:mm"));
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Rreshta: ").SemiBold();
                                text.Span(doc.Lines.Count.ToString());
                            });
                        });
                    });

                    col.Item().PaddingTop(12).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                });

                page.Content().PaddingTop(10).Column(col =>
                {
                    if (doc.Lines.Count == 0)
                    {
                        col.Item().PaddingTop(10).Border(1).BorderColor(Colors.Grey.Lighten1).Background(Colors.Grey.Lighten5).Padding(18).AlignCenter().Text("Ky dokument nuk ka rreshta te regjistruar.")
                            .FontSize(12).FontColor(Colors.Grey.Darken2);
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(28);
                                columns.RelativeColumn(2);
                                columns.RelativeColumn(3);
                                columns.RelativeColumn(5);
                                columns.RelativeColumn(3);
                                columns.ConstantColumn(60);
                            });

                            static IContainer HeaderCell(IContainer c) =>
                                c.Background(Colors.BlueGrey.Lighten5).BorderBottom(1).BorderColor(Colors.Grey.Lighten1).PaddingVertical(8).PaddingHorizontal(6);

                            static IContainer BodyCell(IContainer c) =>
                                c.BorderBottom(1).BorderColor(Colors.Grey.Lighten3).PaddingVertical(7).PaddingHorizontal(6);

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("#").SemiBold();
                                header.Cell().Element(HeaderCell).Text("SKU").SemiBold();
                                header.Cell().Element(HeaderCell).Text("Barkodi").SemiBold();
                                header.Cell().Element(HeaderCell).Text("Produkti").SemiBold();
                                header.Cell().Element(HeaderCell).Text("Shporta").SemiBold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Sasia").SemiBold();
                            });

                            foreach (var entry in doc.Lines.Select((line, index) => new { line, index }))
                            {
                                table.Cell().Element(BodyCell).Text((entry.index + 1).ToString());
                                table.Cell().Element(BodyCell).Text(entry.line.Product?.Sku ?? "-");
                                table.Cell().Element(BodyCell).Text(entry.line.Product?.Barcode ?? "-");
                                table.Cell().Element(BodyCell).Column(cell =>
                                {
                                    cell.Item().Text(entry.line.Product?.Name ?? "-").SemiBold();
                                    if (!string.IsNullOrWhiteSpace(entry.line.Product?.Description))
                                        cell.Item().PaddingTop(1).Text(entry.line.Product.Description).FontSize(9).FontColor(Colors.Grey.Darken1);
                                });
                                table.Cell().Element(BodyCell).Text(string.IsNullOrWhiteSpace(entry.line.FromBin?.Name)
                                    ? (entry.line.FromBin?.Code ?? "-")
                                    : $"{entry.line.FromBin?.Code} - {entry.line.FromBin?.Name}");
                                table.Cell().Element(BodyCell).AlignRight().Text(entry.line.Quantity.ToString("0.##"));
                            }
                        });
                    }

                    col.Item().PaddingTop(12).Row(row =>
                    {
                        row.RelativeItem().Border(1).BorderColor(Colors.Grey.Lighten1).Background(Colors.BlueGrey.Lighten5).Padding(12).Column(summary =>
                        {
                            summary.Spacing(4);
                            summary.Item().Text("Permbledhje").SemiBold().FontSize(12);
                            summary.Item().Text(text =>
                            {
                                text.Span("Totali i rreshtave: ");
                                text.Span(doc.Lines.Count.ToString()).SemiBold();
                            });
                            summary.Item().Text(text =>
                            {
                                text.Span("Totali i sasise: ");
                                text.Span(totalQty.ToString("0.##")).SemiBold();
                            });
                            summary.Item().Text(text =>
                            {
                                text.Span("Statusi i dokumentit: ");
                                text.Span(statusText).SemiBold();
                            });
                        });
                    });

                    col.Item().PaddingTop(14).ShowEntire().Row(row =>
                    {
                        row.RelativeItem().Column(signature =>
                        {
                            signature.Item().Text("Pranoi nga").SemiBold();
                            signature.Item().PaddingTop(14).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        });
                        row.ConstantItem(24);
                        row.RelativeItem().Column(signature =>
                        {
                            signature.Item().Text("Kontrolloi").SemiBold();
                            signature.Item().PaddingTop(14).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        });
                        row.ConstantItem(24);
                        row.RelativeItem().Column(signature =>
                        {
                            signature.Item().Text("Data / Nenshkrimi").SemiBold();
                            signature.Item().PaddingTop(14).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        });
                    });
                });

                page.Footer().AlignCenter().Text(txt =>
                {
                    txt.Span("Gjeneruar nga SMD • ").FontSize(9).FontColor(Colors.Grey.Darken1);
                    txt.Span("Faqe ").FontColor(Colors.Grey.Darken1);
                    txt.CurrentPageNumber().FontColor(Colors.Grey.Darken1);
                    txt.Span(" / ").FontColor(Colors.Grey.Darken1);
                    txt.TotalPages().FontColor(Colors.Grey.Darken1);
                });

                if (!string.IsNullOrWhiteSpace(watermarkText))
                {
                    page.Background().AlignCenter().AlignMiddle().Text(watermarkText)
                        .FontSize(68).FontColor(Colors.Grey.Lighten2).SemiBold();
                }
            });
        }).GeneratePdf();

        await _audit.WriteAsync(
            action: "EXPORT_OUTBOUND_PDF",
            entity: "OutboundDocument",
            entityId: doc.Id.ToString(),
            details: $"DocNo={doc.DocumentNo}, Status={doc.Status}, Lines={doc.Lines.Count}, TotalQty={totalQty:0.##}"
        );

        return (pdf, $"{doc.DocumentNo}_{doc.Status.ToString()}.pdf");
    }

    public async Task<(byte[] Bytes, string FileName)> ExportInboundExcelAsync(Guid id)
    {
        var doc = await _db.InboundDocuments
            .Include(x => x.Lines).ThenInclude(l => l.Product)
            .Include(x => x.Lines).ThenInclude(l => l.ToBin)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doc == null)
            throw new KeyNotFoundException("Dokumenti hyres (Inbound) nuk u gjet.");

        var totalQty = doc.Lines.Sum(x => x.Quantity);
        var statusText = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Draft => "Ne pergatitje",
            SMD.Domain.Enums.DocumentStatus.Confirmed => "Konfirmuar",
            SMD.Domain.Enums.DocumentStatus.Cancelled => "Anuluar",
            _ => doc.Status.ToString()
        };

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Inbound");

        ws.Cell("A1").Value = "SMD";
        ws.Cell("A2").Value = "Flete Pranimi Malli";
        ws.Cell("A3").Value = $"Dokumenti hyres • {doc.DocumentNo}";

        ws.Range("A1:H1").Merge();
        ws.Range("A2:H2").Merge();
        ws.Range("A3:H3").Merge();

        ws.Cell("A5").Value = "Nr. Dokumentit";
        ws.Cell("B5").Value = doc.DocumentNo;
        ws.Cell("A6").Value = "Referenca";
        ws.Cell("B6").Value = string.IsNullOrWhiteSpace(doc.Reference) ? "-" : doc.Reference;
        ws.Cell("A7").Value = "Shenimi";
        ws.Cell("B7").Value = string.IsNullOrWhiteSpace(doc.Note) ? "-" : doc.Note;
        ws.Cell("E5").Value = "Statusi i dokumentit";
        ws.Cell("F5").Value = statusText;
        ws.Cell("E6").Value = "Data e krijimit";
        ws.Cell("F6").Value = doc.CreatedAt;
        ws.Cell("E7").Value = "Data e eksportit";
        ws.Cell("F7").Value = DateTime.Now;

        ws.Range("A5:B7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("E5:F7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("E5:F7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
        ws.Range("E5:F7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");

        ws.Range("A5:A7").Style.Font.Bold = true;
        ws.Range("E5:E7").Style.Font.Bold = true;
        ws.Cell("F5").Style.Font.Bold = true;
        ws.Cell("F5").Style.Font.FontColor = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => XLColor.FromHtml("#166534"),
            SMD.Domain.Enums.DocumentStatus.Cancelled => XLColor.FromHtml("#B91C1C"),
            _ => XLColor.FromHtml("#B45309")
        };
        ws.Cell("F5").Style.Fill.BackgroundColor = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => XLColor.FromHtml("#DCFCE7"),
            SMD.Domain.Enums.DocumentStatus.Cancelled => XLColor.FromHtml("#FEE2E2"),
            _ => XLColor.FromHtml("#FEF3C7")
        };

        ws.Cell("A10").Value = "#";
        ws.Cell("B10").Value = "SKU";
        ws.Cell("C10").Value = "Barkodi";
        ws.Cell("D10").Value = "Produkti";
        ws.Cell("E10").Value = "Pershkrimi";
        ws.Cell("F10").Value = "Shporta";
        ws.Cell("G10").Value = "Kodi shportes";
        ws.Cell("H10").Value = "Sasia";

        var row = 11;
        var index = 1;
        foreach (var line in doc.Lines)
        {
            ws.Cell(row, 1).Value = index++;
            ws.Cell(row, 2).Value = line.Product?.Sku ?? "";
            ws.Cell(row, 3).Value = line.Product?.Barcode ?? "";
            ws.Cell(row, 4).Value = line.Product?.Name ?? "";
            ws.Cell(row, 5).Value = line.Product?.Description ?? "";
            ws.Cell(row, 6).Value = line.ToBin?.Name ?? "";
            ws.Cell(row, 7).Value = line.ToBin?.Code ?? "";

            if (line.Quantity == Math.Truncate(line.Quantity))
            {
                ws.Cell(row, 8).Value = Convert.ToInt32(line.Quantity);
                ws.Cell(row, 8).Style.NumberFormat.Format = "0";
            }
            else
            {
                ws.Cell(row, 8).Value = Convert.ToDouble(line.Quantity);
                ws.Cell(row, 8).Style.NumberFormat.Format = "0.##";
            }
            row++;
        }

        if (doc.Lines.Count == 0)
        {
            ws.Range("A11:H11").Merge();
            ws.Cell("A11").Value = "Ky dokument nuk ka rreshta te regjistruar.";
            ws.Cell("A11").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell("A11").Style.Font.Italic = true;
            ws.Cell("A11").Style.Font.FontColor = XLColor.Gray;
            row = 12;
        }

        ws.Cell(row + 1, 1).Value = "Permbledhje";
        ws.Cell(row + 2, 1).Value = "Totali i rreshtave";
        ws.Cell(row + 2, 2).Value = doc.Lines.Count;
        ws.Cell(row + 3, 1).Value = "Totali i sasise";
        if (totalQty == Math.Truncate(totalQty))
        {
            ws.Cell(row + 3, 2).Value = Convert.ToInt32(totalQty);
            ws.Cell(row + 3, 2).Style.NumberFormat.Format = "0";
        }
        else
        {
            ws.Cell(row + 3, 2).Value = Convert.ToDouble(totalQty);
            ws.Cell(row + 3, 2).Style.NumberFormat.Format = "0.##";
        }
        ws.Cell(row + 4, 1).Value = "Statusi i dokumentit";
        ws.Cell(row + 4, 2).Value = statusText;

        var summaryRange = ws.Range(row + 1, 1, row + 4, 2);
        summaryRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#EEF3F8");
        ws.Cell(row + 1, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 1, row + 4, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 2, row + 4, 2).Style.Font.Bold = true;

        ws.Range("A10:H10").Style.Font.Bold = true;
        ws.Range("A10:H10").Style.Fill.BackgroundColor = XLColor.FromHtml("#D9EAF7");
        ws.Range("A10:H10").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range("A10:H10").Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Range("A10:H10").Style.Border.TopBorder = XLBorderStyleValues.Thin;
        ws.Range("A10:H10").Style.Border.BottomBorder = XLBorderStyleValues.Thin;

        if (doc.Lines.Count > 0)
        {
            ws.Range(10, 1, row - 1, 8).Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            ws.Range(10, 1, row - 1, 8).SetAutoFilter();
        }

        ws.Cell("A1").Style.Font.FontColor = XLColor.FromHtml("#64748B");
        ws.Cell("A1").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.FontSize = 18;
        ws.Cell("A3").Style.Font.FontColor = XLColor.FromHtml("#475569");

        ws.Column(1).Width = 24;
        ws.Column(2).Width = 16;
        ws.Column(3).Width = 18;
        ws.Column(4).Width = 31;
        ws.Column(5).Width = 42;
        ws.Column(6).Width = 26;
        ws.Column(7).Width = 16;
        ws.Column(8).Width = 14;

        ws.Column(8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Range("A11:A2000").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range("H11:H2000").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Range("F6:F7").Style.DateFormat.Format = "dd.MM.yyyy HH:mm";
        ws.Range("A5:A7").Style.Alignment.WrapText = false;
        ws.Range("A17:A20").Style.Alignment.WrapText = false;
        ws.Range("B5:B7").Style.Alignment.WrapText = true;
        ws.Range("F5:F7").Style.Alignment.WrapText = true;
        ws.Range("D11:H2000").Style.Alignment.WrapText = true;
        ws.Rows(11, Math.Max(row - 1, 11)).Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
        ws.Rows(11, Math.Max(row - 1, 11)).AdjustToContents();

        ws.SheetView.FreezeRows(10);
        ws.SheetView.FreezeColumns(2);

        ws.PageSetup.PageOrientation = XLPageOrientation.Portrait;
        ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
        ws.PageSetup.Margins.Top = 0.4;
        ws.PageSetup.Margins.Bottom = 0.4;
        ws.PageSetup.Margins.Left = 0.3;
        ws.PageSetup.Margins.Right = 0.3;
        ws.PageSetup.FitToPages(1, 0);
        ws.PageSetup.CenterHorizontally = true;
        ws.PageSetup.SetRowsToRepeatAtTop(1, 10);

        ws.PageSetup.Header.Left.AddText("SMD");
        ws.PageSetup.Header.Center.AddText("Flete Pranimi Malli");
        ws.PageSetup.Footer.Center.AddText("Gjeneruar nga SMD");
        ws.PageSetup.Footer.Right.AddText("Faqe &[Page] / &[Pages]");

        using var ms = new MemoryStream();
        wb.SaveAs(ms);

        var fileName = $"{doc.DocumentNo}_{doc.Status.ToString()}.xlsx";
        return (ms.ToArray(), fileName);
    }

    public async Task<(byte[] Bytes, string FileName)> ExportOutboundExcelAsync(Guid id)
    {
        var doc = await _db.OutboundDocuments
            .Include(x => x.Lines).ThenInclude(l => l.Product)
            .Include(x => x.Lines).ThenInclude(l => l.FromBin) // nëse e ke
            .FirstOrDefaultAsync(x => x.Id == id);

        if (doc == null)
            throw new KeyNotFoundException("Outbound document not found.");

        var totalQty = doc.Lines.Sum(x => x.Quantity);
        var statusText = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Draft => "Ne pergatitje",
            SMD.Domain.Enums.DocumentStatus.Confirmed => "Konfirmuar",
            SMD.Domain.Enums.DocumentStatus.Cancelled => "Anuluar",
            _ => doc.Status.ToString()
        };

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Outbound");

        ws.Cell("A1").Value = "SMD";
        ws.Cell("A2").Value = "Flete Dalese Malli";
        ws.Cell("A3").Value = $"Dokumenti dales • {doc.DocumentNo}";

        ws.Range("A1:H1").Merge();
        ws.Range("A2:H2").Merge();
        ws.Range("A3:H3").Merge();

        ws.Cell("A5").Value = "Nr. Dokumentit";
        ws.Cell("B5").Value = doc.DocumentNo;
        ws.Cell("A6").Value = "Referenca";
        ws.Cell("B6").Value = string.IsNullOrWhiteSpace(doc.Reference) ? "-" : doc.Reference;
        ws.Cell("A7").Value = "Shenimi";
        ws.Cell("B7").Value = string.IsNullOrWhiteSpace(doc.Note) ? "-" : doc.Note;
        ws.Cell("E5").Value = "Statusi i dokumentit";
        ws.Cell("F5").Value = statusText;
        ws.Cell("E6").Value = "Data e krijimit";
        ws.Cell("F6").Value = doc.CreatedAt;
        ws.Cell("E7").Value = "Data e eksportit";
        ws.Cell("F7").Value = DateTime.Now;

        ws.Range("A5:B7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("E5:F7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("E5:F7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
        ws.Range("E5:F7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");

        ws.Range("A5:A7").Style.Font.Bold = true;
        ws.Range("E5:E7").Style.Font.Bold = true;
        ws.Cell("F5").Style.Font.Bold = true;
        ws.Cell("F5").Style.Font.FontColor = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => XLColor.FromHtml("#166534"),
            SMD.Domain.Enums.DocumentStatus.Cancelled => XLColor.FromHtml("#B91C1C"),
            _ => XLColor.FromHtml("#B45309")
        };
        ws.Cell("F5").Style.Fill.BackgroundColor = doc.Status switch
        {
            SMD.Domain.Enums.DocumentStatus.Confirmed => XLColor.FromHtml("#DCFCE7"),
            SMD.Domain.Enums.DocumentStatus.Cancelled => XLColor.FromHtml("#FEE2E2"),
            _ => XLColor.FromHtml("#FEF3C7")
        };

        ws.Cell("A10").Value = "#";
        ws.Cell("B10").Value = "SKU";
        ws.Cell("C10").Value = "Barkodi";
        ws.Cell("D10").Value = "Produkti";
        ws.Cell("E10").Value = "Pershkrimi";
        ws.Cell("F10").Value = "Shporta";
        ws.Cell("G10").Value = "Kodi shportes";
        ws.Cell("H10").Value = "Sasia";

        var row = 11;
        var index = 1;
        foreach (var line in doc.Lines)
        {
            ws.Cell(row, 1).Value = index++;
            ws.Cell(row, 2).Value = line.Product?.Sku ?? "";
            ws.Cell(row, 3).Value = line.Product?.Barcode ?? "";
            ws.Cell(row, 4).Value = line.Product?.Name ?? "";
            ws.Cell(row, 5).Value = line.Product?.Description ?? "";
            ws.Cell(row, 6).Value = line.FromBin?.Name ?? "";
            ws.Cell(row, 7).Value = line.FromBin?.Code ?? "";

            if (line.Quantity == Math.Truncate(line.Quantity))
            {
                ws.Cell(row, 8).Value = Convert.ToInt32(line.Quantity);
                ws.Cell(row, 8).Style.NumberFormat.Format = "0";
            }
            else
            {
                ws.Cell(row, 8).Value = Convert.ToDouble(line.Quantity);
                ws.Cell(row, 8).Style.NumberFormat.Format = "0.##";
            }
            row++;
        }

        if (doc.Lines.Count == 0)
        {
            ws.Range("A11:H11").Merge();
            ws.Cell("A11").Value = "Ky dokument nuk ka rreshta te regjistruar.";
            ws.Cell("A11").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell("A11").Style.Font.Italic = true;
            ws.Cell("A11").Style.Font.FontColor = XLColor.Gray;
            row = 12;
        }

        ws.Cell(row + 1, 1).Value = "Permbledhje";
        ws.Cell(row + 2, 1).Value = "Totali i rreshtave";
        ws.Cell(row + 2, 2).Value = doc.Lines.Count;
        ws.Cell(row + 3, 1).Value = "Totali i sasise";
        if (totalQty == Math.Truncate(totalQty))
        {
            ws.Cell(row + 3, 2).Value = Convert.ToInt32(totalQty);
            ws.Cell(row + 3, 2).Style.NumberFormat.Format = "0";
        }
        else
        {
            ws.Cell(row + 3, 2).Value = Convert.ToDouble(totalQty);
            ws.Cell(row + 3, 2).Style.NumberFormat.Format = "0.##";
        }
        ws.Cell(row + 4, 1).Value = "Statusi i dokumentit";
        ws.Cell(row + 4, 2).Value = statusText;

        var summaryRange = ws.Range(row + 1, 1, row + 4, 2);
        summaryRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#EEF3F8");
        ws.Cell(row + 1, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 1, row + 4, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 2, row + 4, 2).Style.Font.Bold = true;

        ws.Range("A10:H10").Style.Font.Bold = true;
        ws.Range("A10:H10").Style.Fill.BackgroundColor = XLColor.FromHtml("#D9EAF7");
        ws.Range("A10:H10").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range("A10:H10").Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Range("A10:H10").Style.Border.TopBorder = XLBorderStyleValues.Thin;
        ws.Range("A10:H10").Style.Border.BottomBorder = XLBorderStyleValues.Thin;

        if (doc.Lines.Count > 0)
        {
            ws.Range(10, 1, row - 1, 8).Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            ws.Range(10, 1, row - 1, 8).SetAutoFilter();
        }

        ws.Cell("A1").Style.Font.FontColor = XLColor.FromHtml("#64748B");
        ws.Cell("A1").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.FontSize = 18;
        ws.Cell("A3").Style.Font.FontColor = XLColor.FromHtml("#475569");

        ws.Column(1).Width = 24;
        ws.Column(2).Width = 16;
        ws.Column(3).Width = 18;
        ws.Column(4).Width = 31;
        ws.Column(5).Width = 42;
        ws.Column(6).Width = 26;
        ws.Column(7).Width = 16;
        ws.Column(8).Width = 14;

        ws.Column(8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Range("A11:A2000").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range("H11:H2000").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Range("F6:F7").Style.DateFormat.Format = "dd.MM.yyyy HH:mm";
        ws.Range("A5:A7").Style.Alignment.WrapText = false;
        ws.Range("A17:A20").Style.Alignment.WrapText = false;
        ws.Range("B5:B7").Style.Alignment.WrapText = true;
        ws.Range("F5:F7").Style.Alignment.WrapText = true;
        ws.Range("D11:H2000").Style.Alignment.WrapText = true;
        ws.Rows(11, Math.Max(row - 1, 11)).Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
        ws.Rows(11, Math.Max(row - 1, 11)).AdjustToContents();

        ws.SheetView.FreezeRows(10);
        ws.SheetView.FreezeColumns(2);

        ws.PageSetup.PageOrientation = XLPageOrientation.Portrait;
        ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
        ws.PageSetup.Margins.Top = 0.4;
        ws.PageSetup.Margins.Bottom = 0.4;
        ws.PageSetup.Margins.Left = 0.3;
        ws.PageSetup.Margins.Right = 0.3;
        ws.PageSetup.FitToPages(1, 0);
        ws.PageSetup.CenterHorizontally = true;
        ws.PageSetup.SetRowsToRepeatAtTop(1, 10);

        ws.PageSetup.Header.Left.AddText("SMD");
        ws.PageSetup.Header.Center.AddText("Flete Dalese Malli");
        ws.PageSetup.Footer.Center.AddText("Gjeneruar nga SMD");
        ws.PageSetup.Footer.Right.AddText("Faqe &[Page] / &[Pages]");

        using var ms = new MemoryStream();
        wb.SaveAs(ms);

        return (ms.ToArray(), $"{doc.DocumentNo}_{doc.Status}.xlsx");
    }

    public async Task<(byte[] Bytes, string FileName)> ExportInventoryCsvAsync()
    {
        var rows = await _db.Inventories
            .Include(i => i.Product)
            .Include(i => i.Bin)
            .Select(i => new
            {
                ProductSku = i.Product.Sku,
                ProductName = i.Product.Name,
                BinCode = i.Bin.Code,
                i.QtyOnHand,
                i.QtyReserved,
                QtyAvailable = i.QtyOnHand - i.QtyReserved,
                i.UpdatedAt
            })
            .OrderBy(x => x.ProductSku)
            .ThenBy(x => x.BinCode)
            .ToListAsync();

        var bytes = WriteCsv(rows);

        await _audit.WriteAsync("EXPORT_INVENTORY_CSV", "Inventory", "-", $"Rows={rows.Count}");

        return (bytes, $"inventory_{DateTime.UtcNow:yyyyMMdd_HHmm}.csv");
    }

    public async Task<(byte[] Bytes, string FileName)> ExportInventoryExcelAsync(InventoryExportQuery query)
    {
        var q = _db.Inventories
            .AsNoTracking()
            .Include(i => i.Product)
            .Include(i => i.Bin)
                .ThenInclude(b => b.Rack)
                    .ThenInclude(r => r.Zone)
                        .ThenInclude(z => z.Warehouse)
            .AsQueryable();

        // SEARCH
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var s = query.Search.Trim().ToLower();

            q = q.Where(i =>
                i.Product.Name.ToLower().Contains(s) ||
                i.Product.Sku.ToLower().Contains(s) ||
                (i.Product.Barcode != null && i.Product.Barcode.ToLower().Contains(s)) ||
                (i.Product.Description != null && i.Product.Description.ToLower().Contains(s)) ||

                i.Bin.Code.ToLower().Contains(s) ||
                i.Bin.Name.ToLower().Contains(s) ||

                i.Bin.Rack.Code.ToLower().Contains(s) ||
                i.Bin.Rack.Name.ToLower().Contains(s) ||

                i.Bin.Rack.Zone.Code.ToLower().Contains(s) ||
                i.Bin.Rack.Zone.Name.ToLower().Contains(s) ||

                i.Bin.Rack.Zone.Warehouse.Code.ToLower().Contains(s) ||
                i.Bin.Rack.Zone.Warehouse.Name.ToLower().Contains(s) ||
                (i.Bin.Rack.Zone.Warehouse.Address != null &&
                 i.Bin.Rack.Zone.Warehouse.Address.ToLower().Contains(s))
            );
        }

        // FILTERS
        if (query.WarehouseId.HasValue)
            q = q.Where(i => i.Bin.Rack.Zone.WarehouseId == query.WarehouseId);

        if (query.ZoneId.HasValue)
            q = q.Where(i => i.Bin.Rack.ZoneId == query.ZoneId);

        if (query.RackId.HasValue)
            q = q.Where(i => i.Bin.RackId == query.RackId);

        if (query.BinId.HasValue)
            q = q.Where(i => i.BinId == query.BinId);

        if (query.ProductId.HasValue)
            q = q.Where(i => i.ProductId == query.ProductId);

        if (query.OnlyInStock)
            q = q.Where(i => i.QtyOnHand > 0);

        if (query.OnlyOutOfStock)
            q = q.Where(i => i.QtyOnHand == 0);

        if (query.OnlyBelowMinStock)
        {
            var minStockFilterThreshold = query.LowStockThreshold ?? 5;
            q = q.Where(i =>
                (i.QtyOnHand - i.QtyReserved) > 0 &&
                (i.QtyOnHand - i.QtyReserved) <= (i.Product.MinStockLevel > 0 ? i.Product.MinStockLevel : minStockFilterThreshold));
        }

        if (query.LowStockThreshold.HasValue)
            q = q.Where(i => (i.QtyOnHand - i.QtyReserved) > 0 &&
                             (i.QtyOnHand - i.QtyReserved) < query.LowStockThreshold.Value);

        // SORT
        q = (query.SortBy?.ToLower(), query.SortDir?.ToLower()) switch
        {
            ("sku", "desc") => q.OrderByDescending(i => i.Product.Sku),
            ("sku", _) => q.OrderBy(i => i.Product.Sku),

            ("name", "desc") => q.OrderByDescending(i => i.Product.Name),
            ("name", _) => q.OrderBy(i => i.Product.Name),

            ("qty", "desc") => q.OrderByDescending(i => i.QtyOnHand),
            ("qty", _) => q.OrderBy(i => i.QtyOnHand),

            ("available", "desc") => q.OrderByDescending(i => (i.QtyOnHand - i.QtyReserved)),
            ("available", _) => q.OrderBy(i => (i.QtyOnHand - i.QtyReserved)),

            ("warehouse", "desc") => q.OrderByDescending(i => i.Bin.Rack.Zone.Warehouse.Code),
            ("warehouse", _) => q.OrderBy(i => i.Bin.Rack.Zone.Warehouse.Code),

            ("bin", "desc") => q.OrderByDescending(i => i.Bin.Code),
            ("bin", _) => q.OrderBy(i => i.Bin.Code),

            _ => q.OrderBy(i => i.Product.Sku)
        };

        var items = await q.ToListAsync();

        string? filterWarehouseCode = null;
        string? filterZoneCode = null;
        string? filterRackCode = null;
        string? filterBinCode = null;

        if (query.WarehouseId.HasValue)
        {
            filterWarehouseCode = await _db.Warehouses
                .Where(x => x.Id == query.WarehouseId.Value)
                .Select(x => x.Code)
                .FirstOrDefaultAsync();
        }

        if (query.ZoneId.HasValue)
        {
            filterZoneCode = await _db.Zones
                .Where(x => x.Id == query.ZoneId.Value)
                .Select(x => x.Code)
                .FirstOrDefaultAsync();
        }

        if (query.RackId.HasValue)
        {
            filterRackCode = await _db.Racks
                .Where(x => x.Id == query.RackId.Value)
                .Select(x => x.Code)
                .FirstOrDefaultAsync();
        }

        if (query.BinId.HasValue)
        {
            filterBinCode = await _db.Bins
                .Where(x => x.Id == query.BinId.Value)
                .Select(x => x.Code)
                .FirstOrDefaultAsync();
        }

        var totalQtyOnHand = items.Sum(x => x.QtyOnHand);
        var totalQtyReserved = items.Sum(x => x.QtyReserved);
        var totalQtyAvailable = totalQtyOnHand - totalQtyReserved;
        var fallbackThreshold = query.LowStockThreshold ?? 5;
        var outOfStockCount = items.Count(x => (x.QtyOnHand - x.QtyReserved) <= 0);
        var lowStockCount = items.Count(x =>
        {
            var available = x.QtyOnHand - x.QtyReserved;
            var threshold = x.Product?.MinStockLevel > 0 ? x.Product.MinStockLevel : fallbackThreshold;
            return available > 0 && available <= threshold;
        });
        var searchText = string.IsNullOrWhiteSpace(query.Search) ? "Te gjitha produktet" : $"Kerko: {query.Search.Trim()}";
        var stockFilterText = query.OnlyOutOfStock
            ? "Vetem produkte pa stok"
            : query.OnlyBelowMinStock
                ? "Vetem nen prag minimal"
                : query.OnlyInStock
                    ? "Vetem produkte me stok"
                    : "Te gjitha gjendjet";
        var locationParts = new[] { filterWarehouseCode, filterZoneCode, filterRackCode, filterBinCode }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();
        var locationText = locationParts.Count == 0 ? "Te gjitha depot" : string.Join(" / ", locationParts);

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Inventari");

        const int tableHeaderRow = 10;
        const int firstDataRow = 11;
        const int columnCount = 14;

        ws.Cell("A1").Value = "SMD";
        ws.Cell("A2").Value = "Raporti i Inventarit";
        ws.Cell("A3").Value = "Gjendja aktuale e stokut ne depo";

        ws.Range(1, 1, 1, columnCount).Merge();
        ws.Range(2, 1, 2, columnCount).Merge();
        ws.Range(3, 1, 3, columnCount).Merge();

        ws.Cell("A5").Value = "Filtri";
        ws.Cell("B5").Value = searchText;
        ws.Cell("A6").Value = "Vendndodhja";
        ws.Cell("B6").Value = locationText;
        ws.Cell("A7").Value = "Data e eksportit";
        ws.Cell("B7").Value = DateTime.Now;
        ws.Cell("H5").Value = "Statusi i raportit";
        ws.Cell("I5").Value = stockFilterText;
        ws.Cell("H6").Value = "Rreshta";
        ws.Cell("I6").Value = items.Count;
        ws.Cell("H7").Value = "Pragu minimal baze";
        ws.Cell("I7").Value = Math.Truncate(fallbackThreshold);

        ws.Range("A5:B7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("H5:I7").Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        ws.Range("H5:I7").Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        ws.Range("A5:B7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
        ws.Range("H5:I7").Style.Fill.BackgroundColor = XLColor.FromHtml("#F8FAFC");
        ws.Range("A5:A7").Style.Font.Bold = true;
        ws.Range("H5:H7").Style.Font.Bold = true;
        ws.Range("B7:B7").Style.DateFormat.Format = "dd.MM.yyyy HH:mm";
        ws.Range("I6:I7").Style.NumberFormat.Format = "0";

        var headers = new[]
        {
            "#",
            "SKU",
            "Barkodi",
            "Produkti",
            "Depoja",
            "Adresa e depos",
            "Zona",
            "Rafti",
            "Shporta",
            "Sasia ne depo",
            "Rezervuar",
            "Ne dispozicion",
            "Pragu minimal",
            "Statusi"
        };

        for (var i = 0; i < headers.Length; i++)
            ws.Cell(tableHeaderRow, i + 1).Value = headers[i];

        var row = firstDataRow;
        var index = 1;
        foreach (var it in items)
        {
            var warehouseCode = it.Bin?.Rack?.Zone?.Warehouse?.Code ?? "";
            var warehouseName = it.Bin?.Rack?.Zone?.Warehouse?.Name ?? "";
            var warehouseAddress = it.Bin?.Rack?.Zone?.Warehouse?.Address ?? "";

            var zoneCode = it.Bin?.Rack?.Zone?.Code ?? "";
            var zoneName = it.Bin?.Rack?.Zone?.Name ?? "";

            var rackCode = it.Bin?.Rack?.Code ?? "";
            var rackName = it.Bin?.Rack?.Name ?? "";

            var binCode = it.Bin?.Code ?? "";
            var binName = it.Bin?.Name ?? "";

            var available = it.QtyOnHand - it.QtyReserved;
            var threshold = it.Product?.MinStockLevel > 0 ? it.Product.MinStockLevel : fallbackThreshold;
            var status = available <= 0
                ? "Pa stok"
                : available <= threshold
                    ? "Nen prag minimal"
                    : "Ne dispozicion";

            ws.Cell(row, 1).Value = index++;
            ws.Cell(row, 2).Value = it.Product?.Sku ?? "";
            ws.Cell(row, 3).Value = it.Product?.Barcode ?? "";
            ws.Cell(row, 4).Value = it.Product?.Name ?? "";
            ws.Cell(row, 5).Value = string.IsNullOrWhiteSpace(warehouseName) ? warehouseCode : $"{warehouseCode} - {warehouseName}";
            ws.Cell(row, 6).Value = warehouseAddress;
            ws.Cell(row, 7).Value = string.IsNullOrWhiteSpace(zoneName) ? zoneCode : $"{zoneCode} - {zoneName}";
            ws.Cell(row, 8).Value = string.IsNullOrWhiteSpace(rackName) ? rackCode : $"{rackCode} - {rackName}";
            ws.Cell(row, 9).Value = string.IsNullOrWhiteSpace(binName) ? binCode : $"{binCode} - {binName}";
            ws.Cell(row, 10).Value = it.QtyOnHand;
            ws.Cell(row, 11).Value = it.QtyReserved;
            ws.Cell(row, 12).Value = available;
            ws.Cell(row, 13).Value = Math.Truncate(it.Product?.MinStockLevel ?? 0);
            ws.Cell(row, 14).Value = status;

            if (status == "Pa stok")
                ws.Range(row, 1, row, columnCount).Style.Fill.BackgroundColor = XLColor.FromHtml("#FEE2E2");
            else if (status == "Nen prag minimal")
                ws.Range(row, 1, row, columnCount).Style.Fill.BackgroundColor = XLColor.FromHtml("#FEF3C7");

            row++;
        }

        if (items.Count == 0)
        {
            ws.Range(firstDataRow, 1, firstDataRow, columnCount).Merge();
            ws.Cell(firstDataRow, 1).Value = "Nuk ka rreshta per filtrat e zgjedhur.";
            ws.Cell(firstDataRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(firstDataRow, 1).Style.Font.Italic = true;
            ws.Cell(firstDataRow, 1).Style.Font.FontColor = XLColor.Gray;
            row = firstDataRow + 1;
        }

        ws.Cell(row + 1, 1).Value = "Permbledhje";
        ws.Cell(row + 2, 1).Value = "Totali i rreshtave";
        ws.Cell(row + 2, 2).Value = items.Count;
        ws.Cell(row + 3, 1).Value = "Totali i sasise ne depo";
        ws.Cell(row + 3, 2).Value = totalQtyOnHand;
        ws.Cell(row + 4, 1).Value = "Totali ne dispozicion";
        ws.Cell(row + 4, 2).Value = totalQtyAvailable;
        ws.Cell(row + 5, 1).Value = "Produkte pa stok";
        ws.Cell(row + 5, 2).Value = outOfStockCount;
        ws.Cell(row + 6, 1).Value = "Produkte nen prag";
        ws.Cell(row + 6, 2).Value = lowStockCount;

        var summaryRange = ws.Range(row + 1, 1, row + 6, 2);
        summaryRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        summaryRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#EEF3F8");
        ws.Cell(row + 1, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 1, row + 6, 1).Style.Font.Bold = true;
        ws.Range(row + 2, 2, row + 6, 2).Style.Font.Bold = true;
        ws.Range(row + 2, 2, row + 6, 2).Style.NumberFormat.Format = "0";

        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Font.Bold = true;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Fill.BackgroundColor = XLColor.FromHtml("#D9EAF7");
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Border.TopBorder = XLBorderStyleValues.Thin;
        ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        ws.Range(tableHeaderRow, 1, Math.Max(row - 1, tableHeaderRow), columnCount).Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        if (items.Count > 0)
            ws.Range(tableHeaderRow, 1, row - 1, columnCount).SetAutoFilter();
        else
            ws.Range(tableHeaderRow, 1, tableHeaderRow, columnCount).SetAutoFilter();

        ws.Cell("A1").Style.Font.FontColor = XLColor.FromHtml("#64748B");
        ws.Cell("A1").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.Bold = true;
        ws.Cell("A2").Style.Font.FontSize = 18;
        ws.Cell("A3").Style.Font.FontColor = XLColor.FromHtml("#475569");

        ws.Column(1).Width = 8;
        ws.Column(2).Width = 16;
        ws.Column(3).Width = 18;
        ws.Column(4).Width = 32;
        ws.Column(5).Width = 30;
        ws.Column(6).Width = 36;
        ws.Column(7).Width = 24;
        ws.Column(8).Width = 24;
        ws.Column(9).Width = 28;
        ws.Column(10).Width = 16;
        ws.Column(11).Width = 14;
        ws.Column(12).Width = 16;
        ws.Column(13).Width = 14;
        ws.Column(14).Width = 18;
        ws.Column(3).Style.NumberFormat.Format = "@";
        ws.Range(firstDataRow, 10, Math.Max(row - 1, firstDataRow), 13).Style.NumberFormat.Format = "0";
        ws.Range(firstDataRow, 10, Math.Max(row - 1, firstDataRow), 13).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Range(firstDataRow, 1, Math.Max(row - 1, firstDataRow), 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Range(firstDataRow, 4, Math.Max(row - 1, firstDataRow), 9).Style.Alignment.WrapText = true;
        ws.Rows(firstDataRow, Math.Max(row - 1, firstDataRow)).Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
        ws.Rows(firstDataRow, Math.Max(row - 1, firstDataRow)).AdjustToContents();

        ws.SheetView.FreezeRows(tableHeaderRow);
        ws.SheetView.FreezeColumns(2);

        ws.PageSetup.PageOrientation = XLPageOrientation.Landscape;
        ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
        ws.PageSetup.Margins.Top = 0.4;
        ws.PageSetup.Margins.Bottom = 0.4;
        ws.PageSetup.Margins.Left = 0.3;
        ws.PageSetup.Margins.Right = 0.3;
        ws.PageSetup.FitToPages(1, 0);
        ws.PageSetup.CenterHorizontally = true;
        ws.PageSetup.SetRowsToRepeatAtTop(1, tableHeaderRow);

        ws.PageSetup.Header.Left.AddText("SMD");
        ws.PageSetup.Header.Center.AddText("Raporti i Inventarit");
        ws.PageSetup.Footer.Center.AddText("Gjeneruar nga SMD");
        ws.PageSetup.Footer.Right.AddText("Faqe &[Page] / &[Pages]");

        using var ms = new MemoryStream();
        wb.SaveAs(ms);

        await _audit.WriteAsync(
            "EXPORT_INVENTORY_EXCEL",
            "Inventory",
            "-",
            $"Rows={items.Count}, Search={query.Search ?? "-"}, WarehouseId={query.WarehouseId?.ToString() ?? "-"}, ZoneId={query.ZoneId?.ToString() ?? "-"}, RackId={query.RackId?.ToString() ?? "-"}, BinId={query.BinId?.ToString() ?? "-"}"
        );

        var fileName = BuildInventoryExportFileName(
            query,
            filterWarehouseCode,
            filterZoneCode,
            filterRackCode,
            filterBinCode
        );

        return (ms.ToArray(), fileName);
    }

    private static byte[] WriteCsv<T>(IEnumerable<T> rows)
    {
        using var ms = new MemoryStream();

        using var writer = new StreamWriter(
            ms,
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: true), // BOM për Excel
            leaveOpen: true
        );

        var config = new CsvHelper.Configuration.CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord = true,
            Delimiter = ";" // për Excel DE (Gjermani) rekomandohet ;
        };

        using (var csv = new CsvWriter(writer, config))
        {
            csv.WriteRecords(rows);
        }

        writer.Flush();
        return ms.ToArray();
    }

    private static string SanitizeFilePart(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";

        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(value
            .Trim()
            .Select(ch => invalid.Contains(ch) ? '_' : ch)
            .ToArray());

        cleaned = cleaned.Replace(" ", "-");

        while (cleaned.Contains("--"))
            cleaned = cleaned.Replace("--", "-");

        return cleaned.Length > 40 ? cleaned[..40] : cleaned;
    }

    private static string BuildInventoryExportFileName(
        InventoryExportQuery query,
        string? warehouseCode = null,
        string? zoneCode = null,
        string? rackCode = null,
        string? binCode = null)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(warehouseCode))
            parts.Add(SanitizeFilePart(warehouseCode));

        if (!string.IsNullOrWhiteSpace(zoneCode))
            parts.Add(SanitizeFilePart(zoneCode));

        if (!string.IsNullOrWhiteSpace(rackCode))
            parts.Add(SanitizeFilePart(rackCode));

        if (!string.IsNullOrWhiteSpace(binCode))
            parts.Add(SanitizeFilePart(binCode));

        if (parts.Count == 0 && !string.IsNullOrWhiteSpace(query.Search))
            parts.Add("Kerko-" + SanitizeFilePart(query.Search));

        if (parts.Count == 0)
            parts.Add("Komplet");

        var scope = string.Join("_", parts);
        var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");

        return $"Inventari_{scope}_{timestamp}.xlsx";
    }
}
