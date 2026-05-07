import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { confirmOutbound, getOutboundListSummary, listOutbound, outboundPdfUrl } from "../../services/outbound";
import type { DocumentListItem, DocumentStatus, OutboundListSummary } from "../../types/documents";
import type { ListParams } from "../../types/list";
import { errorMessage } from "../../shared/errors";
import { UI } from "../../shared/uiText";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { PageIntro } from "../../shared/ui/PageIntro";
import { FieldLabel } from "../../shared/ui/FieldLabel";
import { toStatus } from "../../shared/documentStatus";
import { downloadFile } from "../../services/download";
import { getSessionUser } from "../../shared/session";
import { canConfirmDocument } from "../../shared/documentPermissions";

function parseNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStatus(v: string | null): DocumentStatus | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return n === 0 || n === 1 || n === 2 ? (n as DocumentStatus) : undefined;
}

function parseBool(v: string | null) {
  return v === "true";
}

function parsePaymentStatus(v: string | null): string | undefined {
  return v === "unpaid" || v === "partial" || v === "paid" || v === "novalue" ? v : undefined;
}

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatListDate(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value: number | undefined | null) {
  const formatted = new Intl.NumberFormat("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
  return `${formatted} €`;
}

function paymentTone(item: DocumentListItem): "danger" | "warn" | "success" {
  if ((item.paidTotal ?? 0) <= 0) return "danger";
  if ((item.balance ?? 0) > 0) return "warn";
  return "success";
}

function paymentBadgeStyle(tone: "danger" | "warn" | "success"): React.CSSProperties {
  if (tone === "danger") {
    return {
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      whiteSpace: "nowrap",
      background: "rgba(239, 68, 68, 0.16)",
      color: "#fecaca",
      border: "1px solid rgba(239, 68, 68, 0.30)",
    };
  }
  if (tone === "warn") {
    return {
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      whiteSpace: "nowrap",
      background: "rgba(245, 158, 11, 0.16)",
      color: "#fde68a",
      border: "1px solid rgba(245, 158, 11, 0.30)",
    };
  }
  return {
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    background: "rgba(34, 197, 94, 0.16)",
    color: "#bbf7d0",
    border: "1px solid rgba(34, 197, 94, 0.30)",
  };
}

function sortLabel(value: string) {
  switch (value) {
    case "createdat_asc":
      return "Data dokumentit ne rritje";
    case "createdat_desc":
      return "Data dokumentit ne zbritje";
    case "documentNo_asc":
      return "Numri dokumentit A-Z";
    case "documentNo_desc":
      return "Numri dokumentit Z-A";
    case "status_asc":
      return "Statusi ne rritje";
    case "status_desc":
      return "Statusi ne zbritje";
    default:
      return value;
  }
}

function statusLabel(value: DocumentStatus) {
  if (value === 0) return "Ne pergatitje";
  if (value === 1) return "Konfirmuar";
  return "Anuluar";
}

function paymentStatusLabel(value: string) {
  switch (value) {
    case "unpaid":
      return "I papaguar";
    case "partial":
      return "I paguar pjeserisht";
    case "paid":
      return "I paguar plotesisht";
    case "novalue":
      return "Pa vlere";
    default:
      return value;
  }
}

const actionBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "inherit",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const confirmActionBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: "color-mix(in srgb, var(--success) 22%, var(--panel-soft))",
  border: "1px solid color-mix(in srgb, var(--success) 48%, var(--border))",
  color: "var(--success)",
  boxShadow: "0 8px 18px color-mix(in srgb, var(--success) 16%, transparent)",
};

const metaChipStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(255,255,255,0.03)",
  fontSize: 12,
  lineHeight: 1.35,
};

function warningChipStyle(tone: "warn" | "info"): React.CSSProperties {
  return tone === "warn"
    ? {
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
        background: "color-mix(in srgb, var(--accent-warm) 16%, var(--panel-soft))",
        color: "var(--accent-warm)",
        border: "1px solid color-mix(in srgb, var(--accent-warm) 38%, var(--border))",
      }
    : {
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
        background: "color-mix(in srgb, var(--accent) 16%, var(--panel-soft))",
        color: "var(--accent-strong)",
        border: "1px solid color-mix(in srgb, var(--accent) 38%, var(--border))",
      };
}

