export type ProductRecordDto = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  unitOfMeasure: string;
  minStockLevel: number;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  vipPrice: number;
  isActive: boolean;
};

export type ProductHistoryDto = {
  product: ProductRecordDto & {
    createdAt: string;
    updatedAt?: string | null;
  };
  summary: ProductHistorySummaryDto;
  inventoryRows: ProductHistoryInventoryRowDto[];
  movements: ProductHistoryMovementDto[];
  documents: ProductHistoryDocumentRowDto[];
};

export type ProductHistorySummaryDto = {
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  binCount: number;
  lotCount: number;
  expiredRows: number;
  nearExpiryRows: number;
  isBelowMinStock: boolean;
  lastMovementAt?: string | null;
};

export type ProductHistoryInventoryRowDto = {
  inventoryId: string;
  binId: string;
  binCode: string;
  binName: string;
  rackCode: string;
  zoneCode: string;
  warehouseCode: string;
  warehouseName: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  isExpired: boolean;
  isNearExpiry: boolean;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
  updatedAt?: string | null;
};

export type ProductHistoryMovementDto = {
  id: string;
  type: "IN" | "OUT" | "TRANSFER" | "ADJUST" | string;
  fromBinId?: string | null;
  fromBinCode?: string | null;
  fromBinName?: string | null;
  toBinId?: string | null;
  toBinCode?: string | null;
  toBinName?: string | null;
  quantity: number;
  quantityEffect: number;
  reference?: string | null;
  note?: string | null;
  performedByUserId?: string | null;
  createdAt: string;
};

export type ProductHistoryDocumentRowDto = {
  lineId: string;
  direction: "Pranim" | "Dalje" | string;
  documentType: "INBOUND" | "OUTBOUND" | string;
  documentId: string;
  documentNo: string;
  status: number | string;
  partnerCode?: string | null;
  partnerName?: string | null;
  reference?: string | null;
  note?: string | null;
  binId: string;
  binCode: string;
  binName: string;
  quantity: number;
  reservedQuantity?: number | null;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  createdAt: string;
};

export type UpsertProductDto = {
  sku: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  unitOfMeasure?: string | null;
  minStockLevel: number;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  vipPrice: number;
  isActive?: boolean;
};
