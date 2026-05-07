import { http } from "./http";

export type BinHitDto = {
    id: string;
    code: string;
    name: string;

    rackId: string;
    rackCode?: string;
    rackName?: string;

    zoneId: string;
    zoneCode?: string;
    zoneName?: string;

    warehouseId: string;
    warehouseCode?: string;
    warehouseName?: string;
};

export type SuggestedBinDto = BinHitDto & {
    reason?: string;
    availableQty?: number;
    lotNumber?: string | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    isExpired?: boolean;
    isNearExpiry?: boolean;
};

export function searchBins(q: string, signal?: AbortSignal) {
    return http<BinHitDto[]>(`/api/bins?q=${encodeURIComponent(q)}`, { signal });
}

export function getSuggestedBins(productId: string, signal?: AbortSignal, q?: string, onlyAvailable = false) {
    const qs = new URLSearchParams({ productId });
    if (q?.trim()) qs.set("q", q.trim());
    if (onlyAvailable) qs.set("onlyAvailable", "true");

    return http<SuggestedBinDto[]>(`/api/bins/suggested?${qs.toString()}`, { signal });
}
