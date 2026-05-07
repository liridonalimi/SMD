using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundLineLotBatchExpiryFefo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BatchNumber",
                table: "OutboundDocumentLines",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryDate",
                table: "OutboundDocumentLines",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LotNumber",
                table: "OutboundDocumentLines",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BatchNumber",
                table: "OutboundDocumentLines");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "OutboundDocumentLines");

            migrationBuilder.DropColumn(
                name: "LotNumber",
                table: "OutboundDocumentLines");
        }
    }
}
