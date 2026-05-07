export function FieldLabel({ children }: { children: string }) {
    return (
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
            {children}
        </div>
    );
}
