import type { InventoryListQuery } from "../types/inventory";

export type SavedView = {
    id: string;
    name: string;
    createdAt: string;
    query: InventoryListQuery & {
        warehouseId?: string;
        zoneId?: string;
        rackId?: string;
        binId?: string;
    };
};

const KEY = "smd.inventory.savedViews";

export function loadViews(): SavedView[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        return JSON.parse(raw) as SavedView[];
    } catch {
        return [];
    }
}

export function saveViews(views: SavedView[]) {
    localStorage.setItem(KEY, JSON.stringify(views));
}

export function addView(name: string, query: SavedView["query"]) {
    const views = loadViews();
    const v: SavedView = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        query,
    };
    views.unshift(v);
    saveViews(views);
    return v;
}

export function deleteView(id: string) {
    const views = loadViews().filter(v => v.id !== id);
    saveViews(views);
    return views;
}