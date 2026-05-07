import type { CSSProperties } from "react";
import type { DocumentStatus } from "../../types/documents";
import { statusLabel, toStatus } from "../documentStatus";

function badgeTone(rawStatus: DocumentStatus | string): CSSProperties {
    const status = toStatus(rawStatus);

    switch (status) {
        case 0:
            return {
                background: "color-mix(in srgb, var(--accent-warm) 18%, var(--panel-soft))",
                color: "var(--accent-warm)",
                border: "1px solid color-mix(in srgb, var(--accent-warm) 42%, var(--border))",
            };
        case 1:
            return {
                background: "color-mix(in srgb, var(--success) 18%, var(--panel-soft))",
                color: "var(--success)",
                border: "1px solid color-mix(in srgb, var(--success) 42%, var(--border))",
            };
        case 2:
            return {
                background: "color-mix(in srgb, var(--danger) 16%, var(--panel-soft))",
                color: "var(--danger)",
                border: "1px solid color-mix(in srgb, var(--danger) 40%, var(--border))",
            };
        default:
            return {
                background: "color-mix(in srgb, var(--muted) 14%, var(--panel-soft))",
                color: "var(--muted-strong)",
                border: "1px solid color-mix(in srgb, var(--muted) 34%, var(--border))",
            };
    }
}

export function StatusBadge({ status }: { status: DocumentStatus | string }) {
    return (
        <span
            style={{
                ...badgeTone(status),
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                whiteSpace: "nowrap",
            }}
        >
            {statusLabel(status)}
        </span>
    );
}
