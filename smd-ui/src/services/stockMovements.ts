import { env } from "../config/env";
import { getToken, clearToken } from "./token";
import type {
    StockAdjustRequest,
    StockInRequest,
    StockMovementListItemDto,
    StockMovementType,
    StockOutRequest,
    StockTransferRequest,
} from "../types/stockMovements";

const API = `${env.apiBaseUrl}/api/stock-movements`;

function buildQuery(params: Record<string, string | undefined>) {
    const qs = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value && value.trim() !== "") {
            qs.set(key, value);
        }
    }

    const query = qs.toString();
    return query ? `?${query}` : "";
}

function authHeaders() {
    const token = getToken();

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function readJson<T>(res: Response): Promise<T> {
    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni përsëri.");
        }

        if (res.status === 403) {
            throw new Error("Nuk keni të drejtë për këtë veprim.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(text || "Ndodhi një gabim.");
    }

    return res.json();
}

export async function listStockMovements(filters: {
    productId?: string;
    binId?: string;
    type?: StockMovementType | "";
}) {
    const res = await fetch(
        `${API}${buildQuery({
            productId: filters.productId,
            binId: filters.binId,
            type: filters.type || undefined,
        })}`,
        {
            method: "GET",
            headers: authHeaders(),
        }
    );

    return readJson<StockMovementListItemDto[]>(res);
}

export async function stockIn(req: StockInRequest) {
    const res = await fetch(`${API}/in`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(req),
    });

    return readJson<{ id: string }>(res);
}

export async function stockOut(req: StockOutRequest) {
    const res = await fetch(`${API}/out`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(req),
    });

    return readJson<{ id: string }>(res);
}

export async function stockTransfer(req: StockTransferRequest) {
    const res = await fetch(`${API}/transfer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(req),
    });

    return readJson<{ id: string }>(res);
}

export async function stockAdjust(req: StockAdjustRequest) {
    const res = await fetch(`${API}/adjust`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(req),
    });

    return readJson<{ id: string }>(res);
}
