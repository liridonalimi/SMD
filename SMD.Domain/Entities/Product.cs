using SMD.Domain.Common;

namespace SMD.Domain.Entities;

public class Product : BaseEntity
{
    public string Sku { get; set; } = null!;          // unik, p.sh. SKU-0001
    public string Name { get; set; } = null!;         // emri i produktit
    public string? Barcode { get; set; }              // opsional
    public string? Description { get; set; }          // opsional
    public string UnitOfMeasure { get; set; } = "pcs"; // p.sh. pcs, kg, m
    public decimal MinStockLevel { get; set; } = 5;
    public decimal PurchasePrice { get; set; }
    public decimal RetailPrice { get; set; }
    public decimal WholesalePrice { get; set; }
    public decimal VipPrice { get; set; }
    public bool IsActive { get; set; } = true;
}
