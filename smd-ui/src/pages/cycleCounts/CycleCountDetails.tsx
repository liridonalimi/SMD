import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cancelCycleCount, completeCycleCount, getCycleCount, updateCycleCountLine } from "../../services/cycleCounts";
import type { CycleCountDetailDto, CycleCountLineDto, CycleCountStatus } from "../../types/cycleCounts";
import { isExactScanMatch, normalizeScannerValue } from "../../shared/scanner";
import { useScannerCapture } from "../../shared/useScannerCapture";
import { canApproveDocuments } from "../../shared/permissions";
import { getSessionUser } from "../../shared/session";

const panelStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 18,
  background: "linear-gradient(180deg, color-mix(in srgb, var(--panel) 96%, transparent), color-mix(in srgb, var(--panel-soft) 100%, transparent))",
  boxShadow: "var(--shadow)",
};

const mutedStyle: CSSProperties = {
  color: "var(--muted)",
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--panel-soft)",
};

const primaryButtonStyle: CSSProperties = {
  borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 26%, var(--panel-strong)), color-mix(in srgb, var(--accent) 10%, var(--panel-soft)))",
};

const dangerButtonStyle: CSSProperties = {
  borderColor: "rgba(239,68,68,0.32)",
  background: "rgba(239,68,68,0.10)",
  color: "#ffd2d2",
};

function statusLabel(status: CycleCountStatus) {
  if (status === "Completed") return "Perfunduar";
  if (status === "Cancelled") return "Anuluar";
  return "Draft";
}

