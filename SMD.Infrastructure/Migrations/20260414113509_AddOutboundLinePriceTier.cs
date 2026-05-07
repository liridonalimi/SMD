using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundLinePriceTier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PriceTier",
                table: "OutboundDocumentLines",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                UPDATE l
                SET l.PriceTier = d.PriceTier
                FROM dbo.OutboundDocumentLines l
                INNER JOIN dbo.OutboundDocuments d ON d.Id = l.OutboundDocumentId
            """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PriceTier",
                table: "OutboundDocumentLines");
        }
    }
}
