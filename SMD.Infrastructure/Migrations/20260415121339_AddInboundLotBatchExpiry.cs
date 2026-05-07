using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInboundLotBatchExpiry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Inventories_BinId_ProductId",
                table: "Inventories");

            migrationBuilder.AddColumn<string>(
                name: "BatchNumber",
                table: "Inventories",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryDate",
                table: "Inventories",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LotNumber",
                table: "Inventories",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BatchNumber",
                table: "InboundDocumentLines",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryDate",
                table: "InboundDocumentLines",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LotNumber",
                table: "InboundDocumentLines",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Inventories_BinId_ProductId_LotNumber_BatchNumber_ExpiryDate",
                table: "Inventories",
                columns: new[] { "BinId", "ProductId", "LotNumber", "BatchNumber", "ExpiryDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Inventories_BinId_ProductId_LotNumber_BatchNumber_ExpiryDate",
                table: "Inventories");

            migrationBuilder.DropColumn(
                name: "BatchNumber",
                table: "Inventories");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "Inventories");

            migrationBuilder.DropColumn(
                name: "LotNumber",
                table: "Inventories");

            migrationBuilder.DropColumn(
                name: "BatchNumber",
                table: "InboundDocumentLines");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "InboundDocumentLines");

            migrationBuilder.DropColumn(
                name: "LotNumber",
                table: "InboundDocumentLines");

            migrationBuilder.CreateIndex(
                name: "IX_Inventories_BinId_ProductId",
                table: "Inventories",
                columns: new[] { "BinId", "ProductId" },
                unique: true);
        }
    }
}
