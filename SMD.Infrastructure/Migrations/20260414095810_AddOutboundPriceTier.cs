using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundPriceTier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PriceTier",
                table: "OutboundDocuments",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PriceTier",
                table: "OutboundDocuments");
        }
    }
}
