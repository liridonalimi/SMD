export type WarehouseTaskStatus = "Open" | "InProgress" | "Done" | "Cancelled" | "Blocked";
export type WarehouseTaskType = "Putaway" | "Replenishment" | "Picking" | "Counting";

export interface WarehouseTaskDto {
  id: string;
  taskNo: string;
  type: WarehouseTaskType;
  status: WarehouseTaskStatus;
  productId?: string | null;
  productSku?: string | null;
  productName?: string | null;
  fromBinId?: string | null;
  fromBinCode?: string | null;
  toBinId?: string | null;
  toBinCode?: string | null;
  quantity?: number | null;
  assignedToUserId?: string | null;
  assignedToUsername?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  leadTimeSeconds?: number | null;
  reference?: string | null;
  note?: string | null;
}

export interface WarehouseTaskListResponse {
  total: number;
  page: number;
  pageSize: number;
  data: WarehouseTaskDto[];
}

export interface WarehouseTaskMetricsResponse {
  total: number;
  byStatus: Record<string, number>;
  byType: Array<{
    type: string;
    total: number;
    open: number;
    inProgress: number;
    done: number;
    cancelled: number;
    avgLeadTimeSeconds: number;
  }>;
}
