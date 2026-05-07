import { http } from "./http";
import type {
    InventoryChartsDto,
    InventoryExpiryReportDto,
    InventoryListQuery,
    InventorySummaryDto,
    InventoryStockAlertsDto,
    PagedInventoryResponse,
} from "../types/inventory";

function toQuery(params: Record<string, unknown>) {
    const sp = new URLSearchParams();

    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (typeof v === "string" && v.trim() === "") continue;

        // booleans: only include if true OR explicitly set
        if (typeof v === "boolean") {
            sp.set(k, v ? "true" : "false");
            continue;
        }

        sp.set(k, String(v));
    }

    return sp.toString();
}

export function listInventory(query: InventoryListQuery, signal?: AbortSignal) {
    const qs = toQuery({
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
        search: query.search,
        warehouseId: query.warehouseId,
        zoneId: query.zoneId,
        rackId: query.rackId,
        binId: query.binId,
        productId: query.productId,
        onlyInStock: query.onlyInStock ?? false,
        onlyOutOfStock: query.onlyOutOfStock ?? false,
        onlyBelowMinStock: query.onlyBelowMinStock ?? false,
        expiryFilter: query.expiryFilter,
        lowStockThreshold: query.lowStockThreshold,
        sortBy: query.sortBy ?? "sku",
        sortDir: query.sortDir ?? "asc",
    });

    return http<PagedInventoryResponse>(`/api/inventory?${qs}`, { signal });
}

export function getInventorySummary(lowStockThreshold = 5, signal?: AbortSignal) {
    const qs = toQuery({ lowStockThreshold });
    return http<InventorySummaryDto>(`/api/inventory/summary?${qs}`, { signal });
}

export function getInventoryStockAlerts(args: { lowStockThreshold?: number; top?: number } = {}, signal?: AbortSignal) {
    const qs = toQuery({
        lowStockThreshold: args.lowStockThreshold ?? 5,
        top: args.top ?? 20,
    });
    return http<InventoryStockAlertsDto>(`/api/inventory/stock-alerts?${qs}`, { signal });
}

export function getInventoryCharts(
    args: { days?: number; top?: number; lowStockThreshold?: number; warehouseId?: string } = {},
    signal?: AbortSignal
) {
    const qs = toQuery({
        days: args.days ?? 30,
        top: args.top ?? 10,
        lowStockThreshold: args.lowStockThreshold ?? 5,
        warehouseId: args.warehouseId,
    });

    return http<InventoryChartsDto>(`/api/inventory/charts?${qs}`, { signal });
}

export function getInventoryExpiryReport(args: { warehouseId?: string } = {}, signal?: AbortSignal) {
    const qs = toQuery({
        warehouseId: args.warehouseId,
    });

    return http<InventoryExpiryReportDto>(`/api/inventory/expiry-report?${qs}`, { signal });
}

export function inventoryExcelUrl(query: InventoryListQuery) {
    const qs = toQuery({
        search: query.search,
        warehouseId: query.warehouseId,
        zoneId: query.zoneId,
        rackId: query.rackId,
        binId: query.binId,
        productId: query.productId,
        onlyInStock: query.onlyInStock ?? false,
        onlyOutOfStock: query.onlyOutOfStock ?? false,
        onlyBelowMinStock: query.onlyBelowMinStock ?? false,
        expiryFilter: query.expiryFilter,
        lowStockThreshold: query.lowStockThreshold,
        sortBy: query.sortBy ?? "sku",
        sortDir: query.sortDir ?? "asc",
    });

    return `/api/exports/documents/inventory/excel?${qs}`;
}

export function inventoryReorderExcelUrl(lowStockThreshold = 5) {
    const qs = toQuery({ lowStockThreshold });
    return `/api/inventory/stock-alerts/excel?${qs}`;
}
