export type OrderStatus = "Draft" | "Confirmed" | "Fulfilled" | "Cancelled";

export type OrderListItem = {
  id: string;
  orderNo: string;
  status: OrderStatus | string;
  partnerId?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
  lineCount: number;
  total: number;
  linkedDocumentId?: string | null;
};

export type PurchaseOrderDetails = {
  id: string;
  orderNo: string;
  status: OrderStatus | string;
  supplierId?: string | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  reference?: string | null;
  note?: string | null;
  expectedDate?: string | null;
  createdAt: string;
  inboundDocumentId?: string | null;
  lines: PurchaseOrderLine[];
};

export type PurchaseOrderLine = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SalesOrderDetails = {
  id: string;
  orderNo: string;
  status: OrderStatus | string;
  priceTier: number;
  customerId?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  reference?: string | null;
  note?: string | null;
  requestedDate?: string | null;
  createdAt: string;
  outboundDocumentId?: string | null;
  lines: SalesOrderLine[];
};

export type SalesOrderLine = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  fromBinId: string;
  fromBinCode: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  priceTier: number;
  quantity: number;
  reservedQuantity: number;
  unitPrice: number;
  lineTotal: number;
};
