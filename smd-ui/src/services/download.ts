import { env } from "../config/env";
import { getToken, clearToken } from "./token";

export async function downloadFile(path: string, fallbackName: string) {
    const token = getToken();

    const res = await fetch(`${env.apiBaseUrl}${path}`, {
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni perseri.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(text || `Download deshtoj (${res.status})`);
    }

    const blob = await res.blob();

    const cd = res.headers.get("content-disposition") ?? "";

    let filename = fallbackName;

    const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        filename = decodeURIComponent(utf8Match[1]);
    } else {
        const plainMatch = cd.match(/filename="?([^"]+)"?/i);
        if (plainMatch?.[1]) {
            filename = plainMatch[1];
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function downloadFilePost(path: string, body: unknown, fallbackName: string) {
    const token = getToken();

    const res = await fetch(`${env.apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni perseri.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(text || `Download deshtoj (${res.status})`);
    }

    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    let filename = fallbackName;

    const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        filename = decodeURIComponent(utf8Match[1]);
    } else {
        const plainMatch = cd.match(/filename=\"?([^\"]+)\"?/i);
        if (plainMatch?.[1]) {
            filename = plainMatch[1];
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function openPrintPreviewPost(path: string, body: unknown) {
    const token = getToken();

    const res = await fetch(`${env.apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni perseri.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(text || `Print preview deshtoj (${res.status})`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
        URL.revokeObjectURL(url);
        throw new Error("Browser bllokoi hapjen e print preview. Lejo pop-ups dhe provo perseri.");
    }
}

export async function printPdfPostInPlace(path: string, body: unknown) {
    const token = getToken();

    const res = await fetch(`${env.apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni perseri.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(text || `Print deshtoj (${res.status})`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.location.assign(blobUrl);
}
