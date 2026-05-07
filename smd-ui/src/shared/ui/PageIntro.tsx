import type { CSSProperties, ReactNode } from "react";

type PageIntroProps = {
    title: string;
    subtitle?: ReactNode;
    actions?: ReactNode;
};

export function PageIntro({ title, subtitle, actions }: PageIntroProps) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "flex-start",
                flexWrap: "wrap",
                marginBottom: 16,
            }}
        >
            <div style={{ minWidth: 260 }}>
                <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.1 }}>{title}</h1>
                {subtitle ? (
                    <div style={{ marginTop: 6, color: "var(--muted)", maxWidth: 760 }}>
                        {subtitle}
                    </div>
                ) : null}
            </div>
            {actions ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div> : null}
        </div>
    );
}

export const pageEyebrowStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 10px",
    marginBottom: 10,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--muted-strong)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
};
