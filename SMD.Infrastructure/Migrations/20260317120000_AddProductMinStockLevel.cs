using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SMD.Infrastructure.Persistence;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    [DbContext(typeof(SmdDbContext))]
    [Migration("20260317120000_AddProductMinStockLevel")]
    public partial class AddProductMinStockLevel : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "MinStockLevel",
                table: "Products",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 5m);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MinStockLevel",
                table: "Products");
        }
    }
}
