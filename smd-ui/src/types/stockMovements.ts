export type StockMovementType = "IN" | "OUT" | "TRANSFER" | "ADJUST";

/*
export interface StockMovementListItemDto {
    id: string;
    type: StockMovementType;
    productId: string;
    productSku: string;
    fromBinId?: string | null;
    fromBinCode?: string | null;
    toBinId?: string | null;
    toBinCode?: string | null;
    quantity: number;
    reference?: string | null;
    note?: string | null;
    performedByUserId?: string | null;
    createdAt: string;
}
*/
export interface StockMovementListItemDto {
    id: string;
    type: StockMovementType;
    productId: string;
    productSku: string;
    productName?: string | null;
    fromBinId?: string | null;
    fromBinCode?: string | null;
    toBinId?: string | null;
    toBinCode?: string | null;
    quantity: number;
    reference?: string | null;
    note?: string | null;
    performedByUserId?: string | null;
    createdAt: string;
}

export interface StockInRequest {
    productId: string;
    toBinId: string;
    quantity: number;
    reference?: string;
    note?: string;
}

export interface StockOutRequest {
    productId: string;
    fromBinId: string;
    quantity: number;
    reference?: string;
    note?: string;
}

export interface StockTransferRequest {
    productId: string;
    fromBinId: string;
    toBinId: string;
    quantity: number;
    reference?: string;
    note?: string;
}

export interface StockAdjustRequest {
    productId: string;
    binId: string;
    quantityChange: number;
    reason: string;
    reference?: string;
}