import { env } from "../config/env";
import { getToken } from "./token";

function apiErrorMessage(text: string, fallback: string) {
    if (!text) return fallback;

    try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed === "string") return parsed;

        if (parsed && typeof parsed === "object") {
            const obj = parsed as { title?: unknown; detail?: unknown; errors?: unknown };
            if (obj.errors && typeof obj.errors === "object") {
                const first = Object.values(obj.errors as Record<string, unknown>)[0];
                if (Array.isArray(first) && typeof first[0] === "string") return first[0];
                if (typeof first === "string") return first;
            }
            if (typeof obj.detail === "string") return obj.detail;
            if (typeof obj.title === "string") return obj.title;
        }
    } catch {
        // not JSON
    }

    return text;
}

export async function http<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken();
    const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

    const res = await fetch(`${env.apiBaseUrl}${path}`, {
        ...init,
        headers: {
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...(init.headers ?? {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!res.ok) {
        // 401 = token skadoi / token invalid
        if (res.status === 401) {
            localStorage.removeItem("smd_token");
            // ridrejtim automatik te login
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni perseri.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(apiErrorMessage(text, `HTTP ${res.status}`));
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    // nëse body është bosh, mos provo JSON
    const raw = await res.text().catch(() => "");
    if (!raw) return undefined as T;

    try {
        return JSON.parse(raw) as T;
    } catch {
        // fallback nëse s'është JSON
        return raw as unknown as T;
    }
}
