import { http } from "./http";
import type {
  CreatePartnerPaymentDto,
  PartnerFinanceBalancesDto,
  PartnerDocumentOptionDto,
  PartnerPaymentRecordDto,
  UnpaidDocumentReportItemDto,
} from "../types/finance";

export function getPartnerBalances(q?: string, signal?: AbortSignal) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return http<PartnerFinanceBalancesDto>(`/api/partner-finance/balances${qs}`, { signal });
}

export function listPartnerPayments(q?: string, signal?: AbortSignal) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return http<PartnerPaymentRecordDto[]>(`/api/partner-finance/payments${qs}`, { signal });
}

export function listUnpaidDocuments(q?: string, partnerType = "all", signal?: AbortSignal) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (partnerType) qs.set("partnerType", partnerType);
  return http<UnpaidDocumentReportItemDto[]>(`/api/partner-finance/unpaid-documents?${qs.toString()}`, { signal });
}

export function unpaidDocumentsExportUrl(q?: string, partnerType = "all") {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (partnerType) qs.set("partnerType", partnerType);
  return `/api/partner-finance/unpaid-documents/export?${qs.toString()}`;
}

export function unpaidDocumentsExcelExportUrl(q?: string, partnerType = "all") {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (partnerType) qs.set("partnerType", partnerType);
  return `/api/partner-finance/unpaid-documents/export-excel?${qs.toString()}`;
}

export function unpaidDocumentsPdfExportUrl(q?: string, partnerType = "all") {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (partnerType) qs.set("partnerType", partnerType);
  return `/api/partner-finance/unpaid-documents/export-pdf?${qs.toString()}`;
}

export function listPartnerDocuments(partnerType: "customer" | "supplier", partnerId: string, signal?: AbortSignal) {
  return http<PartnerDocumentOptionDto[]>(
    `/api/partner-finance/documents?partnerType=${encodeURIComponent(partnerType)}&partnerId=${encodeURIComponent(partnerId)}`,
    { signal }
  );
}

export function createPartnerPayment(body: CreatePartnerPaymentDto, signal?: AbortSignal) {
  return http<{ id: string }>(`/api/partner-finance/payments`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}
