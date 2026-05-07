import type { DocumentStatus, OutboundPriceTier } from "./documents";

export type ReturnDocumentType = 1 | 2; // CustomerReturn=1, SupplierReturn=2

export type ReturnListItem = {
  id: string;
  documentNo: string;
  type: ReturnDocumentType;
  status: DocumentStatus;
  partnerId?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  linesCount: number;
  documentTotal: number;
};

export type ReturnDetails = {
  id: string;
  documentNo: string;
  type: ReturnDocumentType;
  status: DocumentStatus;
  customerId?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  supplierId?: string | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  documentTotal: number;
  lines: ReturnLine[];
};

export type ReturnLine = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  productBarcode?: string | null;
  productDescription?: string | null;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  vipPrice: number;
  priceTier: OutboundPriceTier;
  binId: string;
  binCode: string;
  binName: string;
  rackCode: string;
  zoneCode: string;
  warehouseCode: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  lineTotal: number;
};

export type CreateReturnDraftBody = {
  type: ReturnDocumentType;
  customerId?: string | null;
  supplierId?: string | null;
  reference?: string | null;
  note?: string | null;
};

export type AddReturnLineBody = {
  productId: string;
  binId: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  priceTier?: OutboundPriceTier | null;
  quantity: number;
};

export type ReturnDraftResponse = {
  id: string;
  documentNo: string;
  status: DocumentStatus;
};
