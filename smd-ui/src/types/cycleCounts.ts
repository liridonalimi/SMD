export type CycleCountStatus = "Draft" | "Completed" | "Cancelled";

export interface CycleCountListItemDto {
  id: string;
  countNo: string;
  status: CycleCountStatus;
  reference?: string | null;
  note?: string | null;
  scopeLabel: string;
  lineCount: number;
  countedLineCount: number;
  expectedQty: number;
  countedQty: number;
  varianceQty: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface CycleCountDetailDto extends CycleCountListItemDto {
  lines: CycleCountLineDto[];
}

export interface CycleCountLineDto {
  id: string;
  inventoryId: string;
  productId: string;
  productSku: string;
  productName: string;
  productBarcode?: string | null;
  binId: string;
  binCode: string;
  binName: string;
  rackCode: string;
  zoneCode: string;
  warehouseCode: string;
  lotNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  expectedQty: number;
  reservedQty: number;
  countedQty?: number | null;
  varianceQty: number;
  note?: string | null;
}

export interface CreateCycleCountRequest {
  warehouseId?: string | null;
  zoneId?: string | null;
  rackId?: string | null;
  binId?: string | null;
  productId?: string | null;
  onlyWithStock?: boolean;
  reference?: string | null;
  note?: string | null;
}

export interface UpdateCycleCountLineRequest {
  countedQty?: number | null;
  note?: string | null;
}
