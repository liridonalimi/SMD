import { useRef, useState } from "react";
import { errorMessage } from "./errors";
import type { ImportResult } from "../types/import";

type Props = {
  title: string;
  hint: string;
  importFile: (file: File, updateExisting: boolean, signal?: AbortSignal) => Promise<ImportResult>;
  onImported: () => Promise<void> | void;
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
  cursor: "pointer",
};

export function ImportPanel({ title, hint, importFile, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!file) {
      setErr("Zgjidh nje file .xlsx ose .csv.");
      return;
    }

    setBusy(true);
    setErr(null);
    setResult(null);

    try {
      const next = await importFile(file, updateExisting);
      setResult(next);
      await onImported();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 13, lineHeight: 1.45 }}>{hint}</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setErr(null);
          setResult(null);
        }}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--panel-soft)",
          color: "var(--text)",
        }}
      />

      <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--muted-strong)", fontSize: 13 }}>
        <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
        Perditeso rreshtat ekzistues sipas SKU/kodit
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={submit} disabled={busy} style={buttonStyle}>
          {busy ? "Duke importuar..." : "Importo"}
        </button>
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setResult(null);
            setErr(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          style={buttonStyle}
        >
          Pastro
        </button>
      </div>

      {err ? (
        <div style={{ padding: 12, borderRadius: 12, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca" }}>
          {err}
        </div>
      ) : null}

      {result ? (
        <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)" }}>
          <div style={{ fontWeight: 800 }}>
            Rreshta: {result.totalRows} | Shtuar: {result.created} | Perditesuar: {result.updated} | Anashkaluar: {result.skipped} | Gabime: {result.errors.length}
          </div>
          {[...result.errors, ...result.messages].slice(0, 6).map((item, index) => (
            <div key={`${item.rowNumber}-${index}`} style={{ fontSize: 13, color: item.type === "Error" ? "#fecaca" : "var(--muted-strong)" }}>
              Rreshti {item.rowNumber}: {item.message}
            </div>
          ))}
          {result.errors.length + result.messages.length > 6 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Po shfaqen 6 njoftimet e para.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
