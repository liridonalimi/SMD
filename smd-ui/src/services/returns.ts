import { http } from "./http";
import type {
  AddReturnLineBody,
  CreateReturnDraftBody,
  ReturnDetails,
  ReturnDocumentType,
  ReturnDraftResponse,
  ReturnListItem,
} from "../types/returns";
import type { DocumentStatus } from "../types/documents";

export function listReturns(params?: { type?: ReturnDocumentType | ""; status?: DocumentStatus | "" }, signal?: AbortSignal) {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", String(params.type));
  if (params?.status !== undefined && params.status !== "") qs.set("status", String(params.status));

  return http<ReturnListItem[]>(`/api/returns${qs.size ? `?${qs.toString()}` : ""}`, { signal });
}

export function createReturnDraft(body: CreateReturnDraftBody, signal?: AbortSignal) {
  return http<ReturnDraftResponse>("/api/returns", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function getReturn(id: string, signal?: AbortSignal) {
  return http<ReturnDetails>(`/api/returns/${id}`, { signal });
}

export function addReturnLine(id: string, body: AddReturnLineBody, signal?: AbortSignal) {
  return http<{ id: string }>(`/api/returns/${id}/lines`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function deleteReturnLine(id: string, lineId: string, signal?: AbortSignal) {
  return http<void>(`/api/returns/${id}/lines/${lineId}`, {
    method: "DELETE",
    signal,
  });
}

export function confirmReturn(id: string, signal?: AbortSignal) {
  return http<ReturnDetails>(`/api/returns/${id}/confirm`, { method: "POST", signal });
}

export function cancelReturn(id: string, signal?: AbortSignal) {
  return http<ReturnDetails>(`/api/returns/${id}/cancel`, { method: "POST", signal });
}
