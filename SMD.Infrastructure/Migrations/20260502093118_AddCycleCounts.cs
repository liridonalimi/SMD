using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCycleCounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CycleCounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CountNo = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    WarehouseId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ZoneId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RackId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BinId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CycleCountLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CycleCountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InventoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BinId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LotNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    BatchNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ExpectedQty = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ReservedQty = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CountedQty = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCountLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CycleCountLines_Bins_BinId",
                        column: x => x.BinId,
                        principalTable: "Bins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountLines_CycleCounts_CycleCountId",
                        column: x => x.CycleCountId,
                        principalTable: "CycleCounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CycleCountLines_Inventories_InventoryId",
                        column: x => x.InventoryId,
                        principalTable: "Inventories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountLines_BinId",
                table: "CycleCountLines",
                column: "BinId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountLines_CycleCountId",
                table: "CycleCountLines",
                column: "CycleCountId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountLines_InventoryId",
                table: "CycleCountLines",
                column: "InventoryId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountLines_ProductId",
                table: "CycleCountLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCounts_BinId",
                table: "CycleCounts",
                column: "BinId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCounts_CountNo",
                table: "CycleCounts",
                column: "CountNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CycleCounts_CreatedAt",
                table: "CycleCounts",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCounts_ProductId",
                table: "CycleCounts",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCounts_Status",
                table: "CycleCounts",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CycleCountLines");

            migrationBuilder.DropTable(
                name: "CycleCounts");
        }
    }
}