export default function OutboundList() {
  const nav = useNavigate();
  const [items, setItems] = useState<DocumentListItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [summary, setSummary] = useState<OutboundListSummary | null>(null);
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState<string>(() => sp.get("q") ?? "");
  const [status, setStatus] = useState<DocumentStatus | undefined>(() => parseStatus(sp.get("status")));
  const [from, setFrom] = useState<string | undefined>(() => sp.get("from") ?? undefined);
  const [to, setTo] = useState<string | undefined>(() => sp.get("to") ?? undefined);
  const [emptyOnly, setEmptyOnly] = useState<boolean>(() => parseBool(sp.get("emptyOnly")));
  const [attentionOnly, setAttentionOnly] = useState<boolean>(() => parseBool(sp.get("attentionOnly")));
  const [paymentStatus, setPaymentStatus] = useState<string | undefined>(() => parsePaymentStatus(sp.get("paymentStatus")));
  const [page, setPage] = useState<number>(() => parseNum(sp.get("page"), 1));
  const [pageSize] = useState<number>(() => parseNum(sp.get("pageSize"), 10));
  const [sort, setSort] = useState<string>(() => sp.get("sort") ?? "createdat_desc");
  const [qDebounced, setQDebounced] = useState(q);
  const isSyncingFromUrl = useRef(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const me = useMemo(() => getSessionUser(), []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1200);
  }

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    isSyncingFromUrl.current = true;
    setQ(sp.get("q") ?? "");
    setStatus(parseStatus(sp.get("status")));
    setFrom(sp.get("from") ?? undefined);
    setTo(sp.get("to") ?? undefined);
    setEmptyOnly(parseBool(sp.get("emptyOnly")));
    setAttentionOnly(parseBool(sp.get("attentionOnly")));
    setPaymentStatus(parsePaymentStatus(sp.get("paymentStatus")));
    setPage(parseNum(sp.get("page"), 1));
    setSort(sp.get("sort") ?? "createdat_desc");
    queueMicrotask(() => {
      isSyncingFromUrl.current = false;
    });
  }, [sp]);

  const params: ListParams = useMemo(
    () => ({
      q: qDebounced.trim() ? qDebounced.trim() : undefined,
      status,
      from,
      to,
      emptyOnly,
      attentionOnly,
      paymentStatus,
      page,
      pageSize,
      sort,
    }),
    [attentionOnly, emptyOnly, from, page, pageSize, paymentStatus, qDebounced, sort, status, to]
  );

  const summaryCards = useMemo(() => {
    if (summary) {
      return {
        totalDocuments: summary.totalDocuments,
        draftCount: summary.draftCount,
        confirmedCount: summary.confirmedCount,
        emptyDocumentsCount: summary.emptyDocumentsCount,
        attentionCount: summary.attentionCount,
      };
    }

    let draftCount = 0;
    let confirmedCount = 0;
    let emptyDocumentsCount = 0;
    let attentionCount = 0;
    for (const item of items) {
      const normalizedStatus = toStatus(item.status);
      if (normalizedStatus === 0) draftCount += 1;
      if (normalizedStatus === 1) confirmedCount += 1;
      if ((item.linesCount ?? 0) === 0) emptyDocumentsCount += 1;
      if (
        (item.linesCount ?? 0) === 0
        || !item.reference?.trim()
        || !item.note?.trim()
        || (normalizedStatus === 0 && (item.linesCount ?? 0) > 0)
      ) {
        attentionCount += 1;
      }
    }
    return { totalDocuments: total, draftCount, confirmedCount, emptyDocumentsCount, attentionCount };
  }, [items, summary, total]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleCount = items.length;

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (qDebounced.trim()) chips.push(`Kerkim: ${qDebounced.trim()}`);
    if (status !== undefined) chips.push(`Statusi: ${statusLabel(status)}`);
    if (paymentStatus) chips.push(`Pagesa: ${paymentStatusLabel(paymentStatus)}`);
    if (emptyOnly) chips.push("Vetem pa rreshta");
    if (attentionOnly) chips.push("Kerkon vemendje");
    if (from && to) chips.push("Data: Sot");
    else if (from) chips.push("Ka date fillimi");
    else if (to) chips.push("Ka date mbarimi");
    if (sort !== "createdat_desc") chips.push(`Renditja: ${sortLabel(sort)}`);

    return chips;
  }, [attentionOnly, emptyOnly, from, paymentStatus, qDebounced, sort, status, to]);

  const hasActiveFilters = activeFilterChips.length > 0;

  useEffect(() => {
    if (isSyncingFromUrl.current) return;
    const next = new URLSearchParams(sp);
    next.set("page", String(page));
    next.set("pageSize", String(pageSize));
    if (q.trim()) next.set("q", q.trim()); else next.delete("q");
    if (status === undefined) next.delete("status"); else next.set("status", String(status));
    if (from) next.set("from", from); else next.delete("from");
    if (to) next.set("to", to); else next.delete("to");
    if (emptyOnly) next.set("emptyOnly", "true"); else next.delete("emptyOnly");
    if (attentionOnly) next.set("attentionOnly", "true"); else next.delete("attentionOnly");
    if (paymentStatus) next.set("paymentStatus", paymentStatus); else next.delete("paymentStatus");
    if (sort) next.set("sort", sort); else next.delete("sort");
    if (next.toString() !== sp.toString()) setSp(next, { replace: true });
  }, [attentionOnly, emptyOnly, from, page, pageSize, paymentStatus, q, sort, sp, status, to, setSp]);

  function requestRefresh() {
    setRefreshKey((k) => k + 1);
  }

  function clearFilters() {
    setQ("");
    setStatus(undefined);
    setFrom(undefined);
    setTo(undefined);
    setEmptyOnly(false);
    setAttentionOnly(false);
    setPaymentStatus(undefined);
    setSort("createdat_desc");
    setPage(1);
  }

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    listOutbound(params, ac.signal)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [params, refreshKey]);

  useEffect(() => {
    const ac = new AbortController();
    getOutboundListSummary(params, ac.signal)
      .then(setSummary)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Failed to load outbound summary", e);
        setSummary(null);
      });
    return () => ac.abort();
  }, [params, refreshKey]);

  function applyQuickFilter(kind: "all" | "draft" | "confirmed" | "empty" | "attention" | "today") {
    setPage(1);
    if (kind === "all") {
      setStatus(undefined); setFrom(undefined); setTo(undefined); setEmptyOnly(false); setAttentionOnly(false); setPaymentStatus(undefined); return;
    }
    if (kind === "draft") {
      setStatus(0); setFrom(undefined); setTo(undefined); setEmptyOnly(false); setAttentionOnly(false); setPaymentStatus(undefined); return;
    }
    if (kind === "confirmed") {
      setStatus(1); setFrom(undefined); setTo(undefined); setEmptyOnly(false); setAttentionOnly(false); setPaymentStatus(undefined); return;
    }
    if (kind === "empty") {
      setStatus(undefined); setFrom(undefined); setTo(undefined); setEmptyOnly(true); setAttentionOnly(false); setPaymentStatus(undefined); return;
    }
    if (kind === "attention") {
      setStatus(undefined); setFrom(undefined); setTo(undefined); setEmptyOnly(false); setAttentionOnly(true); setPaymentStatus(undefined); return;
    }
    const today = getTodayRange();
    setStatus(undefined); setFrom(today.from); setTo(today.to); setEmptyOnly(false); setAttentionOnly(false); setPaymentStatus(undefined);
  }

  const quickFilterButtons = [
    { key: "all", label: "Te gjitha" },
    { key: "draft", label: "Ne pergatitje" },
    { key: "confirmed", label: "Te konfirmuara" },
    { key: "empty", label: "Dokumente bosh" },
    { key: "attention", label: "Per kontroll" },
    { key: "today", label: "Sot" },
  ] as const;

  const activeQuickFilter =
    attentionOnly ? "attention"
      : emptyOnly ? "empty"
      : status === 0 && !from && !to ? "draft"
      : status === 1 && !from && !to ? "confirmed"
      : status === undefined && !!from && !!to ? "today"
      : status === undefined && !from && !to && !emptyOnly && !attentionOnly && !paymentStatus ? "all"
      : null;

  return (
    <div>
      <PageIntro
        title={UI.document.outboundTitle}
        subtitle="Kontrollo dokumentet dalese, filtro sipas statusit dhe hap shpejt dokumentin e duhur."
        actions={
          <button
            type="button"
            onClick={() => nav("/documents/new?type=outbound")}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(96, 165, 250, 0.28)",
              background: "rgba(96, 165, 250, 0.14)",
              color: "var(--text)",
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <NewDocumentIcon />
            Dokument i ri
          </button>
        }
      />

      <SurfaceCard style={{ marginTop: 20, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: "Dokumente gjithsej", value: summaryCards.totalDocuments },
            { label: "Draft", value: summaryCards.draftCount },
            { label: "Konfirmuar", value: summaryCards.confirmedCount },
            { label: "Pa rreshta", value: summaryCards.emptyDocumentsCount },
            { label: "Kerkon vemendje", value: summaryCards.attentionCount },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                padding: 14,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, var(--panel)), var(--panel))",
              }}
            >
              <div style={{ opacity: 0.75, fontSize: 13 }}>{card.label}</div>
              <div style={{ fontSize: 22, marginTop: 6, fontWeight: 700 }}>{card.value}</div>
            </div>
          ))}
        </div>
      </SurfaceCard>


      <SurfaceCard style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
          Zgjedhje te shpejta
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {quickFilterButtons.map((filter) => {
            const isActive = activeQuickFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => applyQuickFilter(filter.key)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: isActive ? "1px solid color-mix(in srgb, var(--accent) 38%, var(--border))" : "1px solid var(--border)",
                  background: isActive ? "color-mix(in srgb, var(--accent) 18%, var(--panel-soft))" : "var(--panel-soft)",
                  color: isActive ? "var(--accent-strong)" : "inherit",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: isActive ? "0 8px 18px color-mix(in srgb, var(--accent) 12%, transparent)" : "none",
                }}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ height: 38, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-soft)", display: "flex", alignItems: "center", padding: "0 12px", gap: 8, minWidth: 280 }}>
            <span style={{ opacity: 0.7 }}>🔎</span>
            <input
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
              placeholder="Numri Dokumentit / Referenca..."
              style={{ flex: 1, height: "100%", border: "none", background: "transparent", color: "var(--text)", outline: "none" }}
            />
          </div>
          <div>
            <FieldLabel>Statusi</FieldLabel>
            <select
              value={status === undefined ? "" : String(status)}
              onChange={(e) => {
                setPage(1);
                const v = e.target.value;
                setStatus(v === "" ? undefined : (Number(v) as DocumentStatus));
                setFrom(undefined); setTo(undefined); setEmptyOnly(false); setAttentionOnly(false);
              }}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="">Te gjitha</option>
              <option value="0">Ne pergatitje</option>
              <option value="1">Konfirmuar</option>
              <option value="2">Anuluar</option>
            </select>
          </div>
          <div>
            <FieldLabel>Statusi i pageses</FieldLabel>
            <select
              value={paymentStatus ?? ""}
              onChange={(e) => {
                setPage(1);
                setPaymentStatus(e.target.value ? e.target.value : undefined);
              }}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="">Te gjitha</option>
              <option value="unpaid">I papaguar</option>
              <option value="partial">I paguar pjeserisht</option>
              <option value="paid">I paguar plotesisht</option>
              <option value="novalue">Pa vlere</option>
            </select>
          </div>
          <div>
            <FieldLabel>Renditja</FieldLabel>
            <select
              value={sort}
              onChange={(e) => { setPage(1); setSort(e.target.value); }}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="createdat_desc">Data Dokumentit ↓</option>
              <option value="createdat_asc">Data Dokumentit ↑</option>
              <option value="documentNo_asc">Numri Dokumentit ↑</option>
              <option value="documentNo_desc">Numri Dokumentit ↓</option>
              <option value="status_asc">Statusi Dokumentit ↑</option>
              <option value="status_desc">Statusi Dokumentit ↓</option>
            </select>
          </div>
        </div>

        {hasActiveFilters ? (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(96, 165, 250, 0.12)",
                    border: "1px solid rgba(96, 165, 250, 0.22)",
                    color: "#bfdbfe",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={clearFilters}
              style={{
                ...actionBtnStyle,
                background: "rgba(248, 113, 113, 0.10)",
                border: "1px solid rgba(248, 113, 113, 0.22)",
                color: "#fecaca",
              }}
            >
              Pastro filtrat
            </button>
          </div>
        ) : null}
      </SurfaceCard>

      {loading && <div>{UI.common.loading}</div>}
      {err && <div style={{ color: "tomato" }}>{err}</div>}
      {!loading && !err && <div style={{ opacity: 0.8 }}>{UI.document.total}: {visibleCount}/{total}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: "8px 12px", borderRadius: 10, opacity: page <= 1 ? 0.5 : 1 }}>
          {UI.common.prev}
        </button>
        <div style={{ opacity: 0.85 }}>Faqe {Math.min(page, totalPages)}/{totalPages}</div>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "8px 12px", borderRadius: 10, opacity: page >= totalPages ? 0.5 : 1 }}>
          {UI.common.next}
        </button>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {toast ? (
          <div style={{ position: "fixed", bottom: 18, right: 18, padding: "10px 12px", borderRadius: 12, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", fontSize: 13, zIndex: 50 }}>
            {toast}
          </div>
        ) : null}

        {items.map((item) => {
          const isHover = hoverId === item.id;
          const normalizedStatus = toStatus(item.status);
          const canQuickConfirm = normalizedStatus !== undefined && canConfirmDocument(normalizedStatus, me?.role) && (item.linesCount ?? 0) > 0;
          const warningChips: Array<{ label: string; tone: "warn" | "info" }> = [];
          const financeTone = paymentTone(item);
          if (!item.reference?.trim()) warningChips.push({ label: "Pa reference", tone: "warn" });
          if (!item.note?.trim()) warningChips.push({ label: "Pa shenim", tone: "info" });
          if ((item.linesCount ?? 0) === 0) warningChips.push({ label: "Pa rreshta", tone: "warn" });
          if (normalizedStatus === 0 && (item.linesCount ?? 0) > 0) warningChips.push({ label: "Draft per konfirmim", tone: "info" });
          const hasWarnings = warningChips.length > 0;

          return (
            <Link
              key={item.id}
              to={`/outbound/${item.id}`}
              state={{ from: `/outbound?${sp.toString()}` }}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId((prev) => (prev === item.id ? null : prev))}
              style={{ textDecoration: "none", color: "inherit", display: "block", transition: "transform 120ms ease", transform: isHover ? "translateY(-1px)" : "translateY(0px)" }}
            >
              <SurfaceCard
                style={{
                  padding: 14,
                  background: isHover ? "var(--panel-strong)" : "var(--panel)",
                  border: hasWarnings
                    ? (isHover ? "1px solid rgba(245, 158, 11, 0.36)" : "1px solid rgba(245, 158, 11, 0.24)")
                    : (isHover ? "1px solid var(--border-strong)" : "1px solid var(--border)"),
                  boxShadow: isHover ? "0 12px 24px rgba(15,23,42,0.18)" : "var(--shadow)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>{item.documentNo}</div>
                    <StatusBadge status={item.status} />
                    {normalizedStatus === 1 ? (
                      <span style={paymentBadgeStyle(financeTone)}>
                        {item.paymentStatus}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, opacity: isHover ? 1 : 0, pointerEvents: isHover ? "auto" : "none", transition: "opacity 120ms ease", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      style={actionBtnStyle}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        nav(`/outbound/${item.id}`, { state: { from: `/outbound?${sp.toString()}` } });
                      }}
                    >
                      <OpenIcon />
                      Hap
                    </button>
                    <button
                      type="button"
                      style={actionBtnStyle}
                      onClick={async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        try {
                          await downloadFile(outboundPdfUrl(item.id), `${item.documentNo}.pdf`);
                          showToast("Eksporti PDF u shkarkua");
                        } catch (error) {
                          showToast(errorMessage(error));
                        }
                      }}
                    >
                      <PdfIcon />
                      Eksporto PDF
                    </button>
                    {canQuickConfirm ? (
                      <button
                        type="button"
                        style={confirmActionBtnStyle}
                        onClick={async (e) => {
                          e.preventDefault(); e.stopPropagation();
                          if (!window.confirm(`A doni ta konfirmoni dokumentin ${item.documentNo}?`)) return;
                          try {
                            await confirmOutbound(item.id);
                            showToast("Dokumenti u konfirmua");
                            requestRefresh();
                          } catch (error) {
                            showToast(errorMessage(error));
                          }
                        }}
                      >
                        <ConfirmIcon />
                        Konfirmo
                      </button>
                    ) : null}
                    <button
                      type="button"
                      style={actionBtnStyle}
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const text = item.documentNo;
                        try {
                          await navigator.clipboard.writeText(text);
                          showToast("U kopjua numri i dokumentit");
                        } catch {
                          const ta = document.createElement("textarea");
                          ta.value = text;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                          showToast("U kopjua numri i dokumentit");
                        }
                      }}
                    >
                      <CopyIcon />
                      Kopjo numrin e dokumentit
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <div style={metaChipStyle}>
                    <span style={{ opacity: 0.68 }}>Rreshta:</span> {item.linesCount}
                  </div>
                  {normalizedStatus === 1 ? (
                    <div style={metaChipStyle}>
                      <span style={{ opacity: 0.68 }}>Bilanci:</span> {formatMoney(item.balance)}
                    </div>
                  ) : null}
                  {normalizedStatus === 1 ? (
                    <div
                      style={{
                        ...metaChipStyle,
                        border: paymentBadgeStyle(financeTone).border,
                        background: paymentBadgeStyle(financeTone).background,
                        color: paymentBadgeStyle(financeTone).color,
                        fontWeight: 800,
                      }}
                    >
                      <span style={{ opacity: 0.9 }}>Pagesa:</span> {formatMoney(item.paidTotal)} / Mbeten: {formatMoney(item.balance)}
                    </div>
                  ) : null}

                  {item.partnerName ? (
                    <div style={metaChipStyle}>
                      <span style={{ opacity: 0.68 }}>Klienti:</span> {item.partnerCode ? `${item.partnerCode} - ` : ""}{item.partnerName}
                    </div>
                  ) : null}
                  {item.reference ? (
                    <div style={metaChipStyle}>
                      <span style={{ opacity: 0.68 }}>{UI.document.reference}:</span> {item.reference}
                    </div>
                  ) : null}

                  {item.createdAt ? (
                    <div style={metaChipStyle}>
                      <span style={{ opacity: 0.68 }}>Krijuar:</span> {formatListDate(item.createdAt)}
                    </div>
                  ) : null}
                </div>

                {item.note ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      opacity: 0.8,
                      lineHeight: 1.45,
                      display: "-webkit-box",
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={item.note}
                  >
                    <span style={{ opacity: 0.68 }}>{UI.document.note}:</span> {item.note}
                  </div>
                ) : null}
                {warningChips.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {warningChips.map((chip) => (
                      <span key={chip.label} style={warningChipStyle(chip.tone)}>{chip.label}</span>
                    ))}
                  </div>
                ) : null}
                <div style={{ opacity: 0.6, fontSize: 12, marginTop: 8 }}>{isHover ? `${UI.document.clickToOpenDocument} →` : `${UI.document.clickForDetails} →`}</div>
              </SurfaceCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NewDocumentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 8H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5H12.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4L4.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10.5 12.5H3.5V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 1.5H9.5L12.5 4.5V13.5C12.5 14.05 12.05 14.5 11.5 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V2.5C3.5 1.95 3.95 1.5 4.5 1.5H4Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ConfirmIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5" y="3.5" width="7.5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 10.5V5C3.5 4.17 4.17 3.5 5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
