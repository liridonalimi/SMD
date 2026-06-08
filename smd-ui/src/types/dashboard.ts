export type AuditLogItem = {
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  ipAddress?: string | null;
  details?: string | null;
};

export type DashboardExpiryAlertItem = {
  inventoryId: string;
  productCode: string;
  productName: string;
  warehouseName: string;
  binCode: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate: string;
  availableQty: number;
  isExpired: boolean;
};

export type DashboardLowStockAlertItem = {
  productId: string;
  productCode: string;
  productName: string;
  availableQty: number;
  minStockLevel: number;
  isOutOfStock: boolean;
};

export type DashboardPartnerBalanceAlertItem = {
  partnerId: string;
  partnerType: "customer" | "supplier" | string;
  partnerCode: string;
  partnerName: string;
  balance: number;
  lastPaymentDate?: string | null;
};

export type DashboardPaymentAlertItem = {
  documentId: string;
  documentType: "inbound" | "outbound" | string;
  documentNo: string;
  partnerCode?: string | null;
  partnerName?: string | null;
  balance: number;
  paymentStatus: string;
  createdAt: string;
};

export type DashboardWarehouseTaskAlertItem = {
  taskId: string;
  taskNo: string;
  type: string;
  status: string;
  productCode?: string | null;
  productName?: string | null;
  fromBinCode?: string | null;
  toBinCode?: string | null;
  quantity?: number | null;
  assignedToUsername?: string | null;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
  isUnassigned: boolean;
  isStale: boolean;
};

export type DashboardSummary = {
  inboundTodayCount: number;
  outboundTodayCount: number;
  pendingDraftsCount: number;
  totalProducts: number;
  totalBins: number;
  expiredInventoryCount: number;
  nearExpiryInventoryCount: number;
  outOfStockProductsCount: number;
  lowStockProductsCount: number;
  unpaidDocumentsCount: number;
  openWarehouseTasksCount: number;
  unassignedWarehouseTasksCount: number;
  staleWarehouseTasksCount: number;
  customerDebtTotal: number;
  supplierPayableTotal: number;
  latestAuditLogs: AuditLogItem[];
  expiryAlerts: DashboardExpiryAlertItem[];
  lowStockAlerts: DashboardLowStockAlertItem[];
  topCustomerDebtors: DashboardPartnerBalanceAlertItem[];
  topSupplierPayables: DashboardPartnerBalanceAlertItem[];
  paymentAlerts: DashboardPaymentAlertItem[];
  warehouseTaskAlerts: DashboardWarehouseTaskAlertItem[];
};
