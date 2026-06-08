import { http } from "./http";
import type { WarehouseTaskDto, WarehouseTaskListResponse, WarehouseTaskMetricsResponse, WarehouseTaskStatus, WarehouseTaskType } from "../types/warehouseTasks";

type CreateWarehouseTaskRequest = {
  type: number;
  productId?: string | null;
  fromBinId?: string | null;
  toBinId?: string | null;
  quantity?: number | null;
  assignedToUserId?: string | null;
  reference?: string | null;
  note?: string | null;
};

const typeToNumber: Record<WarehouseTaskType, number> = {
  Putaway: 1,
  Replenishment: 2,
  Picking: 3,
  Counting: 4,
};

export function listWarehouseTasks(status?: WarehouseTaskStatus | "", type?: WarehouseTaskType | "", page = 1, pageSize = 50, assignedToUserId?: string | null) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  if (assignedToUserId) params.set("assignedToUserId", assignedToUserId);
  return http<WarehouseTaskListResponse>(`/api/warehouse-tasks?${params.toString()}`);
}

export function getWarehouseTaskMetrics() {
  return http<WarehouseTaskMetricsResponse>("/api/warehouse-tasks/metrics");
}

export function createWarehouseTask(payload: Omit<CreateWarehouseTaskRequest, "type"> & { type: WarehouseTaskType }) {
  return http<WarehouseTaskDto>("/api/warehouse-tasks", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      type: typeToNumber[payload.type],
    }),
  });
}

export function assignWarehouseTask(id: string, assignedToUserId?: string | null) {
  return http<WarehouseTaskDto>(`/api/warehouse-tasks/${id}/assign`, {
    method: "POST",
    body: JSON.stringify({ assignedToUserId: assignedToUserId ?? null }),
  });
}

export function startWarehouseTask(id: string) {
  return http<WarehouseTaskDto>(`/api/warehouse-tasks/${id}/start`, { method: "POST" });
}

export function completeWarehouseTask(id: string) {
  return http<WarehouseTaskDto>(`/api/warehouse-tasks/${id}/complete`, { method: "POST" });
}

export function reportWarehouseTaskProblem(id: string, reason: string) {
  return http<WarehouseTaskDto>(`/api/warehouse-tasks/${id}/problem`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function cancelWarehouseTask(id: string) {
  return http<WarehouseTaskDto>(`/api/warehouse-tasks/${id}/cancel`, { method: "POST" });
}

export function generatePutawayTasks(inboundDocumentRef: string) {
  return http<{ created: number; tasks: WarehouseTaskDto[] }>(`/api/warehouse-tasks/generate/putaway/${encodeURIComponent(inboundDocumentRef)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
export function regeneratePutawayTasks(inboundDocumentRef: string) {
  return http<{ created: number; tasks: WarehouseTaskDto[] }>(`/api/warehouse-tasks/generate/putaway/${encodeURIComponent(inboundDocumentRef)}?force=true`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function generatePickingTasks(outboundDocumentRef: string) {
  return http<{ created: number; tasks: WarehouseTaskDto[] }>(`/api/warehouse-tasks/generate/picking/${encodeURIComponent(outboundDocumentRef)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
export function regeneratePickingTasks(outboundDocumentRef: string) {
  return http<{ created: number; tasks: WarehouseTaskDto[] }>(`/api/warehouse-tasks/generate/picking/${encodeURIComponent(outboundDocumentRef)}?force=true`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function generateCountingTasks(cycleCountRef: string) {
  return http<{ created: number; tasks: WarehouseTaskDto[] }>(`/api/warehouse-tasks/generate/counting/${encodeURIComponent(cycleCountRef)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
export function regenerateCountingTasks(cycleCountRef: string) {
  return http<{ created: number; tasks: WarehouseTaskDto[] }>(`/api/warehouse-tasks/generate/counting/${encodeURIComponent(cycleCountRef)}?force=true`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
