using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FinalizeProductMinStockLevel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[DocumentSequences]', N'U') IS NOT NULL
                BEGIN
                    DROP TABLE [DocumentSequences];
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DocumentSequences",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    NextValue = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentSequences", x => x.Key);
                });

            migrationBuilder.InsertData(
                table: "DocumentSequences",
                columns: new[] { "Key", "NextValue" },
                values: new object[,]
                {
                    { "INBOUND", 1L },
                    { "OUTBOUND", 1L }
                });
        }
    }
}
