export type PartnerBalanceItemDto = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  documentTotal: number;
  paidTotal: number;
  balance: number;
  lastPaymentDate?: string | null;
};

export type PartnerFinanceSummaryDto = {
  customerDocumentTotal: number;
  customerPaidTotal: number;
  customerBalanceTotal: number;
  supplierDocumentTotal: number;
  supplierPaidTotal: number;
  supplierBalanceTotal: number;
};

export type PartnerFinanceBalancesDto = {
  customers: PartnerBalanceItemDto[];
  suppliers: PartnerBalanceItemDto[];
  summary: PartnerFinanceSummaryDto;
};

export type PartnerPaymentRecordDto = {
  id: string;
  customerId?: string | null;
  supplierId?: string | null;
  inboundDocumentId?: string | null;
  outboundDocumentId?: string | null;
  partnerType: "customer" | "supplier";
  partnerCode: string;
  partnerName: string;
  amount: number;
  paymentDate: string;
  documentNo?: string | null;
  reference?: string | null;
  note?: string | null;
};

export type PartnerDocumentOptionDto = {
  id: string;
  documentType: "inbound" | "outbound";
  documentNo: string;
  createdAt: string;
  documentTotal: number;
  paidTotal: number;
  balance: number;
  paymentStatus: string;
};

export type UnpaidDocumentReportItemDto = {
  documentId: string;
  documentType: "inbound" | "outbound";
  documentNo: string;
  partnerCode: string;
  partnerName: string;
  createdAt: string;
  documentTotal: number;
  paidTotal: number;
  balance: number;
  paymentStatus: string;
};

export type CreatePartnerPaymentDto = {
  customerId?: string | null;
  supplierId?: string | null;
  inboundDocumentId?: string | null;
  outboundDocumentId?: string | null;
  amount: number;
  paymentDate?: string | null;
  reference?: string | null;
  note?: string | null;
};
