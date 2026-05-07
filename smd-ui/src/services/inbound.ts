import { http } from "./http";
import type { InboundDetailsDto, DocumentListItem, DecrementLineResponse, DraftDocumentResponse, InboundListSummary } from "../types/documents";
import type { ListParams } from "../types/list";
import { toListQuery } from "../shared/listQuery";
import type { PagedResponse } from "../types/paged";

export function listInbound(params: ListParams, signal?: AbortSignal) {
    return http<PagedResponse<DocumentListItem>>(
        `/api/inbound-documents?${toListQuery(params)}`,
        { signal }
    );
}

export function getInboundListSummary(params: ListParams, signal?: AbortSignal) {
    return http<InboundListSummary>(
        `/api/inbound-documents/summary?${toListQuery(params)}`,
        { signal }
    );
}

// -------- DETAILS + ACTIONS --------
export function getInbound(id: string, signal?: AbortSignal) {
    return http<InboundDetailsDto>(`/api/inbound-documents/${id}`, { signal });
}

export function createInboundDraft(
    body: { supplierId?: string | null; reference?: string | null; note?: string | null },
    signal?: AbortSignal,
) {
    return http<DraftDocumentResponse>("/api/inbound-documents", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
    });
}

export function addInboundLine(
    id: string,
    body: { productId: string; toBinId: string; lotNumber?: string | null; batchNumber?: string | null; expiryDate?: string | null; quantity: number},
    signal?: AbortSignal,
) {
    return http(`/api/inbound-documents/${id}/lines`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
    });
}

export function deleteInboundLine(id: string, lineId: string) {
    return http(`/api/inbound-documents/${id}/lines/${lineId}`, {
        method: "DELETE",
    });
}

export function confirmInbound(id: string) {
    return http(`/api/inbound-documents/${id}/confirm`, { method: "POST" });
}

export function cancelInbound(id: string) {
    return http(`/api/inbound-documents/${id}/cancel`, { method: "POST" });
}

export function inboundPdfUrl(id: string) {
    return `/api/exports/documents/inbound/${id}/pdf`;
}

export function inboundExcelUrl(id: string) {
    return `/api/exports/documents/inbound/${id}/excel`;
}

export function decrementInboundLine(
    docId: string,
    lineId: string,
    body: { quantity: number },
    signal?: AbortSignal
) {
    return http<DecrementLineResponse>(
        `/api/inbound-documents/${docId}/lines/${lineId}/decrement`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal,
        }
    );
}


