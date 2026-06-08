using System;
using System.Collections.Generic;
using System.Reflection.Emit;
using System.Text;
using SMD.Domain;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace SMD.Infrastructure.Persistence
{
    public class SmdDbContext : DbContext
    {
        public SmdDbContext(DbContextOptions<SmdDbContext> options)
            : base(options)
        {
        }

        // DbSets (Tabelat në DB)
        public DbSet<User> Users => Set<User>();
        public DbSet<Warehouse> Warehouses => Set<Warehouse>();
        public DbSet<Zone> Zones => Set<Zone>();
        public DbSet<Rack> Racks => Set<Rack>();
        public DbSet<Bin> Bins => Set<Bin>();
        public DbSet<Product> Products => Set<Product>();
        public DbSet<Customer> Customers => Set<Customer>();
        public DbSet<Supplier> Suppliers => Set<Supplier>();
        public DbSet<PartnerPayment> PartnerPayments => Set<PartnerPayment>();
        public DbSet<Inventory> Inventories => Set<Inventory>();
        public DbSet<StockMovement> StockMovements => Set<StockMovement>();
        public DbSet<CycleCount> CycleCounts => Set<CycleCount>();
        public DbSet<CycleCountLine> CycleCountLines => Set<CycleCountLine>();
        public DbSet<InboundDocument> InboundDocuments => Set<InboundDocument>();
        public DbSet<InboundDocumentLine> InboundDocumentLines => Set<InboundDocumentLine>();
        public DbSet<OutboundDocument> OutboundDocuments => Set<OutboundDocument>();
        public DbSet<OutboundDocumentLine> OutboundDocumentLines => Set<OutboundDocumentLine>();
        public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
        public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
        public DbSet<SalesOrder> SalesOrders => Set<SalesOrder>();
        public DbSet<SalesOrderLine> SalesOrderLines => Set<SalesOrderLine>();
        public DbSet<ReturnDocument> ReturnDocuments => Set<ReturnDocument>();
        public DbSet<ReturnDocumentLine> ReturnDocumentLines => Set<ReturnDocumentLine>();
        public DbSet<WarehouseTask> WarehouseTasks => Set<WarehouseTask>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User konfigurim
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(u => u.Id);

                entity.Property(u => u.Username)
                      .IsRequired()
                      .HasMaxLength(100);

                entity.Property(u => u.Email)
                      .IsRequired()
                      .HasMaxLength(150);

                entity.HasIndex(u => u.Email)
                      .IsUnique();

                entity.Property(u => u.PasswordHash)
                      .IsRequired();

                entity.Property(u => u.Role)
                      .IsRequired();
                
                entity.Property(u => u.IsActive)
                      .HasDefaultValue(true)
                      .IsRequired();
            });
            // Depo tabela
            modelBuilder.Entity<Warehouse>(entity =>
            {
                entity.Property(w => w.Code).IsRequired().HasMaxLength(50);
                entity.Property(w => w.Name).IsRequired().HasMaxLength(150);
                entity.Property(w => w.Address).HasMaxLength(250);
                entity.Property(w => w.City).HasMaxLength(100);
                entity.Property(w => w.Latitude).HasColumnType("decimal(9,6)");
                entity.Property(w => w.Longitude).HasColumnType("decimal(9,6)");

                entity.HasIndex(w => w.Code).IsUnique();
            });
            // Zona tabela
            modelBuilder.Entity<Zone>(entity =>
            {
                entity.Property(x => x.Code).IsRequired().HasMaxLength(50);
                entity.Property(x => x.Name).IsRequired().HasMaxLength(150);

                entity.HasOne(x => x.Warehouse)
                    .WithMany()
                    .HasForeignKey(x => x.WarehouseId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => new { x.WarehouseId, x.Code }).IsUnique();
            });
            // Rafti tabela
            modelBuilder.Entity<Rack>(entity =>
            {
                entity.Property(x => x.Code).IsRequired().HasMaxLength(50);
                entity.Property(x => x.Name).IsRequired().HasMaxLength(150);

                entity.HasOne(x => x.Zone)
                    .WithMany(z => z.Racks)
                    .HasForeignKey(x => x.ZoneId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => new { x.ZoneId, x.Code }).IsUnique();
            });
            // Shporta tabela
            modelBuilder.Entity<Bin>(entity =>
            {
                entity.Property(x => x.Code).IsRequired().HasMaxLength(50);
                entity.Property(x => x.Name).IsRequired().HasMaxLength(150);

                entity.HasOne(x => x.Rack)
                    .WithMany(r => r.Bins)
                    .HasForeignKey(x => x.RackId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => new { x.RackId, x.Code }).IsUnique();
            });
            // Produkti tabela
            modelBuilder.Entity<Product>(entity =>
            {
                entity.Property(p => p.Sku).IsRequired().HasMaxLength(80);
                entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
                entity.Property(p => p.Barcode).HasMaxLength(120);
                entity.Property(p => p.UnitOfMeasure).IsRequired().HasMaxLength(20);
                entity.Property(p => p.MinStockLevel).HasColumnType("decimal(18,2)").HasDefaultValue(5m);
                entity.Property(p => p.PurchasePrice).HasColumnType("decimal(18,2)").HasDefaultValue(0m);
                entity.Property(p => p.RetailPrice).HasColumnType("decimal(18,2)").HasDefaultValue(0m);
                entity.Property(p => p.WholesalePrice).HasColumnType("decimal(18,2)").HasDefaultValue(0m);
                entity.Property(p => p.VipPrice).HasColumnType("decimal(18,2)").HasDefaultValue(0m);
                entity.HasIndex(p => p.Sku).IsUnique();

                // Barcode unik vetëm nëse ekziston (SQL Server lejon multiple NULLs)
                entity.HasIndex(p => p.Barcode).IsUnique();
            });
            modelBuilder.Entity<Customer>(entity =>
            {
                entity.Property(x => x.Code).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Name).IsRequired().HasMaxLength(160);
                entity.Property(x => x.ContactPerson).HasMaxLength(120);
                entity.Property(x => x.Phone).HasMaxLength(40);
                entity.Property(x => x.Email).HasMaxLength(160);
                entity.Property(x => x.Address).HasMaxLength(250);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.Property(x => x.IsActive).HasDefaultValue(true).IsRequired();
                entity.HasIndex(x => x.Code).IsUnique();
            });
            modelBuilder.Entity<Supplier>(entity =>
            {
                entity.Property(x => x.Code).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Name).IsRequired().HasMaxLength(160);
                entity.Property(x => x.ContactPerson).HasMaxLength(120);
                entity.Property(x => x.Phone).HasMaxLength(40);
                entity.Property(x => x.Email).HasMaxLength(160);
                entity.Property(x => x.Address).HasMaxLength(250);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.Property(x => x.IsActive).HasDefaultValue(true).IsRequired();
                entity.HasIndex(x => x.Code).IsUnique();
            });
            modelBuilder.Entity<PartnerPayment>(entity =>
            {
                entity.ToTable("PartnerPayments");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.Amount).IsRequired().HasColumnType("decimal(18,2)");
                entity.Property(x => x.PaymentDate).IsRequired();
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);

                entity.HasOne(x => x.Customer)
                    .WithMany()
                    .HasForeignKey(x => x.CustomerId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.Supplier)
                    .WithMany()
                    .HasForeignKey(x => x.SupplierId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.InboundDocument)
                    .WithMany()
                    .HasForeignKey(x => x.InboundDocumentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.OutboundDocument)
                    .WithMany()
                    .HasForeignKey(x => x.OutboundDocumentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => x.CustomerId);
                entity.HasIndex(x => x.SupplierId);
                entity.HasIndex(x => x.InboundDocumentId);
                entity.HasIndex(x => x.OutboundDocumentId);
                entity.HasIndex(x => x.PaymentDate);
            });
            // Inventory tabela
            modelBuilder.Entity<Inventory>(entity =>
            {
                entity.Property(x => x.LotNumber).HasMaxLength(80);
                entity.Property(x => x.BatchNumber).HasMaxLength(80);
                entity.Property(x => x.QtyOnHand).HasColumnType("decimal(18,2)");
                entity.Property(x => x.QtyReserved).HasColumnType("decimal(18,2)");

                entity.HasOne(x => x.Bin)
                    .WithMany()
                    .HasForeignKey(x => x.BinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                // unik: një rresht inventory për çdo kombinim bin+produkt+lot/batch/skadence
                entity.HasIndex(x => new { x.BinId, x.ProductId, x.LotNumber, x.BatchNumber, x.ExpiryDate })
                    .IsUnique()
                    .HasFilter(null);
            });
            // StockMovement tabela
            modelBuilder.Entity<StockMovement>(entity =>
            {
                entity.Property(x => x.Type).IsRequired();
                entity.Property(x => x.Quantity).HasColumnType("decimal(18,2)");
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.FromBin)
                    .WithMany()
                    .HasForeignKey(x => x.FromBinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.ToBin)
                    .WithMany()
                    .HasForeignKey(x => x.ToBinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => x.ProductId);
                entity.HasIndex(x => x.Type);
                entity.HasIndex(x => x.CreatedAt);
            });
            // Cycle Count - numerimi periodik i inventarit
            modelBuilder.Entity<CycleCount>(entity =>
            {
                entity.ToTable("CycleCounts");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.CountNo).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Status).IsRequired().HasConversion<int>();
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);

                entity.HasIndex(x => x.CountNo).IsUnique();
                entity.HasIndex(x => x.Status);
                entity.HasIndex(x => x.CreatedAt);
                entity.HasIndex(x => x.BinId);
                entity.HasIndex(x => x.ProductId);

                entity.HasMany(x => x.Lines)
                    .WithOne(x => x.CycleCount)
                    .HasForeignKey(x => x.CycleCountId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<CycleCountLine>(entity =>
            {
                entity.ToTable("CycleCountLines");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.LotNumber).HasMaxLength(80);
                entity.Property(x => x.BatchNumber).HasMaxLength(80);
                entity.Property(x => x.ExpectedQty).IsRequired().HasColumnType("decimal(18,2)");
                entity.Property(x => x.ReservedQty).IsRequired().HasColumnType("decimal(18,2)");
                entity.Property(x => x.CountedQty).HasColumnType("decimal(18,2)");
                entity.Property(x => x.Note).HasMaxLength(500);

                entity.HasOne(x => x.Inventory)
                    .WithMany()
                    .HasForeignKey(x => x.InventoryId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.Bin)
                    .WithMany()
                    .HasForeignKey(x => x.BinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => x.CycleCountId);
                entity.HasIndex(x => x.InventoryId);
                entity.HasIndex(x => x.ProductId);
                entity.HasIndex(x => x.BinId);
            });
            // -----------------------------
            // InboundDocument - Dokumenti hyres
            // -----------------------------
            modelBuilder.Entity<InboundDocument>(entity =>
            {
                entity.ToTable("InboundDocuments");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.DocumentNo)
                    .IsRequired()
                    .HasMaxLength(40);

                entity.HasIndex(x => x.DocumentNo)
                    .IsUnique();

                entity.Property(x => x.Status)
                    .IsRequired()
                    .HasConversion<int>(); // enum -> int

                entity.Property(x => x.Reference)
                    .HasMaxLength(80);

                entity.Property(x => x.Note)
                    .HasMaxLength(500);

                entity.Property(x => x.RowVersion)
                    .IsRowVersion()
                    .IsConcurrencyToken();

                entity.HasOne(x => x.Supplier)
                    .WithMany()
                    .HasForeignKey(x => x.SupplierId)
                    .OnDelete(DeleteBehavior.Restrict);

                // 1 Document -> Many Lines
                entity.HasMany(x => x.Lines)
                    .WithOne(l => l.InboundDocument)
                    .HasForeignKey(l => l.InboundDocumentId)
                    .OnDelete(DeleteBehavior.Cascade); // fshi dokumentin -> fshihen lines
            });

            modelBuilder.Entity<InboundDocumentLine>(entity =>
            {
                entity.ToTable("InboundDocumentLines");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.LotNumber).HasMaxLength(80);
                entity.Property(x => x.BatchNumber).HasMaxLength(80);
                entity.Property(x => x.Quantity)
                    .IsRequired()
                    .HasColumnType("decimal(18,2)"); // mbështet edhe kg/metra, jo vetëm copë
                entity.Property(x => x.PurchasePrice)
                    .IsRequired()
                    .HasColumnType("decimal(18,2)")
                    .HasDefaultValue(0m);

                // FK -> Product (mos lejo te fshihet produkti nëse përdoret në dokument)
                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                // FK -> Bin (ToBin)
                entity.HasOne(x => x.ToBin)
                    .WithMany()
                    .HasForeignKey(x => x.ToBinId)
                    .OnDelete(DeleteBehavior.Restrict);

                // Performanca e indexeve (shumë të dobishme)
                entity.HasIndex(x => x.InboundDocumentId);
                entity.HasIndex(x => x.ProductId);
                entity.HasIndex(x => x.ToBinId);
            });
            // -----------------------------
            // OutboundDocument - Dokumenti dales
            // -----------------------------
            modelBuilder.Entity<OutboundDocument>(entity =>
            {
                entity.ToTable("OutboundDocuments");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.DocumentNo)
                    .IsRequired()
                    .HasMaxLength(40);

                entity.HasIndex(x => x.DocumentNo)
                    .IsUnique();

                entity.Property(x => x.Status)
                    .IsRequired()
                    .HasConversion<int>();

                entity.Property(x => x.PriceTier)
                    .IsRequired()
                    .HasConversion<int>()
                    .HasDefaultValue(OutboundPriceTier.Retail);

                entity.Property(x => x.Reference)
                    .HasMaxLength(80);

                entity.Property(x => x.Note)
                    .HasMaxLength(500);

                entity.Property(x => x.RowVersion)
                    .IsRowVersion()
                    .IsConcurrencyToken();

                entity.HasOne(x => x.Customer)
                    .WithMany()
                    .HasForeignKey(x => x.CustomerId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(x => x.Lines)
                    .WithOne(l => l.OutboundDocument)
                    .HasForeignKey(l => l.OutboundDocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<OutboundDocumentLine>(entity =>
            {
                entity.ToTable("OutboundDocumentLines");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.PriceTier)
                    .IsRequired()
                    .HasConversion<int>()
                    .HasDefaultValue(OutboundPriceTier.Retail);
                entity.Property(x => x.Quantity)
                    .IsRequired()
                    .HasColumnType("decimal(18,2)");
                entity.Property(x => x.ReservedQuantity)
                    .IsRequired()
                    .HasColumnType("decimal(18,2)")
                    .HasDefaultValue(0m);
                entity.Property(x => x.LotNumber).HasMaxLength(80);
                entity.Property(x => x.BatchNumber).HasMaxLength(80);

                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.FromBin)
                    .WithMany()
                    .HasForeignKey(x => x.FromBinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => x.OutboundDocumentId);
                entity.HasIndex(x => x.ProductId);
                entity.HasIndex(x => x.FromBinId);
            });

            modelBuilder.Entity<PurchaseOrder>(entity =>
            {
                entity.ToTable("PurchaseOrders");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.OrderNo).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Status).IsRequired().HasConversion<int>();
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.HasIndex(x => x.OrderNo).IsUnique();
                entity.HasIndex(x => x.Status);
                entity.HasIndex(x => x.SupplierId);
                entity.HasIndex(x => x.CreatedAt);

                entity.HasOne(x => x.Supplier)
                    .WithMany()
                    .HasForeignKey(x => x.SupplierId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.InboundDocument)
                    .WithMany()
                    .HasForeignKey(x => x.InboundDocumentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(x => x.Lines)
                    .WithOne(x => x.PurchaseOrder)
                    .HasForeignKey(x => x.PurchaseOrderId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<PurchaseOrderLine>(entity =>
            {
                entity.ToTable("PurchaseOrderLines");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.Quantity).IsRequired().HasColumnType("decimal(18,2)");
                entity.Property(x => x.UnitPrice).IsRequired().HasColumnType("decimal(18,2)");
                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasIndex(x => x.PurchaseOrderId);
                entity.HasIndex(x => x.ProductId);
            });

            modelBuilder.Entity<SalesOrder>(entity =>
            {
                entity.ToTable("SalesOrders");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.OrderNo).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Status).IsRequired().HasConversion<int>();
                entity.Property(x => x.PriceTier).IsRequired().HasConversion<int>();
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.HasIndex(x => x.OrderNo).IsUnique();
                entity.HasIndex(x => x.Status);
                entity.HasIndex(x => x.CustomerId);
                entity.HasIndex(x => x.CreatedAt);

                entity.HasOne(x => x.Customer)
                    .WithMany()
                    .HasForeignKey(x => x.CustomerId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.OutboundDocument)
                    .WithMany()
                    .HasForeignKey(x => x.OutboundDocumentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(x => x.Lines)
                    .WithOne(x => x.SalesOrder)
                    .HasForeignKey(x => x.SalesOrderId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<SalesOrderLine>(entity =>
            {
                entity.ToTable("SalesOrderLines");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.PriceTier).IsRequired().HasConversion<int>();
                entity.Property(x => x.LotNumber).HasMaxLength(80);
                entity.Property(x => x.BatchNumber).HasMaxLength(80);
                entity.Property(x => x.Quantity).IsRequired().HasColumnType("decimal(18,2)");
                entity.Property(x => x.ReservedQuantity).IsRequired().HasColumnType("decimal(18,2)");
                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(x => x.FromBin)
                    .WithMany()
                    .HasForeignKey(x => x.FromBinId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasIndex(x => x.SalesOrderId);
                entity.HasIndex(x => x.ProductId);
                entity.HasIndex(x => x.FromBinId);
            });

            modelBuilder.Entity<ReturnDocument>(entity =>
            {
                entity.ToTable("ReturnDocuments");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.DocumentNo).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Type).IsRequired().HasConversion<int>();
                entity.Property(x => x.Status).IsRequired().HasConversion<int>();
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.Property(x => x.RowVersion)
                    .IsRowVersion()
                    .IsConcurrencyToken();

                entity.HasIndex(x => x.DocumentNo).IsUnique();
                entity.HasIndex(x => x.Type);
                entity.HasIndex(x => x.Status);
                entity.HasIndex(x => x.CreatedAt);
                entity.HasIndex(x => x.CustomerId);
                entity.HasIndex(x => x.SupplierId);

                entity.HasOne(x => x.Customer)
                    .WithMany()
                    .HasForeignKey(x => x.CustomerId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.Supplier)
                    .WithMany()
                    .HasForeignKey(x => x.SupplierId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(x => x.Lines)
                    .WithOne(x => x.ReturnDocument)
                    .HasForeignKey(x => x.ReturnDocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ReturnDocumentLine>(entity =>
            {
                entity.ToTable("ReturnDocumentLines");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.LotNumber).HasMaxLength(80);
                entity.Property(x => x.BatchNumber).HasMaxLength(80);
                entity.Property(x => x.PriceTier)
                    .IsRequired()
                    .HasConversion<int>()
                    .HasDefaultValue(OutboundPriceTier.Retail);
                entity.Property(x => x.Quantity)
                    .IsRequired()
                    .HasColumnType("decimal(18,2)");

                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.Bin)
                    .WithMany()
                    .HasForeignKey(x => x.BinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(x => x.ReturnDocumentId);
                entity.HasIndex(x => x.ProductId);
                entity.HasIndex(x => x.BinId);
            });

            modelBuilder.Entity<WarehouseTask>(entity =>
            {
                entity.ToTable("WarehouseTasks");
                entity.HasKey(x => x.Id);
                entity.Property(x => x.TaskNo).IsRequired().HasMaxLength(40);
                entity.Property(x => x.Type).IsRequired().HasConversion<int>();
                entity.Property(x => x.Status).IsRequired().HasConversion<int>();
                entity.Property(x => x.Quantity).HasColumnType("decimal(18,2)");
                entity.Property(x => x.Reference).HasMaxLength(80);
                entity.Property(x => x.Note).HasMaxLength(500);
                entity.Property(x => x.HelpRequestNote).HasMaxLength(500);

                entity.HasIndex(x => x.TaskNo).IsUnique();
                entity.HasIndex(x => x.Status);
                entity.HasIndex(x => x.Type);
                entity.HasIndex(x => x.CreatedAt);
                entity.HasIndex(x => x.AssignedToUserId);
                entity.HasIndex(x => x.AssignedAt);
                entity.HasIndex(x => x.HelpRequestedAt);
                entity.HasIndex(x => x.HelpResolvedAt);
                entity.HasIndex(x => x.ProductId);

                entity.HasOne(x => x.Product)
                    .WithMany()
                    .HasForeignKey(x => x.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.FromBin)
                    .WithMany()
                    .HasForeignKey(x => x.FromBinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.ToBin)
                    .WithMany()
                    .HasForeignKey(x => x.ToBinId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(x => x.AssignedToUser)
                    .WithMany()
                    .HasForeignKey(x => x.AssignedToUserId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // Tabela për Audit Logs
            modelBuilder.Entity<AuditLog>(entity =>
            {
                entity.ToTable("AuditLogs");
                entity.Property(x => x.Action).IsRequired().HasMaxLength(80);
                entity.Property(x => x.Entity).IsRequired().HasMaxLength(80);
                entity.Property(x => x.EntityId).IsRequired().HasMaxLength(80);
                entity.Property(x => x.Details).HasMaxLength(2000);
                entity.Property(x => x.IpAddress).HasMaxLength(60);
                entity.HasIndex(x => x.CreatedAt);
                entity.HasIndex(x => x.UserId);
                entity.HasIndex(x => x.Action);
            });
            /*
            modelBuilder.Entity<DocumentSequence>(e =>
            {
                e.HasKey(x => x.Key);
                e.Property(x => x.Key).HasMaxLength(50);
            });

            // Seed fillestar i sequences
            modelBuilder.Entity<DocumentSequence>().HasData(
                new DocumentSequence { Key = "INBOUND", NextValue = 1 },
                new DocumentSequence { Key = "OUTBOUND", NextValue = 1 }
            );

            // Unique Index për DocumentNo (shumë i rëndësishëm)
            modelBuilder.Entity<InboundDocument>()
                .HasIndex(x => x.DocumentNo)
                .IsUnique();

            modelBuilder.Entity<OutboundDocument>()
                .HasIndex(x => x.DocumentNo)
                .IsUnique();
            */
        }
    }
}
