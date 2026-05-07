using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SMD.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LinkPartnerPaymentsToDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "InboundDocumentId",
                table: "PartnerPayments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OutboundDocumentId",
                table: "PartnerPayments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PartnerPayments_InboundDocumentId",
                table: "PartnerPayments",
                column: "InboundDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_PartnerPayments_OutboundDocumentId",
                table: "PartnerPayments",
                column: "OutboundDocumentId");

            migrationBuilder.AddForeignKey(
                name: "FK_PartnerPayments_InboundDocuments_InboundDocumentId",
                table: "PartnerPayments",
                column: "InboundDocumentId",
                principalTable: "InboundDocuments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PartnerPayments_OutboundDocuments_OutboundDocumentId",
                table: "PartnerPayments",
                column: "OutboundDocumentId",
                principalTable: "OutboundDocuments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PartnerPayments_InboundDocuments_InboundDocumentId",
                table: "PartnerPayments");

            migrationBuilder.DropForeignKey(
                name: "FK_PartnerPayments_OutboundDocuments_OutboundDocumentId",
                table: "PartnerPayments");

            migrationBuilder.DropIndex(
                name: "IX_PartnerPayments_InboundDocumentId",
                table: "PartnerPayments");

            migrationBuilder.DropIndex(
                name: "IX_PartnerPayments_OutboundDocumentId",
                table: "PartnerPayments");

            migrationBuilder.DropColumn(
                name: "InboundDocumentId",
                table: "PartnerPayments");

            migrationBuilder.DropColumn(
                name: "OutboundDocumentId",
                table: "PartnerPayments");
        }
    }
}
