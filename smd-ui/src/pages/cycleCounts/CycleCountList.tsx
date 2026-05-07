import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createCycleCount, listCycleCounts } from "../../services/cycleCounts";
import { searchBins, type BinHitDto } from "../../services/bins";
import type { CycleCountListItemDto, CycleCountStatus } from "../../types/cycleCounts";

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

const buttonPrimaryStyle: CSSProperties = {
  borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 26%, var(--panel-strong)), color-mix(in srgb, var(--accent) 10%, var(--panel-soft)))",
};

const buttonSoftStyle: CSSProperties = {
  background: "var(--panel-soft)",
};

function statusLabel(status: CycleCountStatus) {
  if (status === "Completed") return "Perfunduar";
  if (status === "Cancelled") return "Anuluar";
  return "Draft";
}

function statusTone(status: CycleCountStatus) {
  if (status === "Completed") return "color-mix(in srgb, var(--success) 16%, var(--panel-soft))";
  if (status === "Cancelled") return "color-mix(in srgb, var(--danger) 14%, var(--panel-soft))";
  return "color-mix(in srgb, var(--accent-warm) 16%, var(--panel-soft))";
}

function formatQty(value: number) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 2 }).format(value ?? 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sq-AL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CycleCountList() {
  const nav = useNavigate();
  const [items, setItems] = useState<CycleCountListItemDto[]>([]);
  const [status, setStatus] = useState<CycleCountStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [binTerm, setBinTerm] = useState("");
  const [binHits, setBinHits] = useState<BinHitDto[]>([]);
  const [selectedBin, setSelectedBin] = useState<BinHitDto | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    listCycleCounts(status, ac.signal)
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Nuk u lexuan numerimet.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [status]);

  useEffect(() => {
    const q = binTerm.trim();
    if (selectedBin || q.length < 2) {
      setBinHits([]);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      searchBins(q, ac.signal)
        .then(setBinHits)
        .catch(() => {
          if (!ac.signal.aborted) setBinHits([]);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [binTerm, selectedBin]);

  const summary = useMemo(
    () => ({
      draft: items.filter((x) => x.status === "Draft").length,
      completed: items.filter((x) => x.status === "Completed").length,
      variance: items.reduce((sum, item) => sum + item.varianceQty, 0),
    }),
    [items]
  );

  async function onCreate() {
    if (!selectedBin) {
      setError("Zgjidh fillimisht shporten qe do numerosh.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await createCycleCount({
        binId: selectedBin.id,
        onlyWithStock: true,
        reference: reference || null,
        note: note || null,
      });
      nav(`/cycle-counts/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Numerimi nuk u krijua.");
    } finally {
      setCreating(false);
    }
  }

  function selectBin(bin: BinHitDto) {
    setSelectedBin(bin);
    setBinTerm(`${bin.code} - ${bin.name}`);
    setBinHits([]);
  }

  function clearBin() {
    setSelectedBin(null);
    setBinTerm("");
    setBinHits([]);
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...panelStyle, padding: "clamp(18px, 2.2vw, 28px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.08em" }}>
              Inventari
            </div>
            <h1 style={{ margin: "6px 0 6px", fontSize: "clamp(28px, 3vw, 42px)", lineHeight: 1.08 }}>Numerimi i inventarit</h1>
            <p style={{ ...mutedStyle, maxWidth: 760, fontSize: 16 }}>
              Nderto nje numerim per shporte, vendos sasine fizike qe u numerua dhe perfundoje per te krijuar korrigjimet ne stok.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10, minWidth: "min(100%, 420px)" }}>
            <Kpi title="Draft" value={summary.draft} />
            <Kpi title="Perfunduar" value={summary.completed} />
            <Kpi title="Diferenca" value={formatQty(summary.variance)} />
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...panelStyle, padding: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Nderto numerim</h2>
          <p style={mutedStyle}>Per testim praktik, fillojme me numerim sipas nje shporte.</p>

          <div style={{ position: "relative", display: "grid", gap: 10, marginTop: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Shporta</span>
              <input
                value={binTerm}
                onChange={(e) => {
                  setSelectedBin(null);
                  setBinTerm(e.target.value);
                }}
                placeholder="Kerko shporte me kod ose emer"
                style={inputStyle}
              />
            </label>

            {selectedBin ? (
              <div style={{ padding: 12, borderRadius: 14, background: "var(--panel-soft)", border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 800 }}>{selectedBin.code}</div>
                <div style={mutedStyle}>{selectedBin.name}</div>
                <div style={{ ...mutedStyle, marginTop: 4 }}>
                  {selectedBin.warehouseCode} / {selectedBin.zoneCode} / {selectedBin.rackCode}
                </div>
                <button type="button" onClick={clearBin} style={{ ...buttonSoftStyle, marginTop: 10 }}>
                  Ndrysho shporten
                </button>
              </div>
            ) : binHits.length > 0 ? (
              <div
                style={{
                  position: "absolute",
                  top: 74,
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  display: "grid",
                  gap: 6,
                  padding: 8,
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "var(--panel-strong)",
                  boxShadow: "var(--shadow)",
                }}
              >
                {binHits.slice(0, 8).map((bin) => (
                  <button key={bin.id} type="button" onMouseDown={() => selectBin(bin)} style={{ textAlign: "left", ...buttonSoftStyle }}>
                    <strong>{bin.code}</strong>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                      {bin.name} · {bin.warehouseCode}/{bin.zoneCode}/{bin.rackCode}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Reference</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="p.sh. Kontroll mujor" style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Shenim</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsionale" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </label>

            <button type="button" onClick={onCreate} disabled={creating || !selectedBin} style={buttonPrimaryStyle}>
              {creating ? "Duke ndertuar..." : "Nderto numerim"}
            </button>
          </div>
        </div>

        <div style={{ ...panelStyle, overflow: "hidden" }}>
          <div style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Numerimet</h2>
              <div style={mutedStyle}>{loading ? "Duke u lexuar..." : `${items.length} rezultate`}</div>
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as CycleCountStatus | "")} style={{ background: "var(--panel-soft)" }}>
              <option value="">Te gjitha</option>
              <option value="Draft">Draft</option>
              <option value="Completed">Perfunduar</option>
              <option value="Cancelled">Anuluar</option>
            </select>
          </div>

          {error ? (
            <div style={{ margin: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(239,68,68,0.32)", background: "rgba(239,68,68,0.10)", color: "#ffd2d2" }}>
              {error}
            </div>
          ) : null}

          <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }}>
                  <th style={thStyle}>Numerimi</th>
                  <th style={thStyle}>Statusi</th>
                  <th style={thStyle}>Fusha</th>
                  <th style={thStyle}>Progresi</th>
                  <th style={thStyle}>Diferenca</th>
                  <th style={thStyle}>Ndertuar</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <Link to={`/cycle-counts/${item.id}`} style={{ fontWeight: 850, color: "var(--text)" }}>
                        {item.countNo}
                      </Link>
                      {item.reference ? <div style={mutedStyle}>{item.reference}</div> : null}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-flex", padding: "6px 10px", borderRadius: 999, background: statusTone(item.status), border: "1px solid var(--border)", fontWeight: 750 }}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td style={tdStyle}>{item.scopeLabel}</td>
                    <td style={tdStyle}>
                      <strong>
                        {item.countedLineCount}/{item.lineCount}
                      </strong>
                      <div style={mutedStyle}>rreshta</div>
                    </td>
                    <td style={{ ...tdStyle, color: item.varianceQty === 0 ? "var(--text)" : "var(--accent-warm)", fontWeight: 850 }}>{formatQty(item.varianceQty)}</td>
                    <td style={tdStyle}>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", padding: 28 }}>
                      Nuk ka numerime per kete filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, background: "var(--panel-soft)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div>
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
