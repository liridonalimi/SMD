import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { flushSync } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import type { OutboundDetailsDto, OutboundLine } from "../../types/documents";
import { getOutbound } from "../../services/outbound";
import { errorMessage } from "../../shared/errors";
import { statusLabel } from "../../shared/documentStatus";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import smdPrintLogo from "../../assets/logo/smd-logo-wordmark-transparent.png";

const PICK_LIST_STORAGE_PREFIX = "smd:pick-list:";

function formatQty(value: number | undefined | null) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(Math.trunc(Number(value ?? 0)));
}

function formatDateOnly(value: string | undefined | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | Date | undefined | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pickListStorageKey(documentId: string) {
  return `${PICK_LIST_STORAGE_PREFIX}${documentId}`;
}

function loadPickedState(documentId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(pickListStorageKey(documentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePickedState(documentId: string, value: Record<string, boolean>) {
  localStorage.setItem(pickListStorageKey(documentId), JSON.stringify(value));
}

function lineSortValue(line: OutboundLine) {
  return [
    line.fromBinCode ?? line.fromBinName ?? "",
    line.expiryDate ?? "9999-12-31",
    line.productSku ?? "",
    line.productName ?? "",
    line.lotNumber ?? "",
    line.batchNumber ?? "",
  ].join("|").toLowerCase();
}

function groupLines(lines: OutboundLine[], checked: Record<string, boolean>) {
  const map = new Map<
    string,
    {
      key: string;
      binCode: string;
      binName: string;
      lines: OutboundLine[];
      totalQuantity: number;
      pickedCount: number;
    }
  >();

  for (const line of lines) {
    const key = line.fromBinId;
    const group = map.get(key) ?? {
      key,
      binCode: line.fromBinCode ?? line.fromBinId,
      binName: line.fromBinName ?? "",
      lines: [],
      totalQuantity: 0,
      pickedCount: 0,
    };

    group.lines.push(line);
    group.totalQuantity += Number(line.quantity ?? 0);
    if (checked[line.id]) group.pickedCount += 1;
    map.set(key, group);
  }

  return Array.from(map.values()).sort((a, b) => a.binCode.localeCompare(b.binCode));
}

export default function OutboundPickList() {
  const { id } = useParams();
  const nav = useNavigate();
  const [doc, setDoc] = useState<OutboundDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    if (!id) return;
    setChecked(loadPickedState(id));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    setLoading(true);
    setErr(null);

    getOutbound(id, controller.signal)
      .then(setDoc)
      .catch((e) => {
        if (!controller.signal.aborted) setErr(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!id || !doc) return;
    const validIds = new Set(doc.lines.map((line) => line.id));
    setChecked((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [lineId, value] of Object.entries(current)) {
        if (validIds.has(lineId)) {
          next[lineId] = value;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [id, doc]);

  useEffect(() => {
    if (!id || !doc) return;
    savePickedState(id, checked);
  }, [id, doc, checked]);

  useEffect(() => {
    if (!doc) return;
    const previousTitle = document.title;
    document.title = `ListaPergatitjes_${doc.documentNo}`;
    return () => {
      document.title = previousTitle;
    };
  }, [doc]);

  useEffect(() => {
    const exitPrintMode = () => setPrintMode(false);
    window.addEventListener("afterprint", exitPrintMode);
    return () => window.removeEventListener("afterprint", exitPrintMode);
  }, []);

  const sortedLines = useMemo(() => {
    return [...(doc?.lines ?? [])].sort((a, b) => lineSortValue(a).localeCompare(lineSortValue(b)));
  }, [doc]);

  const groups = useMemo(() => groupLines(sortedLines, checked), [sortedLines, checked]);
  const pickedCount = sortedLines.filter((line) => checked[line.id]).length;
  const totalQuantity = sortedLines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  const reservedQuantity = sortedLines.reduce((sum, line) => sum + Number(line.reservedQuantity ?? 0), 0);
  const progressPercent = sortedLines.length > 0 ? Math.round((pickedCount / sortedLines.length) * 100) : 0;
  const printedAt = useMemo(() => new Date(), [doc?.id]);

  function toggleLine(lineId: string) {
    setChecked((current) => ({ ...current, [lineId]: !current[lineId] }));
  }

  function clearPickedState() {
    if (!id) return;
    localStorage.removeItem(pickListStorageKey(id));
    setChecked({});
  }

  function onPrint() {
    flushSync(() => setPrintMode(true));
    window.print();
  }

  if (loading) return <div>Loading...</div>;
  if (err && !doc) return <div style={{ color: "tomato" }}>{err}</div>;
  if (!doc) return <div>Dokumenti nuk u gjet.</div>;

  return (
    <div className="pick-list-page">
      {!printMode ? (
      <div className="pick-list-screen">
        <PageIntro
          title={`Lista e pergatitjes • ${doc.documentNo}`}
          subtitle={
            <>
              Statusi: <b>{statusLabel(doc.status)}</b>
              {doc.customerName ? <> • Klienti: <b>{doc.customerCode ? `${doc.customerCode} - ` : ""}{doc.customerName}</b></> : null}
              {doc.reference ? <> • Referenca: <b>{doc.reference}</b></> : null}
            </>
          }
          actions={
            <div className="pick-list-no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => nav(`/outbound/${doc.id}`)} style={buttonStyle}>
                <BackIcon />
                Prapa
              </button>
              <button type="button" onClick={clearPickedState} disabled={pickedCount === 0} style={buttonStyle}>
                <ResetIcon />
                Pastro
              </button>
              <button type="button" onClick={onPrint} style={primaryButtonStyle}>
                <PrintIcon />
                Printo
              </button>
            </div>
          }
        />

        <div style={summaryGridStyle}>
          <SummaryItem label="Produkte" value={String(sortedLines.length)} />
          <SummaryItem label="Progresi" value={`${pickedCount}/${sortedLines.length}`} />
          <SummaryItem label="Sasia totale" value={formatQty(totalQuantity)} />
          <SummaryItem label="Rezervuar" value={formatQty(reservedQuantity)} />
        </div>

        <SurfaceCard style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <div style={progressTrackStyle}>
            <div style={{ ...progressFillStyle, width: `${progressPercent}%` }} />
          </div>
        </SurfaceCard>

        {sortedLines.length === 0 ? (
          <SurfaceCard style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800 }}>Nuk ka produkte per pergatitje.</div>
          </SurfaceCard>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
            {groups.map((group) => (
              <SurfaceCard key={group.key} style={{ padding: 0, overflow: "hidden" }}>
                <div style={groupHeaderStyle}>
                  <div>
                    <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.08em" }}>
                      Shporta
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>
                      {group.binCode}
                    </div>
                  </div>
                  <div style={groupStatsStyle}>
                    {group.pickedCount}/{group.lines.length} produkte • Totali sasise: {formatQty(group.totalQuantity)}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 0 }}>
                  {group.lines.map((line) => (
                    <PickLine
                      key={line.id}
                      line={line}
                      checked={!!checked[line.id]}
                      onToggle={() => toggleLine(line.id)}
                    />
                  ))}
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
      ) : null}

      {printMode ? (
        <PickListPrintDocument
          checked={checked}
          doc={doc}
          lines={sortedLines}
          pickedCount={pickedCount}
          printedAt={printedAt}
          totalQuantity={totalQuantity}
        />
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard style={summaryItemStyle}>
      <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </SurfaceCard>
  );
}

function PickListPrintDocument({
  checked,
  doc,
  lines,
  pickedCount,
  printedAt,
  totalQuantity,
}: {
  checked: Record<string, boolean>;
  doc: OutboundDetailsDto;
  lines: OutboundLine[];
  pickedCount: number;
  printedAt: Date;
  totalQuantity: number;
}) {
  const status = statusLabel(doc.status);

  return (
    <section className="pick-list-print" aria-hidden="true">
      {doc.status === 0 ? <div className="pick-list-print-watermark">DRAFT</div> : null}

      <header className="pick-list-print-header">
        <div>
          <img className="pick-list-print-brand-logo" src={smdPrintLogo} alt="SMD" />
          <h1>Lista e Pergatitjes</h1>
          <div className="pick-list-print-subtitle">Dokumenti dales • {doc.documentNo}</div>
        </div>

        <div className="pick-list-print-status">
          <div>Statusi</div>
          <strong>{status}</strong>
        </div>
      </header>

      <div className="pick-list-print-meta">
        <div>
          <p><strong>Nr. Dokumentit:</strong> {doc.documentNo}</p>
          <p><strong>Klienti:</strong> {doc.customerName ? `${doc.customerCode ? `${doc.customerCode} - ` : ""}${doc.customerName}` : "-"}</p>
          <p><strong>Referenca:</strong> {doc.reference || "-"}</p>
          <p><strong>Shenimi:</strong> {doc.note || "-"}</p>
        </div>

        <div>
          <p><strong>Data e krijimit:</strong> {formatDateTime(doc.createdAt)}</p>
          <p><strong>Data e printimit:</strong> {formatDateTime(printedAt)}</p>
          <p><strong>Produkte:</strong> {lines.length}</p>
          <p><strong>Progresi:</strong> {pickedCount}/{lines.length}</p>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="pick-list-print-empty">Ky dokument nuk ka produkte per pergatitje.</div>
      ) : (
        <table className="pick-list-print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Gati</th>
              <th>SKU</th>
              <th>Barkodi</th>
              <th>Produkti</th>
              <th>Shporta</th>
              <th>Sasia</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td className="pick-list-print-check">{checked[line.id] ? "✓" : ""}</td>
                <td>{line.productSku || "-"}</td>
                <td>{line.productBarcode || "-"}</td>
                <td>
                  <strong>{line.productName || "-"}</strong>
                  {line.productDescription ? <span>{line.productDescription}</span> : null}
                  {(line.lotNumber || line.batchNumber || line.expiryDate) ? (
                    <small>
                      {line.lotNumber ? `Seria: ${line.lotNumber}` : null}
                      {line.lotNumber && (line.batchNumber || line.expiryDate) ? " • " : null}
                      {line.batchNumber ? `Grupi: ${line.batchNumber}` : null}
                      {line.batchNumber && line.expiryDate ? " • " : null}
                      {line.expiryDate ? `Skadon: ${formatDateOnly(line.expiryDate)}` : null}
                    </small>
                  ) : null}
                </td>
                <td>{line.fromBinCode || line.fromBinName || "-"}</td>
                <td>{formatQty(line.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pick-list-print-summary">
        <strong>Permbledhje</strong>
        <p>Totali i produkteve: <strong>{lines.length}</strong></p>
        <p>Totali i sasise: <strong>{formatQty(totalQuantity)}</strong></p>
        <p>Produkte te pergatitura: <strong>{pickedCount}/{lines.length}</strong></p>
        <p>Statusi i dokumentit: <strong>{status}</strong></p>
      </div>

      <div className="pick-list-print-signatures">
        <div><strong>Pergatiti</strong><span /></div>
        <div><strong>Kontrolloi</strong><span /></div>
        <div><strong>Data / Nenshkrimi</strong><span /></div>
      </div>

      <footer>Gjeneruar nga SMD</footer>
    </section>
  );
}

function PickLine({ line, checked, onToggle }: { line: OutboundLine; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="pick-list-line" onClick={onToggle} style={lineButtonStyle(checked)}>
      <span style={checkboxStyle(checked)} aria-hidden="true">
        {checked ? <CheckIcon /> : null}
      </span>

      <span style={{ minWidth: 0, display: "grid", gap: 8 }}>
        <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 900 }}>{line.productSku ?? "-"}</span>
          <span style={{ color: "var(--text)" }}>{line.productName ?? "-"}</span>
          {line.productBarcode ? <span style={chipStyle}>Barcode: {line.productBarcode}</span> : null}
        </span>

        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {line.lotNumber ? <span style={chipStyle}>Seria: {line.lotNumber}</span> : null}
          {line.batchNumber ? <span style={chipStyle}>Grupi: {line.batchNumber}</span> : null}
          <span style={line.expiryDate ? expiryChipStyle : chipStyle}>Skadon: {formatDateOnly(line.expiryDate)}</span>
        </span>
      </span>

      <span style={quantityBoxStyle}>
        <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sasia</span>
        <span style={{ fontSize: 28, fontWeight: 950, lineHeight: 1 }}>{formatQty(line.quantity)}</span>
      </span>
    </button>
  );
}

function IconShell({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function BackIcon() {
  return (
    <IconShell>
      <path d="M6.5 3.5L2.5 8L6.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8H13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </IconShell>
  );
}

function PrintIcon() {
  return (
    <IconShell>
      <path d="M4.5 6V2.75H11.5V6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4.5 10.5H3.5C2.95 10.5 2.5 10.05 2.5 9.5V6.5C2.5 5.95 2.95 5.5 3.5 5.5H12.5C13.05 5.5 13.5 5.95 13.5 6.5V9.5C13.5 10.05 13.05 10.5 12.5 10.5H11.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 8.5H11.5V13.25H4.5V8.5Z" stroke="currentColor" strokeWidth="1.3" />
    </IconShell>
  );
}

function ResetIcon() {
  return (
    <IconShell>
      <path d="M4.5 5.25H2.75V3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.1 5.15C4.05 3.55 5.78 2.5 7.75 2.5C10.79 2.5 13.25 4.96 13.25 8C13.25 11.04 10.79 13.5 7.75 13.5C5.78 13.5 4.05 12.45 3.1 10.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </IconShell>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.25L6.5 11.25L12.5 4.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const buttonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid color-mix(in srgb, var(--accent) 58%, var(--border))",
  background: "color-mix(in srgb, var(--accent) 24%, var(--panel-soft))",
  color: "var(--accent-strong)",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const summaryItemStyle: CSSProperties = {
  padding: "12px 13px",
  borderRadius: 12,
};

const progressTrackStyle: CSSProperties = {
  height: 10,
  width: "100%",
  background: "color-mix(in srgb, var(--panel-soft) 80%, black)",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, var(--accent), var(--success))",
  transition: "width 160ms ease",
};

const groupHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 16,
  borderBottom: "1px solid var(--border)",
  background: "color-mix(in srgb, var(--panel-strong) 72%, transparent)",
};

const groupStatsStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  background: "var(--panel-soft)",
  border: "1px solid var(--border)",
  color: "var(--muted-strong)",
  fontWeight: 800,
};

function lineButtonStyle(checked: boolean): CSSProperties {
  return {
    width: "100%",
    border: 0,
    borderBottom: "1px solid var(--border)",
    borderRadius: 0,
    padding: "14px 16px",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) minmax(110px, 140px)",
    gap: 14,
    alignItems: "center",
    textAlign: "left",
    background: checked ? "rgba(34, 197, 94, 0.10)" : "transparent",
    color: "var(--text)",
    boxShadow: "none",
  };
}

function checkboxStyle(checked: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "inline-grid",
    placeItems: "center",
    border: checked ? "1px solid rgba(34, 197, 94, 0.62)" : "1px solid var(--border-strong)",
    background: checked ? "rgba(34, 197, 94, 0.18)" : "var(--panel-soft)",
    color: checked ? "#bbf7d0" : "var(--muted)",
  };
}

const chipStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--muted-strong)",
  fontSize: 12,
  fontWeight: 700,
};

const expiryChipStyle: CSSProperties = {
  ...chipStyle,
  border: "1px solid rgba(245, 158, 11, 0.34)",
  background: "rgba(245, 158, 11, 0.10)",
  color: "#fde68a",
};

const quantityBoxStyle: CSSProperties = {
  justifySelf: "end",
  minWidth: 110,
  display: "grid",
  justifyItems: "end",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
};
