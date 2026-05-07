using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReturnDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReturnDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentNo = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupplierId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Reference = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReturnDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReturnDocuments_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReturnDocuments_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReturnDocumentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReturnDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BinId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LotNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    BatchNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PriceTier = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReturnDocumentLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReturnDocumentLines_Bins_BinId",
                        column: x => x.BinId,
                        principalTable: "Bins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReturnDocumentLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReturnDocumentLines_ReturnDocuments_ReturnDocumentId",
                        column: x => x.ReturnDocumentId,
                        principalTable: "ReturnDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocumentLines_BinId",
                table: "ReturnDocumentLines",
                column: "BinId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocumentLines_ProductId",
                table: "ReturnDocumentLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocumentLines_ReturnDocumentId",
                table: "ReturnDocumentLines",
                column: "ReturnDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocuments_CreatedAt",
                table: "ReturnDocuments",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocuments_CustomerId",
                table: "ReturnDocuments",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocuments_DocumentNo",
                table: "ReturnDocuments",
                column: "DocumentNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocuments_Status",
                table: "ReturnDocuments",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocuments_SupplierId",
                table: "ReturnDocuments",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDocuments_Type",
                table: "ReturnDocuments",
                column: "Type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReturnDocumentLines");

            migrationBuilder.DropTable(
                name: "ReturnDocuments");
        }
    }
}
