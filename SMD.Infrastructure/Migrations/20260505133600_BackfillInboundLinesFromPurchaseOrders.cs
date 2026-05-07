using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SMD.Infrastructure.Persistence;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(SmdDbContext))]
    [Migration("20260505133600_BackfillInboundLinesFromPurchaseOrders")]
    public partial class BackfillInboundLinesFromPurchaseOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                INSERT INTO InboundDocumentLines
                    (Id, InboundDocumentId, ProductId, ToBinId, LotNumber, BatchNumber, ExpiryDate, Quantity, CreatedAt, UpdatedAt)
                SELECT
                    NEWID(),
                    po.InboundDocumentId,
                    pol.ProductId,
                    NULL,
                    NULL,
                    NULL,
                    NULL,
                    pol.Quantity,
                    SYSUTCDATETIME(),
                    NULL
                FROM PurchaseOrderLines pol
                INNER JOIN PurchaseOrders po ON po.Id = pol.PurchaseOrderId
                WHERE po.InboundDocumentId IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM InboundDocumentLines il
                      WHERE il.InboundDocumentId = po.InboundDocumentId
                        AND il.ProductId = pol.ProductId
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE il
                FROM InboundDocumentLines il
                INNER JOIN PurchaseOrders po ON po.InboundDocumentId = il.InboundDocumentId
                WHERE il.ToBinId IS NULL
                  AND il.LotNumber IS NULL
                  AND il.BatchNumber IS NULL
                  AND il.ExpiryDate IS NULL;
                """);
        }
    }
}
