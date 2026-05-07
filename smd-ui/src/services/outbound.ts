import { http } from "./http";
import type { PagedResponse } from "../types/paged";
import type { DecrementLineResponse, DocumentListItem, DraftDocumentResponse, OutboundDetailsDto, OutboundListSummary, OutboundPriceTier } from "../types/documents";
import type { ListParams } from "../types/list";
import { toListQuery } from "../shared/listQuery";

export function listOutbound(params: ListParams, signal?: AbortSignal) {
  return http<PagedResponse<DocumentListItem>>(`/api/outbound-documents?${toListQuery(params)}`, { signal });
}

export function getOutboundListSummary(params: ListParams, signal?: AbortSignal) {
  return http<OutboundListSummary>(`/api/outbound-documents/summary?${toListQuery(params)}`, { signal });
}

export function getOutbound(id: string, signal?: AbortSignal) {
  return http<OutboundDetailsDto>(`/api/outbound-documents/${id}`, { signal });
}

export function createOutboundDraft(
  body: { customerId?: string | null; priceTier?: OutboundPriceTier | null; reference?: string | null; note?: string | null },
  signal?: AbortSignal,
) {
  return http<DraftDocumentResponse>("/api/outbound-documents", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function setOutboundPriceTier(id: string, priceTier: OutboundPriceTier) {
  return http<{ documentId: string; priceTier: OutboundPriceTier }>(`/api/outbound-documents/${id}/price-tier`, {
    method: "PUT",
    body: JSON.stringify({ priceTier }),
  });
}

export function setOutboundLinePriceTier(id: string, lineId: string, priceTier: OutboundPriceTier) {
  return http<{ documentId: string; lineId: string; priceTier: OutboundPriceTier }>(`/api/outbound-documents/${id}/lines/${lineId}/price-tier`, {
    method: "PUT",
    body: JSON.stringify({ priceTier }),
  });
}

export function addOutboundLine(
  id: string,
  body: { productId: string; fromBinId: string; lotNumber?: string | null; batchNumber?: string | null; expiryDate?: string | null; quantity: number }
) {
  return http(`/api/outbound-documents/${id}/lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteOutboundLine(id: string, lineId: string) {
  return http(`/api/outbound-documents/${id}/lines/${lineId}`, {
    method: "DELETE",
  });
}

export function adjustOutboundLineQuantity(id: string, lineId: string, body: { delta: number }) {
  return http<DecrementLineResponse>(`/api/outbound-documents/${id}/lines/${lineId}/adjust`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function confirmOutbound(id: string) {
  return http(`/api/outbound-documents/${id}/confirm`, { method: "POST" });
}

export function cancelOutbound(id: string) {
  return http(`/api/outbound-documents/${id}/cancel`, { method: "POST" });
}

export function outboundPdfUrl(id: string) {
  return `/api/exports/documents/outbound/${id}/pdf`;
}

export function outboundExcelUrl(id: string) {
  return `/api/exports/documents/outbound/${id}/excel`;
}
