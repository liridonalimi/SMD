import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createReturnDraft, listReturns } from "../../services/returns";
import { listCustomersLookup, listSuppliersLookup } from "../../services/partners";
import type { DocumentStatus } from "../../types/documents";
import type { PartnerLookupDto } from "../../types/partners";
import type { ReturnDocumentType, ReturnListItem } from "../../types/returns";

const panelStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 18,
  background: "linear-gradient(180deg, color-mix(in srgb, var(--panel) 96%, transparent), color-mix(in srgb, var(--panel-soft) 100%, transparent))",
  boxShadow: "var(--shadow)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--panel-soft)",
};

const mutedStyle: CSSProperties = {
  color: "var(--muted)",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 26%, var(--panel-strong)), color-mix(in srgb, var(--accent) 10%, var(--panel-soft)))",
};

function typeLabel(type: ReturnDocumentType) {
  return type === 1 ? "Kthim nga klienti" : "Kthim te furnizuesi";
}

function partnerSelectLabel(type: ReturnDocumentType) {
  return type === 1 ? "Zgjidh klientin" : "Zgjidh furnizuesin";
}

function statusLabel(status: DocumentStatus) {
  if (status === 1) return "Konfirmuar";
  if (status === 2) return "Anuluar";
  return "Draft";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("sq-AL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0)} €`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sq-AL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ReturnsList() {
  const nav = useNavigate();
  const [items, setItems] = useState<ReturnListItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<ReturnDocumentType | "">("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftType, setDraftType] = useState<ReturnDocumentType>(1);
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<PartnerLookupDto[]>([]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    listReturns({ type: typeFilter, status: statusFilter }, ac.signal)
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Kthimet nuk u lexuan.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    const ac = new AbortController();
    const load = draftType === 1 ? listCustomersLookup : listSuppliersLookup;
    load(undefined, ac.signal)
      .then(setPartners)
      .catch(() => setPartners([]));
    setPartnerId("");
    return () => ac.abort();
  }, [draftType]);

  const summary = useMemo(
    () => ({
      draft: items.filter((x) => x.status === 0).length,
      confirmed: items.filter((x) => x.status === 1).length,
      total: items.reduce((sum, item) => sum + item.documentTotal, 0),
    }),
    [items]
  );

  async function onCreate() {
    if (!partnerId) {
      setError(draftType === 1 ? "Zgjidh klientin per kthim." : "Zgjidh furnizuesin per kthim.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await createReturnDraft({
        type: draftType,
        customerId: draftType === 1 ? partnerId : null,
        supplierId: draftType === 2 ? partnerId : null,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      nav(`/returns/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kthimi nuk u ndertua.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...panelStyle, padding: "clamp(18px, 2.2vw, 28px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.08em" }}>Dokumente</div>
            <h1 style={{ margin: "6px 0 6px", fontSize: "clamp(28px, 3vw, 42px)", lineHeight: 1.08 }}>Kthimet</h1>
            <p style={{ ...mutedStyle, maxWidth: 760, fontSize: 16 }}>
              Menaxho kthimet nga klientet dhe kthimet te furnizuesit me ndikim direkt ne stok dhe bilance.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10, minWidth: "min(100%, 420px)" }}>
            <Kpi title="Draft" value={summary.draft} />
            <Kpi title="Konfirmuar" value={summary.confirmed} />
            <Kpi title="Vlera" value={formatMoney(summary.total)} />
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...panelStyle, padding: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Krijo kthim</h2>
          <div style={mutedStyle}>Zgjidh llojin dhe partnerin, pastaj shto produktet ne detaje.</div>

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Lloji</span>
              <select value={draftType} onChange={(e) => setDraftType(Number(e.target.value) as ReturnDocumentType)} style={inputStyle}>
                <option value={1}>Kthim nga klienti</option>
                <option value={2}>Kthim te furnizuesi</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>{draftType === 1 ? "Klienti" : "Furnizuesi"}</span>
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={inputStyle}>
                <option value="">{partnerSelectLabel(draftType)}</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.code} - {partner.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Reference</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="p.sh. RMA-2026-001" style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Shenim</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Arsyeja e kthimit" style={{ ...inputStyle, resize: "vertical" }} />
            </label>

            <button type="button" onClick={onCreate} disabled={creating || !partnerId} style={primaryButtonStyle}>
              {creating ? "Duke ndertuar..." : "Nderto kthimin"}
            </button>
          </div>
        </div>

        <div style={{ ...panelStyle, overflow: "hidden" }}>
          <div style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Lista</h2>
              <div style={mutedStyle}>{loading ? "Duke u lexuar..." : `${items.length} kthime`}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value === "" ? "" : Number(e.target.value) as ReturnDocumentType)} style={{ background: "var(--panel-soft)" }}>
                <option value="">Te gjitha</option>
                <option value={1}>Nga klienti</option>
                <option value={2}>Te furnizuesi</option>
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value === "" ? "" : Number(e.target.value) as DocumentStatus)} style={{ background: "var(--panel-soft)" }}>
                <option value="">Cdo status</option>
                <option value={0}>Draft</option>
                <option value={1}>Konfirmuar</option>
                <option value={2}>Anuluar</option>
              </select>
            </div>
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
                  <th style={thStyle}>Kthimi</th>
                  <th style={thStyle}>Lloji</th>
                  <th style={thStyle}>Statusi</th>
                  <th style={thStyle}>Partneri</th>
                  <th style={thStyle}>Rreshta</th>
                  <th style={thStyle}>Vlera</th>
                  <th style={thStyle}>Data</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <Link to={`/returns/${item.id}`} style={{ fontWeight: 850, color: "var(--text)" }}>
                        {item.documentNo}
                      </Link>
                      {item.reference ? <div style={mutedStyle}>{item.reference}</div> : null}
                    </td>
                    <td style={tdStyle}>{typeLabel(item.type)}</td>
                    <td style={tdStyle}>{statusLabel(item.status)}</td>
                    <td style={tdStyle}>{item.partnerCode ? `${item.partnerCode} - ${item.partnerName}` : "-"}</td>
                    <td style={tdStyle}>{item.linesCount}</td>
                    <td style={tdStyle}>{formatMoney(item.documentTotal)}</td>
                    <td style={tdStyle}>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", padding: 28 }}>
                      Nuk ka kthime per kete filter.
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
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{value}</div>
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
