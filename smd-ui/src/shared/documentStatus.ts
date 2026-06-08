// src/shared/documentStatus.ts
export type DocumentStatus = 0 | 1 | 2;

export const DocumentStatusLabels: Record<DocumentStatus, string> = {
    0: "Ne pergatitje",
    1: "Konfirmuar",
    2: "Anuluar",
};

export function toStatus(v: unknown): DocumentStatus | undefined {
    if (v === 0 || v === 1 || v === 2) return v;

    if (typeof v === "string") {
        const s = v.trim().toLowerCase();

        if (s === "0") return 0;
        if (s === "1") return 1;
        if (s === "2") return 2;
        if (s === "draft") return 0;
        if (s === "confirmed") return 1;
        if (s === "cancelled") return 2;
    }
    return undefined;
}

export function statusLabel(raw: unknown) {
    const s = toStatus(raw);
    return s === undefined ? "i panjohur" : DocumentStatusLabels[s];
}
