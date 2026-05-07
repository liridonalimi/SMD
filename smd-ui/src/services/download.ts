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
        throw new Error(text || `Download failed (${res.status})`);
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
