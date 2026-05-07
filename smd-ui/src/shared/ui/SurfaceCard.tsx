import type { CSSProperties, ReactNode } from "react";

type SurfaceCardProps = {
    children: ReactNode;
    style?: CSSProperties;
    padded?: boolean;
    variant?: "default" | "subtle" | "strong";
};

const backgrounds: Record<NonNullable<SurfaceCardProps["variant"]>, string> = {
    default: "var(--panel)",
    subtle: "var(--panel-soft)",
    strong: "var(--panel-strong)",
};

export function SurfaceCard({
    children,
    style,
    padded = true,
    variant = "default",
}: SurfaceCardProps) {
    return (
        <div
            style={{
                background: backgrounds[variant],
                border: "1px solid var(--border)",
                borderRadius: 18,
                boxShadow: "var(--shadow)",
                padding: padded ? 18 : 0,
                ...style,
            }}
        >
            {children}
        </div>
    );
}
