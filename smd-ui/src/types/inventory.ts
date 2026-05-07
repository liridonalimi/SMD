export type SortDir = "asc" | "desc";
export type InventoryExpiryFilter = "" | "expired" | "nearExpiry" | "noExpiry";

export type InventorySortBy =
    | "sku"
    | "name"
    | "qty"
    | "available"
    | "warehouse"
    | "bin";

export interface InventoryListQuery {
    page?: number;
    pageSize?: number;

    search?: string;
    warehouseId?: string;
    zoneId?: string;
    rackId?: string;
    binId?: string;
    productId?: string;

    onlyInStock?: boolean;
    onlyOutOfStock?: boolean;
    onlyBelowMinStock?: boolean;
    expiryFilter?: InventoryExpiryFilter;
    lowStockThreshold?: number;

    sortBy?: InventorySortBy;
    sortDir?: SortDir;
}

export interface InventoryListItemDto {
    inventoryId: string;

    productId: string;
    productSku: string;
    productName: string;
    productBarcode: string;
    productDescription: string;
    productUnitOfMeasure: string;
    productMinStockLevel: number;
    isBelowMinStock: boolean;

    binId: string;
    binCode: string;
    binName: string;

    rackId: string;
    rackCode: string;
    rackName: string;

    zoneId: string;
    zoneCode: string;
    zoneName: string;

    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    warehouseAddress: string;

    lotNumber?: string | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    isExpired: boolean;
    isNearExpiry: boolean;

    qtyOnHand: number;
    qtyReserved: number;
    qtyAvailable: number;
}

export interface InventorySummaryDto {
    totalProducts: number;
    totalQtyOnHand: number;
    totalQtyReserved: number;
    totalQtyAvailable: number;
    productsInStock: number;
    productsOutOfStock: number;
    lowStockProducts: number;
}

export interface InventoryProductStockAlertDto {
    productId: string;
    sku: string;
    name: string;
    barcode: string;
    qtyOnHand: number;
    qtyReserved: number;
    qtyAvailable: number;
    minStockLevel: number;
    missingToMinStock: number;
    hasInventoryRows: boolean;
}

export interface InventoryStockAlertsDto {
    productsOutOfStock: number;
    lowStockProducts: number;
    outOfStockItems: InventoryProductStockAlertDto[];
    lowStockItems: InventoryProductStockAlertDto[];
}

export interface WarehouseStockPoint {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    qtyOnHand: number;
    qtyReserved: number;
    qtyAvailable: number;
}

export interface ProductPoint {
    productId: string;
    sku: string;
    name: string;
    value: number;
}

export interface InventoryChartsDto {
    stockByWarehouse: WarehouseStockPoint[];
    lowStockTop: ProductPoint[];
    outOfStockTop: ProductPoint[];
    topMovers30d: ProductPoint[];
}

export interface InventoryExpiryItemDto {
    inventoryId: string;
    productId: string;
    productSku: string;
    productName: string;
    binCode: string;
    warehouseCode: string;
    lotNumber?: string | null;
    batchNumber?: string | null;
    expiryDate: string;
    qtyAvailable: number;
}

export interface InventoryExpiryReportDto {
    expiredCount: number;
    expiringIn7DaysCount: number;
    expiringIn30DaysCount: number;
    expiredItems: InventoryExpiryItemDto[];
    expiringIn7DaysItems: InventoryExpiryItemDto[];
    expiringIn30DaysItems: InventoryExpiryItemDto[];
}

export interface PagedInventoryResponse {
    total: number;
    page: number;
    pageSize: number;
    data: InventoryListItemDto[];
}