function formatQty(value?: number | null) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sq-AL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toDraftValue(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function parseDraftQty(value?: string) {
  const raw = (value ?? "").trim();
  if (raw === "") return 0;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toScanDraftValue(value: number) {
  return String(value);
}

function toWholeInventoryDraftValue(value: number) {
  return String(Math.max(0, Math.trunc(value)));
}

function normalizeWholeInput(value: string) {
  return /^\d*$/.test(value) ? value : null;
}

function scanFeedbackStyle(tone: "success" | "warn" | "error"): CSSProperties {
  if (tone === "success") {
    return {
      border: "1px solid rgba(34,197,94,0.30)",
      background: "rgba(34,197,94,0.11)",
      color: "#bbf7d0",
    };
  }
  if (tone === "warn") {
    return {
      border: "1px solid rgba(245,158,11,0.30)",
      background: "rgba(245,158,11,0.12)",
      color: "#fde68a",
    };
  }
  return {
    border: "1px solid rgba(239,68,68,0.32)",
    background: "rgba(239,68,68,0.10)",
    color: "#ffd2d2",
  };
}

export default function CycleCountDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const me = getSessionUser();
  const allowApproveDocuments = canApproveDocuments(me?.role);
  const [data, setData] = useState<CycleCountDetailDto | null>(null);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [draftNote, setDraftNote] = useState<Record<string, string>>({});
  const [scanInput, setScanInput] = useState("");
  const [scanStep, setScanStep] = useState("1");
  const [lastScannedLineId, setLastScannedLineId] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ tone: "success" | "warn" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const isDraft = data?.status === "Draft";

  useEffect(() => {
    if (!id) return;

    const ac = new AbortController();
    setLoading(true);
    getCycleCount(id, ac.signal)
      .then((detail) => {
        setData(detail);
        setDraftQty(Object.fromEntries(detail.lines.map((line) => [line.id, toDraftValue(line.countedQty)])));
        setDraftNote(Object.fromEntries(detail.lines.map((line) => [line.id, line.note ?? ""])));
        setError(null);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Numerimi nuk u lexua.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [id]);

  const allDraftLinesHaveQty = useMemo(() => {
    if (!data) return false;
    return data.lines.every((line) => {
      const raw = (draftQty[line.id] ?? "").trim();
      return raw !== "" && parseDraftQty(raw) !== null;
    });
  }, [data, draftQty]);

  const changedLines = useMemo(() => {
    if (!data) return [];
    return data.lines.filter((line) => {
      const qtyChanged = (draftQty[line.id] ?? "") !== toDraftValue(line.countedQty);
      const noteChanged = (draftNote[line.id] ?? "") !== (line.note ?? "");
      return qtyChanged || noteChanged;
    });
  }, [data, draftQty, draftNote]);

  const lastScannedLine = useMemo(
    () => data?.lines.find((line) => line.id === lastScannedLineId) ?? null,
    [data, lastScannedLineId]
  );

  useEffect(() => {
    if (!isDraft) return;
    const timer = window.setTimeout(() => scanInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isDraft]);

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = window.setTimeout(() => setScanFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [scanFeedback]);

  function parseScanStep() {
    if (!/^\d+$/.test(scanStep.trim())) return null;
    const parsed = Number(scanStep);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function chooseLineForProductScan(matches: CycleCountLineDto[]) {
    const incomplete = matches.find((line) => {
      const current = parseDraftQty(draftQty[line.id]);
      return current !== null && current < line.expectedQty;
    });

    return incomplete ?? matches[0];
  }

  function applyScan(rawValue: string) {
    if (!data || !isDraft || saving) return;

    const value = normalizeScannerValue(rawValue);
    if (!value) return;

    const increment = parseScanStep();
    if (increment === null) {
      setScanFeedback({ tone: "error", message: "Sasia per scan duhet te jete numer i plote me i madh se 0." });
      return;
    }

    const productMatches = data.lines.filter((line) => isExactScanMatch(value, line.productSku, line.productBarcode));
    if (productMatches.length > 0) {
      const line = chooseLineForProductScan(productMatches);
      const current = parseDraftQty(draftQty[line.id]);

      if (current === null) {
        setScanFeedback({ tone: "error", message: `Rreshti ${line.productSku} ka sasi jo valide.` });
        setLastScannedLineId(line.id);
        return;
      }

      const nextQty = current + increment;
      setDraftQty((currentDrafts) => ({ ...currentDrafts, [line.id]: toScanDraftValue(nextQty) }));
      setLastScannedLineId(line.id);
      setError(null);
      setScanFeedback({
        tone: productMatches.length > 1 ? "warn" : "success",
        message:
          productMatches.length > 1
            ? `${line.productSku} ka disa rreshta. U rrit rreshti ${line.binCode} ne ${formatQty(nextQty)}.`
            : `${line.productSku} u numerua ${formatQty(nextQty)}.`,
      });
      return;
    }

    const binMatches = data.lines.filter((line) => isExactScanMatch(value, line.binCode));
    if (binMatches.length > 0) {
      setLastScannedLineId(binMatches[0].id);
      setScanFeedback({ tone: "success", message: `Shporta ${binMatches[0].binCode} u verifikua ne kete numerim.` });
      return;
    }

    setScanFeedback({ tone: "error", message: `Scan "${value}" nuk u gjet ne kete numerim.` });
  }

  function submitManualScan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    applyScan(scanInput);
    setScanInput("");
  }

  useScannerCapture({
    enabled: !!data && isDraft && !saving,
    onScan: applyScan,
  });

  async function reload() {
    if (!id) return;
    const detail = await getCycleCount(id);
    setData(detail);
    setDraftQty(Object.fromEntries(detail.lines.map((line) => [line.id, toDraftValue(line.countedQty)])));
    setDraftNote(Object.fromEntries(detail.lines.map((line) => [line.id, line.note ?? ""])));
    setLastScannedLineId(null);
    setScanFeedback(null);
  }

  async function saveLine(line: CycleCountLineDto) {
    if (!id) return;
    const raw = (draftQty[line.id] ?? "").trim();
    const countedQty = raw === "" ? null : parseDraftQty(raw);
    if (countedQty !== null && (!Number.isInteger(countedQty) || countedQty < 0)) {
      setError("Sasia e numeruar duhet te jete numer i plote pozitiv.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const detail = await updateCycleCountLine(id, line.id, {
        countedQty,
        note: draftNote[line.id] || null,
      });
      setData(detail);
      setDraftQty(Object.fromEntries(detail.lines.map((x) => [x.id, toDraftValue(x.countedQty)])));
      setDraftNote(Object.fromEntries(detail.lines.map((x) => [x.id, x.note ?? ""])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rreshti nuk u ruajt.");
    } finally {
      setSaving(false);
    }
  }

  async function persistChangedLines() {
    if (!id || !data) throw new Error("Numerimi nuk eshte gati per ruajtje.");

    let latest = data;
    for (const line of changedLines) {
      const raw = (draftQty[line.id] ?? "").trim();
      const countedQty = raw === "" ? null : parseDraftQty(raw);
      if (countedQty !== null && (!Number.isInteger(countedQty) || countedQty < 0)) {
        throw new Error(`Sasia per ${line.productSku} duhet te jete numer i plote pozitiv.`);
      }
      latest = await updateCycleCountLine(id, line.id, {
        countedQty,
        note: draftNote[line.id] || null,
      });
    }

    setData(latest);
    setDraftQty(Object.fromEntries(latest.lines.map((x) => [x.id, toDraftValue(x.countedQty)])));
    setDraftNote(Object.fromEntries(latest.lines.map((x) => [x.id, x.note ?? ""])));
    return latest;
  }

  async function saveAllChanged() {
    if (!id || !data || changedLines.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await persistChangedLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ndryshimet nuk u ruajten.");
    } finally {
      setSaving(false);
    }
  }

  function fillExpected() {
    if (!data || !isDraft) return;
    setDraftQty(Object.fromEntries(data.lines.map((line) => [line.id, toWholeInventoryDraftValue(line.expectedQty)])));
  }

  async function onComplete() {
    if (!id || !data) return;

    if (!allDraftLinesHaveQty) {
      setError("Ploteso sasine e numeruar per te gjitha rreshtat para perfundimit.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (changedLines.length > 0) {
        await persistChangedLines();
      }
      const detail = await completeCycleCount(id);
      setData(detail);
      setDraftQty(Object.fromEntries(detail.lines.map((line) => [line.id, toDraftValue(line.countedQty)])));
      setDraftNote(Object.fromEntries(detail.lines.map((line) => [line.id, line.note ?? ""])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Numerimi nuk u perfundua.");
    } finally {
      setSaving(false);
    }
  }

  async function onCancel() {
    if (!id || !window.confirm("A deshiron ta anulosh kete numerim?")) return;

    setSaving(true);
    setError(null);
    try {
      const detail = await cancelCycleCount(id);
      setData(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Numerimi nuk u anulua.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ ...panelStyle, padding: 24 }}>Duke u lexuar numerimi...</div>;
  }

  if (!data) {
    return (
      <div style={{ ...panelStyle, padding: 24 }}>
        <button type="button" onClick={() => nav("/cycle-counts")}>
          Kthehu
        </button>
        <p style={{ marginTop: 16 }}>{error ?? "Numerimi nuk u gjet."}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...panelStyle, padding: "clamp(18px, 2.2vw, 28px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <button type="button" onClick={() => nav("/cycle-counts")} style={{ background: "var(--panel-soft)", marginBottom: 12 }}>
              Kthehu te numerimet
            </button>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.08em" }}>
              {data.scopeLabel}
            </div>
            <h1 style={{ margin: "6px 0", fontSize: "clamp(28px, 3vw, 42px)", lineHeight: 1.08 }}>Numerimi {data.countNo}</h1>
            <div style={{ color: "var(--muted-strong)" }}>
              Statusi: <b style={{ color: "var(--text)" }}>{statusLabel(data.status)}</b> · Ndertuar: {formatDate(data.createdAt)}
            </div>
            {data.reference ? <div style={{ ...mutedStyle, marginTop: 4 }}>Reference: {data.reference}</div> : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isDraft ? (
              <>
                <button type="button" onClick={fillExpected} disabled={saving} style={{ background: "var(--panel-soft)" }}>
                  Numro te gjitha si ne inventar
                </button>
                <button type="button" onClick={saveAllChanged} disabled={saving || changedLines.length === 0} style={{ background: "var(--panel-soft)" }}>
                  Ruaj ndryshimet ({changedLines.length})
                </button>
                {allowApproveDocuments ? (
                <button type="button" onClick={onComplete} disabled={saving || !allDraftLinesHaveQty} style={primaryButtonStyle}>
                  Perfundo numerimin
                </button>
                ) : null}
                {allowApproveDocuments ? (
                <button type="button" onClick={onCancel} disabled={saving} style={dangerButtonStyle}>
                  Anulo
                </button>
                ) : null}
              </>
            ) : (
              <button type="button" onClick={reload} style={{ background: "var(--panel-soft)" }}>
                Rifresko
              </button>
            )}
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 14, border: "1px solid rgba(239,68,68,0.32)", background: "rgba(239,68,68,0.10)", color: "#ffd2d2" }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 18 }}>
          <Kpi title="Rreshta" value={`${data.countedLineCount}/${data.lineCount}`} />
          <Kpi title="Sasia ne inventar" value={formatQty(data.expectedQty)} />
          <Kpi title="Sasia numeruar" value={formatQty(data.countedQty)} />
          <Kpi title="Diferenca" value={formatQty(data.varianceQty)} tone={data.varianceQty === 0 ? undefined : "var(--accent-warm)"} />
        </div>
      </section>

      {isDraft ? (
        <section style={{ ...panelStyle, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>PDA scan</h2>
              <div style={mutedStyle}>Scan barcode, SKU ose kod shporte.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ ...mutedStyle, fontWeight: 800 }}>Pa ruajtur: {changedLines.length}</span>
              <button type="button" onClick={saveAllChanged} disabled={saving || changedLines.length === 0} style={{ background: "var(--panel-soft)" }}>
                Ruaj te skanuarat
              </button>
            </div>
          </div>

          <form
            onSubmit={submitManualScan}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
              gap: 10,
              alignItems: "end",
              marginTop: 14,
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Scan</span>
              <input
                ref={scanInputRef}
                data-smd-scanner-input="product"
                value={scanInput}
                disabled={saving}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Barcode / SKU / shporte"
                style={{ ...inputStyle, minHeight: 46, fontSize: 16 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Sasi / scan</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={scanStep}
                disabled={saving}
                onChange={(e) => {
                  const normalized = normalizeWholeInput(e.target.value);
                  if (normalized !== null) setScanStep(normalized);
                }}
                style={{ ...inputStyle, minHeight: 46, fontSize: 16 }}
              />
            </label>
            <button type="submit" disabled={saving || scanInput.trim() === ""} style={{ ...primaryButtonStyle, minHeight: 46 }}>
              Numro
            </button>
          </form>

          {scanFeedback ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 14, fontWeight: 800, ...scanFeedbackStyle(scanFeedback.tone) }}>
              {scanFeedback.message}
            </div>
          ) : null}

          {lastScannedLine ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
                background: "color-mix(in srgb, var(--accent) 10%, var(--panel-soft))",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
              }}
            >
              <div>
                <div style={mutedStyle}>Produkti i fundit</div>
                <strong>{lastScannedLine.productSku}</strong>
                <div>{lastScannedLine.productName}</div>
              </div>
              <div>
                <div style={mutedStyle}>Shporta</div>
                <strong>{lastScannedLine.binCode}</strong>
                <div style={mutedStyle}>
                  {lastScannedLine.warehouseCode}/{lastScannedLine.zoneCode}/{lastScannedLine.rackCode}
                </div>
              </div>
              <div>
                <div style={mutedStyle}>Numeruar</div>
                <strong>{formatQty(parseDraftQty(draftQty[lastScannedLine.id]) ?? 0)}</strong>
                <div style={mutedStyle}>Inventar: {formatQty(lastScannedLine.expectedQty)}</div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section style={{ ...panelStyle, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Rreshtat per numerim</h2>
            <div style={mutedStyle}>Vendos sasine fizike qe numerove ne depo.</div>
          </div>
        </div>

        <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }}>
                <th style={thStyle}>Produkti</th>
                <th style={thStyle}>Shporta</th>
                <th style={thStyle}>Seria/Grupi</th>
                <th style={thStyle}>Sasia</th>
                <th style={thStyle}>Rezervuar</th>
                <th style={thStyle}>Numeruar</th>
                <th style={thStyle}>Diferenca</th>
                <th style={thStyle}>Shenim</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => {
                const raw = draftQty[line.id] ?? "";
                const parsed = raw.trim() === "" ? null : parseDraftQty(raw);
                const draftVariance = parsed === null || !Number.isFinite(parsed) ? null : parsed - line.expectedQty;
                return (
                  <tr
                    key={line.id}
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: line.id === lastScannedLineId ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined,
                    }}
                  >
                    <td style={tdStyle}>
                      <strong>{line.productSku}</strong>
                      <div>{line.productName}</div>
                      {line.productBarcode ? <div style={mutedStyle}>Barcode: {line.productBarcode}</div> : null}
                    </td>
                    <td style={tdStyle}>
                      <strong>{line.binCode}</strong>
                      <div style={mutedStyle}>{line.binName}</div>
                      <div style={mutedStyle}>
                        {line.warehouseCode}/{line.zoneCode}/{line.rackCode}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div>{line.lotNumber || "-"}</div>
                      <div style={mutedStyle}>{line.batchNumber || "-"}</div>
                      <div style={mutedStyle}>{line.expiryDate ? new Date(line.expiryDate).toLocaleDateString("sq-AL") : "-"}</div>
                    </td>
                    <td style={tdStyle}>
                      <strong>{formatQty(line.expectedQty)}</strong>
                    </td>
                    <td style={tdStyle}>{formatQty(line.reservedQty)}</td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={raw}
                        disabled={!isDraft || saving}
                        onChange={(e) => {
                          const normalized = normalizeWholeInput(e.target.value);
                          if (normalized !== null) {
                            setDraftQty((current) => ({ ...current, [line.id]: normalized }));
                          }
                        }}
                        style={{ ...inputStyle, minWidth: 110 }}
                      />
                    </td>
                    <td style={{ ...tdStyle, color: draftVariance === null || draftVariance === 0 ? "var(--text)" : "var(--accent-warm)", fontWeight: 850 }}>
                      {draftVariance === null ? "-" : formatQty(draftVariance)}
                    </td>
                    <td style={tdStyle}>
                      <input
                        value={draftNote[line.id] ?? ""}
                        disabled={!isDraft || saving}
                        onChange={(e) => setDraftNote((current) => ({ ...current, [line.id]: e.target.value }))}
                        placeholder="Opsionale"
                        style={{ ...inputStyle, minWidth: 150 }}
                      />
                    </td>
                    <td style={tdStyle}>
                      {isDraft ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setDraftQty((current) => ({ ...current, [line.id]: toWholeInventoryDraftValue(line.expectedQty) }))}
                            style={{ background: "var(--panel-soft)" }}
                          >
                            Numro si ne inventar
                          </button>
                          <button type="button" disabled={saving} onClick={() => saveLine(line)} style={{ background: "var(--panel-soft)" }}>
                            Ruaj
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ title, value, tone }: { title: string; value: string; tone?: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, background: "var(--panel-soft)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, color: tone }}>{value}</div>
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: "12px 14px",
  fontWeight: 800,
};

const tdStyle: CSSProperties = {
  padding: "14px",
  verticalAlign: "top",
};
