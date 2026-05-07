import { useEffect, useMemo, useState } from "react";
import { listAuditActions, listAuditLogs } from "../../services/audit";
import type { AuditActionsResponse, AuditLogDto } from "../../types/audit";
import { errorMessage } from "../../shared/errors";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { FieldLabel } from "../../shared/ui/FieldLabel";

function fmt(dtIso: string) {
  try {
    return new Date(dtIso).toLocaleString();
  } catch {
    return dtIso;
  }
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditLogDto[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [sort, setSort] = useState<string>("createdat_desc");
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      q: q.trim() ? q.trim() : undefined,
      action: action || undefined,
      page,
      pageSize,
      sort,
    }),
    [q, action, page, pageSize, sort]
  );

  useEffect(() => {
    const ac = new AbortController();

    listAuditActions(ac.signal)
      .then((r: AuditActionsResponse) => {
        setActions(Array.isArray(r) ? r : []);
      })
      .catch(() => setActions([]));

    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    listAuditLogs(params, ac.signal)
      .then((r) => {
        const list = Array.isArray(r?.items) ? r.items : [];
        setItems(list);
        setTotal(typeof r?.total === "number" ? r.total : list.length);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [params]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageIntro
        title="Regjistri i auditimit"
        subtitle="Monitorimi i veprimeve ne sistem: kush, cfare dhe kur."
      />

      <SurfaceCard
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "end",
        }}
      >
        <div
          style={{
            height: 40,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel-soft)",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 8,
            minWidth: 320,
            flex: 1,
          }}
        >
          <span style={{ opacity: 0.7 }}>🔎</span>
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Kerko sipas veprimit, entitetit, ID-se ose detajeve..."
            style={{
              flex: 1,
              height: "100%",
              border: "none",
              background: "transparent",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <div>
          <FieldLabel>Veprimi</FieldLabel>
          <select
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            style={{ padding: 10, borderRadius: 10, minWidth: 240 }}
          >
            <option value="">Te gjitha</option>
            {(actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Renditja</FieldLabel>
          <select
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value);
            }}
            style={{ padding: 10, borderRadius: 10 }}
          >
            <option value="createdat_desc">Me te rejat ne fillim</option>
            <option value="createdat_asc">Me te vjetrat ne fillim</option>
          </select>
        </div>

        <div>
          <FieldLabel>Rreshta per faqe</FieldLabel>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
            style={{ padding: 10, borderRadius: 10 }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </SurfaceCard>

      {loading ? <div>Duke u ngarkuar...</div> : null}
      {err ? <div style={{ color: "tomato" }}>{err}</div> : null}
      {!loading && !err ? <div style={{ opacity: 0.8 }}>Totali: {total}</div> : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          style={{ padding: "8px 12px", borderRadius: 10 }}
        >
          Prapa
        </button>
        <div style={{ opacity: 0.85 }}>
          Faqja {page} / {totalPages}
        </div>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          style={{ padding: "8px 12px", borderRadius: 10 }}
        >
          Para
        </button>
      </div>

      <div style={{ marginTop: 4, display: "grid", gap: 10 }}>
        {(items ?? []).map((x) => (
          <SurfaceCard
            key={x.id}
            style={{
              padding: 14,
              background: "var(--panel-soft)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800 }}>{x.action}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{fmt(x.createdAt)}</div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
              Entiteti: <b>{x.entity}</b> • ID: <span style={{ opacity: 0.8 }}>{x.entityId}</span>
              {x.userId ? (
                <>
                  {" "}
                  • Perdoruesi: <span style={{ opacity: 0.8 }}>{x.userId}</span>
                </>
              ) : null}
              {x.ipAddress ? (
                <>
                  {" "}
                  • IP: <span style={{ opacity: 0.8 }}>{x.ipAddress}</span>
                </>
              ) : null}
            </div>

            {x.details ? (
              <div style={{ fontSize: 12, opacity: 0.82, marginTop: 8, whiteSpace: "pre-wrap" }}>
                Detaje: {x.details}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Nuk ka detaje shtese.</div>
            )}
          </SurfaceCard>
        ))}

        {!loading && !err && items.length === 0 ? (
          <div style={{ opacity: 0.75 }}>Nuk ka rezultate per filtrat aktuale.</div>
        ) : null}
      </div>
    </div>
  );
}
