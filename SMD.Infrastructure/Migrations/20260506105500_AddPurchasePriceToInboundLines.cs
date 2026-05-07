using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SMD.Infrastructure.Persistence;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    [DbContext(typeof(SmdDbContext))]
    [Migration("20260506105500_AddPurchasePriceToInboundLines")]
    public partial class AddPurchasePriceToInboundLines : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PurchasePrice",
                table: "InboundDocumentLines",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql("""
                UPDATE il
                SET PurchasePrice = COALESCE(pol.UnitPrice, p.PurchasePrice, 0)
                FROM InboundDocumentLines il
                INNER JOIN InboundDocuments idoc ON idoc.Id = il.InboundDocumentId
                INNER JOIN Products p ON p.Id = il.ProductId
                OUTER APPLY (
                    SELECT TOP 1 pol.UnitPrice
                    FROM PurchaseOrders po
                    INNER JOIN PurchaseOrderLines pol ON pol.PurchaseOrderId = po.Id
                    WHERE po.InboundDocumentId = idoc.Id
                      AND pol.ProductId = il.ProductId
                    ORDER BY pol.CreatedAt DESC
                ) pol
                WHERE il.PurchasePrice = 0;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PurchasePrice",
                table: "InboundDocumentLines");
        }
    }
}
