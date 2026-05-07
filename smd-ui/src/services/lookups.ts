import { http } from "./http";

export type LookupDto = {
    id: string;
    code: string;
    name: string;
};

export function listWarehouses(signal?: AbortSignal) {
    return http<LookupDto[]>("/api/warehouses/lookup", { signal });
}

export function listZones(warehouseId?: string, signal?: AbortSignal) {
    const qs = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : "";
    return http<LookupDto[]>(`/api/zones/lookup${qs}`, { signal });
}

export function listRacks(zoneId?: string, signal?: AbortSignal) {
    const qs = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : "";
    return http<LookupDto[]>(`/api/racks/lookup${qs}`, { signal });
}

export function listBins(rackId?: string, signal?: AbortSignal) {
    const qs = rackId ? `?rackId=${encodeURIComponent(rackId)}` : "";
    return http<LookupDto[]>(`/api/bins/lookup${qs}`, { signal });
}
