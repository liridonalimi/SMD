using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseTaskHelpRequest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HelpRequestNote",
                table: "WarehouseTasks",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "HelpRequestedAt",
                table: "WarehouseTasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "HelpResolvedAt",
                table: "WarehouseTasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_HelpRequestedAt",
                table: "WarehouseTasks",
                column: "HelpRequestedAt");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseTasks_HelpResolvedAt",
                table: "WarehouseTasks",
                column: "HelpResolvedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WarehouseTasks_HelpRequestedAt",
                table: "WarehouseTasks");

            migrationBuilder.DropIndex(
                name: "IX_WarehouseTasks_HelpResolvedAt",
                table: "WarehouseTasks");

            migrationBuilder.DropColumn(
                name: "HelpRequestNote",
                table: "WarehouseTasks");

            migrationBuilder.DropColumn(
                name: "HelpRequestedAt",
                table: "WarehouseTasks");

            migrationBuilder.DropColumn(
                name: "HelpResolvedAt",
                table: "WarehouseTasks");
        }
    }
}
