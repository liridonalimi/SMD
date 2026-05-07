using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentsLayer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InboundDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentNo = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundDocuments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OutboundDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentNo = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundDocuments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InboundDocumentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InboundDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToBinId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundDocumentLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InboundDocumentLines_Bins_ToBinId",
                        column: x => x.ToBinId,
                        principalTable: "Bins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundDocumentLines_InboundDocuments_InboundDocumentId",
                        column: x => x.InboundDocumentId,
                        principalTable: "InboundDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InboundDocumentLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundDocumentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OutboundDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromBinId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundDocumentLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundDocumentLines_Bins_FromBinId",
                        column: x => x.FromBinId,
                        principalTable: "Bins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundDocumentLines_OutboundDocuments_OutboundDocumentId",
                        column: x => x.OutboundDocumentId,
                        principalTable: "OutboundDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundDocumentLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InboundDocumentLines_InboundDocumentId",
                table: "InboundDocumentLines",
                column: "InboundDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundDocumentLines_ProductId",
                table: "InboundDocumentLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundDocumentLines_ToBinId",
                table: "InboundDocumentLines",
                column: "ToBinId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundDocuments_DocumentNo",
                table: "InboundDocuments",
                column: "DocumentNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboundDocumentLines_FromBinId",
                table: "OutboundDocumentLines",
                column: "FromBinId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundDocumentLines_OutboundDocumentId",
                table: "OutboundDocumentLines",
                column: "OutboundDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundDocumentLines_ProductId",
                table: "OutboundDocumentLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundDocuments_DocumentNo",
                table: "OutboundDocuments",
                column: "DocumentNo",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InboundDocumentLines");

            migrationBuilder.DropTable(
                name: "OutboundDocumentLines");

            migrationBuilder.DropTable(
                name: "InboundDocuments");

            migrationBuilder.DropTable(
                name: "OutboundDocuments");
        }
    }
}
