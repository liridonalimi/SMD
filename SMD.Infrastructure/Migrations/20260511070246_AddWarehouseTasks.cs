using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WarehouseTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskNo = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FromBinId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ToBinId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    AssignedToUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Reference = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WarehouseTasks_Bins_FromBinId",
                        column: x => x.FromBinId,
                        principalTable: "Bins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseTasks_Bins_ToBinId",
                        column: x => x.ToBinId,
                        principalTable: "Bins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseTasks_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseTasks_Users_AssignedToUserId",
                        column: x => x.AssignedToUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_AssignedToUserId",
                table: "WarehouseTasks",
                column: "AssignedToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_CreatedAt",
                table: "WarehouseTasks",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_FromBinId",
                table: "WarehouseTasks",
                column: "FromBinId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_ProductId",
                table: "WarehouseTasks",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_Status",
                table: "WarehouseTasks",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_TaskNo",
                table: "WarehouseTasks",
                column: "TaskNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_ToBinId",
                table: "WarehouseTasks",
                column: "ToBinId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_Type",
                table: "WarehouseTasks",
                column: "Type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WarehouseTasks");
        }
    }
}
