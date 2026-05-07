using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundLineReservedQuantity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ReservedQuantity",
                table: "OutboundDocumentLines",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql(@"
UPDATE l
SET ReservedQuantity = l.Quantity
FROM OutboundDocumentLines l
INNER JOIN OutboundDocuments d ON d.Id = l.OutboundDocumentId
INNER JOIN Inventories i
    ON i.BinId = l.FromBinId
    AND i.ProductId = l.ProductId
    AND ((i.LotNumber = l.LotNumber) OR (i.LotNumber IS NULL AND l.LotNumber IS NULL))
    AND ((i.BatchNumber = l.BatchNumber) OR (i.BatchNumber IS NULL AND l.BatchNumber IS NULL))
    AND ((i.ExpiryDate = l.ExpiryDate) OR (i.ExpiryDate IS NULL AND l.ExpiryDate IS NULL))
INNER JOIN (
    SELECT
        l.FromBinId,
        l.ProductId,
        l.LotNumber,
        l.BatchNumber,
        l.ExpiryDate,
        SUM(l.Quantity) AS Quantity
    FROM OutboundDocumentLines l
    INNER JOIN OutboundDocuments d ON d.Id = l.OutboundDocumentId
    WHERE d.Status = 0
    GROUP BY l.FromBinId, l.ProductId, l.LotNumber, l.BatchNumber, l.ExpiryDate
) r
    ON r.FromBinId = l.FromBinId
    AND r.ProductId = l.ProductId
    AND ((r.LotNumber = l.LotNumber) OR (r.LotNumber IS NULL AND l.LotNumber IS NULL))
    AND ((r.BatchNumber = l.BatchNumber) OR (r.BatchNumber IS NULL AND l.BatchNumber IS NULL))
    AND ((r.ExpiryDate = l.ExpiryDate) OR (r.ExpiryDate IS NULL AND l.ExpiryDate IS NULL))
WHERE d.Status = 0
    AND (i.QtyOnHand - i.QtyReserved) >= r.Quantity;
");

            migrationBuilder.Sql(@"
UPDATE i
SET
    QtyReserved = i.QtyReserved + r.Quantity,
    UpdatedAt = SYSUTCDATETIME()
FROM Inventories i
INNER JOIN (
    SELECT
        l.FromBinId,
        l.ProductId,
        l.LotNumber,
        l.BatchNumber,
        l.ExpiryDate,
        SUM(l.ReservedQuantity) AS Quantity
    FROM OutboundDocumentLines l
    INNER JOIN OutboundDocuments d ON d.Id = l.OutboundDocumentId
    WHERE d.Status = 0
    GROUP BY l.FromBinId, l.ProductId, l.LotNumber, l.BatchNumber, l.ExpiryDate
) r
    ON i.BinId = r.FromBinId
    AND i.ProductId = r.ProductId
    AND ((i.LotNumber = r.LotNumber) OR (i.LotNumber IS NULL AND r.LotNumber IS NULL))
    AND ((i.BatchNumber = r.BatchNumber) OR (i.BatchNumber IS NULL AND r.BatchNumber IS NULL))
    AND ((i.ExpiryDate = r.ExpiryDate) OR (i.ExpiryDate IS NULL AND r.ExpiryDate IS NULL))
WHERE r.Quantity > 0;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
UPDATE i
SET
    QtyReserved = CASE
        WHEN i.QtyReserved >= r.Quantity THEN i.QtyReserved - r.Quantity
        ELSE 0
    END,
    UpdatedAt = SYSUTCDATETIME()
FROM Inventories i
INNER JOIN (
    SELECT
        l.FromBinId,
        l.ProductId,
        l.LotNumber,
        l.BatchNumber,
        l.ExpiryDate,
        SUM(l.ReservedQuantity) AS Quantity
    FROM OutboundDocumentLines l
    INNER JOIN OutboundDocuments d ON d.Id = l.OutboundDocumentId
    WHERE d.Status = 0
    GROUP BY l.FromBinId, l.ProductId, l.LotNumber, l.BatchNumber, l.ExpiryDate
) r
    ON i.BinId = r.FromBinId
    AND i.ProductId = r.ProductId
    AND ((i.LotNumber = r.LotNumber) OR (i.LotNumber IS NULL AND r.LotNumber IS NULL))
    AND ((i.BatchNumber = r.BatchNumber) OR (i.BatchNumber IS NULL AND r.BatchNumber IS NULL))
    AND ((i.ExpiryDate = r.ExpiryDate) OR (i.ExpiryDate IS NULL AND r.ExpiryDate IS NULL))
WHERE r.Quantity > 0;
");

            migrationBuilder.DropColumn(
                name: "ReservedQuantity",
                table: "OutboundDocumentLines");
        }
    }
}
