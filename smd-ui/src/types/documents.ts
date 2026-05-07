export type DocumentStatus = 0 | 1 | 2; // Draft=0, Confirmed=1, Cancelled=2

export type OutboundPriceTier = 0 | 1 | 2; // Retail, Wholesale, Vip

export type DocumentListItem = {
  id: string;
  documentNo: string;
  status: DocumentStatus;
  partnerId?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
  reference?: string | null;
  note?: string | null;
  linesCount: number;
  createdAt?: string; // nëse e kthen API
  updatedAt?: string | null;
  documentTotal: number;
  paidTotal: number;
  balance: number;
  paymentStatus: string;
};

export type DocumentPaymentHistoryItem = {
  id: string;
  amount: number;
  paymentDate: string;
  reference?: string | null;
  note?: string | null;
};

export type InboundListSummary = {
  totalDocuments: number;
  draftCount: number;
  confirmedCount: number;
  cancelledCount: number;
  emptyDocumentsCount: number;
  attentionCount: number;
};

export type OutboundListSummary = {
  totalDocuments: number;
  draftCount: number;
  confirmedCount: number;
  cancelledCount: number;
  emptyDocumentsCount: number;
  attentionCount: number;
};

export type InboundLine = {
  id: string;
  productId: string;
  productSku?: string;
  productName?: string;
  toBinId?: string | null;
    toBinCode?: string;
    toBinName: string;
    quantity: number;
    //productBarcode?: string | null;
    //productDescription?: string | null;
};

export type OutboundLine = {
  id: string;
  productId: string;
  productSku?: string;
  productName?: string;
  productBarcode?: string | null;
  productDescription?: string | null;
  priceTier: OutboundPriceTier;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  vipPrice: number;
  fromBinId: string;
  fromBinCode?: string;
  fromBinName?: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  reservedQuantity: number;
};

export type InboundDetailsDto = {
    id: string;
    documentNo: string;
    status: DocumentStatus;
    supplierId?: string | null;
    supplierCode?: string | null;
    supplierName?: string | null;
    reference?: string | null;
    note?: string | null;
    createdAt?: string;
    updatedAt?: string | null;
    documentTotal: number;
    paidTotal: number;
    balance: number;
    paymentStatus: string;
    paymentHistory: DocumentPaymentHistoryItem[];
    lines: InboundLineDetailsDto[];
};

export type InboundLineDetailsDto = {
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
    toBinId?: string | null;
    toBinCode?: string | null;
    toBinName?: string | null;
    lotNumber?: string | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    quantity: number;
}

export type OutboundDetailsDto = {
  id: string;
  documentNo: string;
  status: DocumentStatus;
  customerId?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  reference?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
  documentTotal: number;
  paidTotal: number;
  balance: number;
  paymentStatus: string;
  paymentHistory: DocumentPaymentHistoryItem[];
  lines: OutboundLine[];
};

export type DecrementLineResponse = {
    lineId: string;
    quantityAfter: number;
    isDeleted: boolean;
};

export type DraftDocumentResponse = {
  id: string;
  documentNo: string;
  status: DocumentStatus;
};
