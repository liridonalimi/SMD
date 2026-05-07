import { http } from "./http";
import type {
  CreateCycleCountRequest,
  CycleCountDetailDto,
  CycleCountListItemDto,
  CycleCountStatus,
  UpdateCycleCountLineRequest,
} from "../types/cycleCounts";

export function listCycleCounts(status?: CycleCountStatus | "", signal?: AbortSignal) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return http<CycleCountListItemDto[]>(`/api/cycle-counts${qs}`, { signal });
}

export function createCycleCount(body: CreateCycleCountRequest, signal?: AbortSignal) {
  return http<CycleCountDetailDto>("/api/cycle-counts", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function getCycleCount(id: string, signal?: AbortSignal) {
  return http<CycleCountDetailDto>(`/api/cycle-counts/${id}`, { signal });
}

export function updateCycleCountLine(id: string, lineId: string, body: UpdateCycleCountLineRequest, signal?: AbortSignal) {
  return http<CycleCountDetailDto>(`/api/cycle-counts/${id}/lines/${lineId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    signal,
  });
}

export function completeCycleCount(id: string, signal?: AbortSignal) {
  return http<CycleCountDetailDto>(`/api/cycle-counts/${id}/complete`, { method: "POST", signal });
}

export function cancelCycleCount(id: string, signal?: AbortSignal) {
  return http<CycleCountDetailDto>(`/api/cycle-counts/${id}/cancel`, { method: "POST", signal });
}
