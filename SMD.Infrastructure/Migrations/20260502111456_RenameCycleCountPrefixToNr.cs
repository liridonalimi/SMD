using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameCycleCountPrefixToNr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE cc
                SET CountNo = CONCAT(N'NR-', SUBSTRING(cc.CountNo, 4, LEN(cc.CountNo)))
                FROM CycleCounts cc
                WHERE cc.CountNo LIKE N'CC-%'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM CycleCounts existing
                      WHERE existing.CountNo = CONCAT(N'NR-', SUBSTRING(cc.CountNo, 4, LEN(cc.CountNo)))
                  );
                """);

            migrationBuilder.Sql("""
                UPDATE StockMovements
                SET Reference = CONCAT(N'NR-', SUBSTRING(Reference, 4, LEN(Reference)))
                WHERE Reference LIKE N'CC-%';
                """);

            migrationBuilder.Sql("""
                UPDATE StockMovements
                SET Note = REPLACE(REPLACE(Note, N'Cycle Count CC-', N'Numerim inventari NR-'), N', sistem ', N', inventar ')
                WHERE Note LIKE N'Cycle Count CC-%';
                """);

            migrationBuilder.Sql("""
                UPDATE AuditLogs
                SET Details = REPLACE(Details, N'CountNo=CC-', N'CountNo=NR-')
                WHERE Details LIKE N'%CountNo=CC-%';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE cc
                SET CountNo = CONCAT(N'CC-', SUBSTRING(cc.CountNo, 4, LEN(cc.CountNo)))
                FROM CycleCounts cc
                WHERE cc.CountNo LIKE N'NR-%'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM CycleCounts existing
                      WHERE existing.CountNo = CONCAT(N'CC-', SUBSTRING(cc.CountNo, 4, LEN(cc.CountNo)))
                  );
                """);

            migrationBuilder.Sql("""
                UPDATE StockMovements
                SET Reference = CONCAT(N'CC-', SUBSTRING(Reference, 4, LEN(Reference)))
                WHERE Reference LIKE N'NR-%';
                """);

            migrationBuilder.Sql("""
                UPDATE StockMovements
                SET Note = REPLACE(REPLACE(Note, N'Numerim inventari NR-', N'Cycle Count CC-'), N', inventar ', N', sistem ')
                WHERE Note LIKE N'Numerim inventari NR-%';
                """);

            migrationBuilder.Sql("""
                UPDATE AuditLogs
                SET Details = REPLACE(Details, N'CountNo=NR-', N'CountNo=CC-')
                WHERE Details LIKE N'%CountNo=NR-%';
                """);
        }
    }
}
