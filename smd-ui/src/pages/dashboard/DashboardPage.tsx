import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardSummary } from "../../services/dashboard";
import type { DashboardSummary } from "../../types/dashboard";
import { errorMessage } from "../../shared/errors";
import { UI } from "../../shared/uiText";
import { auditActionLabel, auditEntityLabel } from "../../shared/auditLabels";
import { getSessionUser } from "../../shared/session";
import { canViewAudit } from "../../shared/permissions";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { pageEyebrowStyle } from "../../shared/ui/PageIntro";

function fmt(dtIso: string) {
  try {
    return new Date(dtIso).toLocaleString();
  } catch {
    return dtIso;
  }
}

function formatDateOnly(dtIso?: string | null) {
  if (!dtIso) return "Pa date";
  try {
    return new Date(dtIso).toLocaleDateString("sq-AL");
  } catch {
    return dtIso;
  }
}

function formatMoney(value: number) {
  return `${value.toLocaleString("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(value ?? 0);
}

function taskTypeLabel(type: string) {
  if (type === "Putaway") return "Vendos mallin";
  if (type === "Replenishment") return "Mbush shporten";
  if (type === "Picking") return "Mblidh porosine";
  if (type === "Counting") return "Numero stokun";
  return type;
}

function taskStatusLabel(status: string) {
  if (status === "Open") return "E hapur";
  if (status === "InProgress") return "Duke u punuar";
  if (status === "Blocked") return "Ka problem";
  if (status === "Done") return "E perfunduar";
  if (status === "Cancelled") return "E anuluar";
  return status;
}

function elapsedLabel(dtIso: string) {
  const created = new Date(dtIso).getTime();
  if (Number.isNaN(created)) return "";

  const hours = Math.max(0, Math.floor((Date.now() - created) / 36e5));
  if (hours < 1) return "me pak se 1 ore";
  if (hours < 24) return `${hours} ore`;

  const days = Math.floor(hours / 24);
  return `${days} dite`;
}

function metricTone(index: number) {
  const tones = [
    "linear-gradient(135deg, rgba(37,99,235,0.22), rgba(15,23,42,0.04))",
    "linear-gradient(135deg, rgba(217,119,6,0.18), rgba(15,23,42,0.04))",
    "linear-gradient(135deg, rgba(5,150,105,0.18), rgba(15,23,42,0.04))",
    "linear-gradient(135deg, rgba(71,85,105,0.24), rgba(15,23,42,0.04))",
    "linear-gradient(135deg, rgba(30,64,175,0.18), rgba(15,23,42,0.04))",
  ];
  return tones[index % tones.length];
}

function alertMetricTone(kind: "danger" | "warn" | "success" | "info") {
  switch (kind) {
    case "danger":
      return "linear-gradient(180deg, rgba(220, 38, 38, 0.18), rgba(255,255,255,0.02))";
    case "warn":
      return "linear-gradient(180deg, rgba(217, 119, 6, 0.18), rgba(255,255,255,0.02))";
    case "success":
      return "linear-gradient(180deg, rgba(5, 150, 105, 0.18), rgba(255,255,255,0.02))";
    default:
      return "linear-gradient(180deg, rgba(37, 99, 235, 0.18), rgba(255,255,255,0.02))";
  }
}

function alertChipStyle(kind: "danger" | "warn" | "success" | "info"): React.CSSProperties {
  switch (kind) {
    case "danger":
      return {
        border: "1px solid rgba(248, 113, 113, 0.42)",
        background: "rgba(127, 29, 29, 0.32)",
        color: "#fecaca",
      };
    case "warn":
      return {
        border: "1px solid rgba(251, 191, 36, 0.34)",
        background: "rgba(120, 53, 15, 0.3)",
        color: "#fde68a",
      };
    case "success":
      return {
        border: "1px solid rgba(74, 222, 128, 0.34)",
        background: "rgba(20, 83, 45, 0.26)",
        color: "#bbf7d0",
      };
    default:
      return {
        border: "1px solid rgba(96, 165, 250, 0.34)",
        background: "rgba(30, 64, 175, 0.22)",
        color: "#bfdbfe",
      };
  }
}

const actionCardBase: React.CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  padding: 16,
  borderRadius: 14,
  background: "var(--panel-soft)",
  border: "1px solid var(--border)",
  minHeight: 112,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const alertRowStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "var(--panel-soft)",
  border: "1px solid var(--border)",
  color: "inherit",
  textDecoration: "none",
  display: "grid",
  gap: 7,
};

function TaskInfo({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.055)",
        minWidth: 0,
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "var(--text)", fontWeight: 800, marginTop: 3, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function WarehouseTaskFollowUp({ data }: { data: DashboardSummary | null }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: 14,
        borderRadius: 16,
        background: "linear-gradient(180deg, rgba(217,119,6,0.12), rgba(255,255,255,0.02))",
        border: "1px solid rgba(251, 191, 36, 0.22)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#fde68a", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Prioritet per depo
          </div>
          <h3 style={{ margin: "4px 0 0", fontSize: 22 }}>Cka duhet me u kry ne depo</h3>
          <div style={{ color: "var(--muted-strong)", fontSize: 13, marginTop: 5 }}>
            Punet pa punetor ose te mbetura gjate dalin te parat.
          </div>
        </div>
        <Link to="/warehouse-tasks" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 800 }}>
          Hap listen e puneve
        </Link>
      </div>

      {data?.warehouseTaskAlerts?.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {data.warehouseTaskAlerts.map((item) => (
            <Link
              key={item.taskId}
              to="/warehouse-tasks"
              style={{
                ...alertRowStyle,
                padding: 14,
                borderColor: item.isUnassigned || item.isStale ? "rgba(251, 191, 36, 0.34)" : "var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
                    {item.taskNo}
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, marginTop: 3 }}>{taskTypeLabel(item.type)}</div>
                  <div style={{ color: "var(--muted-strong)", fontSize: 13, marginTop: 6 }}>
                    Produkti: <b>{item.productCode ? `${item.productCode} - ${item.productName ?? ""}` : "Pa produkt"}</b>
                  </div>
                </div>
                <div
                  style={{
                    ...alertChipStyle(item.status === "Blocked" ? "danger" : item.isUnassigned || item.isStale ? "warn" : "info"),
                    padding: "7px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {item.status === "Blocked" ? "Ka problem" : item.isUnassigned ? "Pa punetor" : taskStatusLabel(item.status)}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 8,
                  color: "var(--muted-strong)",
                  fontSize: 13,
                }}
              >
                {item.quantity ? <TaskInfo label="Sasia" value={formatQty(item.quantity)} /> : null}
                {item.fromBinCode ? <TaskInfo label="Nga shporta" value={item.fromBinCode} /> : null}
                {item.toBinCode ? <TaskInfo label="Ne shporte" value={item.toBinCode} /> : null}
                {item.reference ? <TaskInfo label="Dokumenti" value={item.reference} /> : null}
                <TaskInfo label="Hapur para" value={elapsedLabel(item.createdAt)} />
              </div>
              {item.status === "Blocked" && item.note ? (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(248,113,113,0.34)",
                    background: "rgba(127,29,29,0.22)",
                    color: "#fecaca",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Arsyeja: {item.note}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <div style={{ ...alertRowStyle, opacity: 0.82 }}>Per momentin nuk ka pune te hapura ne depo.</div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const me = getSessionUser();

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    getDashboardSummary(ac.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, []);

  const cards = useMemo(
    () => [
      {
        title: UI.dashboard.cards.inboundToday.title,
        value: data?.inboundTodayCount ?? 0,
        hint: UI.dashboard.cards.inboundToday.hint,
      },
      {
        title: UI.dashboard.cards.outboundToday.title,
        value: data?.outboundTodayCount ?? 0,
        hint: UI.dashboard.cards.outboundToday.hint,
      },
      {
        title: UI.dashboard.cards.pendingDrafts.title,
        value: data?.pendingDraftsCount ?? 0,
        hint: UI.dashboard.cards.pendingDrafts.hint,
      },
      {
        title: UI.dashboard.cards.products.title,
        value: data?.totalProducts ?? 0,
        hint: UI.dashboard.cards.products.hint,
      },
      {
        title: UI.dashboard.cards.bins.title,
        value: data?.totalBins ?? 0,
        hint: UI.dashboard.cards.bins.hint,
      },
    ],
    [data]
  );

  const alertCards = useMemo(
    () => [
      {
        title: "Produkte pa stok",
        value: data?.outOfStockProductsCount ?? 0,
        hint: "Produkte aktive qe nuk kane sasi ne dispozicion.",
        kind: "danger" as const,
        to: "/inventory",
      },
      {
        title: "Nen prag minimal",
        value: data?.lowStockProductsCount ?? 0,
        hint: "Produkte qe duhen rimbushur para se te mbarojne.",
        kind: "warn" as const,
        to: "/inventory",
      },
      {
        title: "Produkte te skaduara",
        value: data?.expiredInventoryCount ?? 0,
        hint: "Artikuj qe kerkojne kontroll te menjehershem ne inventar.",
        kind: "danger" as const,
        to: "/inventory",
      },
      {
        title: "Skadojne shpejt",
        value: data?.nearExpiryInventoryCount ?? 0,
        hint: "Produkte qe skadojne brenda 30 diteve.",
        kind: "warn" as const,
        to: "/inventory",
      },
      {
        title: "Dokumente te papaguara",
        value: data?.unpaidDocumentsCount ?? 0,
        hint: "Dokumente te konfirmuara me balance te hapur.",
        kind: "info" as const,
        to: "/finance",
      },
      {
        title: "Pune aktive ne depo",
        value: data?.openWarehouseTasksCount ?? 0,
        hint: `${data?.unassignedWarehouseTasksCount ?? 0} pa punetor, ${data?.staleWarehouseTasksCount ?? 0} te hapura mbi 24 ore.`,
        kind: (data?.unassignedWarehouseTasksCount ?? 0) > 0 || (data?.staleWarehouseTasksCount ?? 0) > 0 ? "warn" as const : "info" as const,
        to: "/warehouse-tasks",
      },
      {
        title: "Borxhi i klienteve",
        value: formatMoney(data?.customerDebtTotal ?? 0),
        hint: "Shuma qe duhet te arketojme nga klientet.",
        kind: "success" as const,
        to: "/finance",
      },
      {
        title: "Detyrime ndaj furnizuesve",
        value: formatMoney(data?.supplierPayableTotal ?? 0),
        hint: "Shuma qe duhet te paguajme ndaj furnizuesve.",
        kind: "warn" as const,
        to: "/finance",
      },
    ],
    [data]
  );

  const quickActions = [
    {
      to: "/documents/new?type=inbound",
      title: "Krijo Inbound",
      description: "Hap nje forme te thjeshte dhe krijo menjehere nje dokument te ri hyres.",
      eyebrow: "I ri",
    },
    {
      to: "/documents/new?type=outbound",
      title: "Krijo Outbound",
      description: "Krijo shpejt nje dokument te ri dales pa hapa shtese te panevojshme.",
      eyebrow: "I ri",
    },
    {
      to: "/inbound",
      title: UI.dashboard.quickActions.inbound,
      description: UI.dashboard.quickActions.description,
      eyebrow: "Pranime",
    },
    {
      to: "/outbound",
      title: "Dokumentet e daljes",
      description: "Shiko dokumentet, verifiko linjat dhe eksporto dokumentet e dales.",
      eyebrow: "Dalje",
    },
    {
      to: "/inventory",
      title: "Inventari",
      description: "Monitoro disponueshmerine, filtrat dhe eksportet e stokut ne depo.",
      eyebrow: "Pasqyra e stokut",
    },
    {
      to: "/stock-movements",
      title: "Levizjet e stokut",
      description: "Kontrollo hyrjet, daljet, transfertat dhe korrigjimet e fundit.",
      eyebrow: "Veprime",
    },
  ];

  if (canViewAudit(me?.role)) {
    quickActions.push({
      to: "/audit-logs",
      title: "Regjistri i auditimit",
      description: "Shiko aktivitetet e sistemit, konfirmimet dhe gjurmen e ndryshimeve.",
      eyebrow: "Gjurmim",
    });
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          padding: 18,
          borderRadius: 14,
          border: "1px solid var(--border)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 94%, transparent), color-mix(in srgb, var(--panel) 100%, transparent))",
          boxShadow: "var(--shadow)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 18,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 560px", maxWidth: 760 }}>
            <div style={pageEyebrowStyle}>{UI.dashboard.controlCenter}</div>

            <h1 style={{ marginBottom: 8, fontSize: 36, lineHeight: 1.05 }}>{UI.dashboard.title}</h1>
            <div style={{ color: "var(--muted-strong)", fontSize: 15, maxWidth: 690 }}>
              {UI.dashboard.welcome} Ketu ke nje pamje te shpejte per dokumentet e dites, stokun aktiv dhe
              aktivitetet me te fundit ne sistem.
            </div>
          </div>

          <div
            style={{
              flex: "1 1 320px",
              maxWidth: 460,
              minWidth: 280,
              padding: 16,
              borderRadius: 16,
              background: "color-mix(in srgb, var(--panel-strong) 72%, transparent)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
              Rekomandim i shpejte
            </div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>Fillo me alarmet kryesore te dites</div>
            <div style={{ marginTop: 6, color: "var(--muted-strong)", fontSize: 13 }}>
              Stoku kritik, skadencat dhe pagesat ne pritje jane pikat me kritike per klientin ne perdorim ditor.
            </div>
          </div>
        </div>
      </section>

      {loading ? <div>{UI.common.loading}</div> : null}
      {err ? <div style={{ color: "tomato" }}>{err || UI.common.error}</div> : null}

      {!loading && !err ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
              gap: 14,
            }}
          >
            {cards.map((c, index) => (
              <div key={c.title}>
                <SurfaceCard style={{ padding: 16, minHeight: 132, background: metricTone(index) }}>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.82 }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 800, marginTop: 10 }}>{c.value}</div>
                  <div style={{ fontSize: 13, color: "var(--muted-strong)", marginTop: 12 }}>{c.hint}</div>
                </SurfaceCard>
              </div>
            ))}
          </section>

          <SurfaceCard style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 6 }}>Alarmet kryesore</h2>
                <div style={{ color: "var(--muted)" }}>
                  Shenjat me te rendesishme te stokut, skadences dhe financave, qe te veprosh menjehere.
                </div>
              </div>
              <Link to="/finance" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
                Hap financat
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {alertCards.map((card) => (
                <Link
                  key={card.title}
                  to={card.to}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      minHeight: 124,
                      border: "1px solid var(--border)",
                      background: alertMetricTone(card.kind),
                      boxShadow: "var(--shadow)",
                    }}
                  >
                    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.86 }}>
                      {card.title}
                    </div>
                    <div style={{ marginTop: 10, fontWeight: 900, fontSize: typeof card.value === "string" ? 28 : 34 }}>
                      {card.value}
                    </div>
                    <div style={{ marginTop: 12, color: "var(--muted-strong)", fontSize: 13 }}>{card.hint}</div>
                  </div>
                </Link>
              ))}
            </div>

            <WarehouseTaskFollowUp data={data} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Stoku kritik</h3>
                  <Link to="/inventory" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                    Inventari
                  </Link>
                </div>
                {data?.lowStockAlerts?.length ? (
                  data.lowStockAlerts.map((item) => (
                    <Link key={item.productId} to={`/products/${item.productId}/history`} style={alertRowStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{item.productCode} - {item.productName}</div>
                          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                            Pragu minimal: {formatQty(item.minStockLevel)}
                          </div>
                        </div>
                        <div style={{ ...alertChipStyle(item.isOutOfStock ? "danger" : "warn"), padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
                          {item.isOutOfStock ? "Pa stok" : "Stok i ulet"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--muted-strong)", fontSize: 13 }}>
                        <span>Ne dispozicion: <b>{formatQty(item.availableQty)}</b></span>
                        <span>Mungon deri ne prag: <b>{formatQty(Math.max(item.minStockLevel - item.availableQty, 0))}</b></span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div style={{ ...alertRowStyle, opacity: 0.78 }}>Nuk ka produkte pa stok ose nen prag minimal per momentin.</div>
                )}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Skadencat me urgjente</h3>
                  <Link to="/inventory" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                    Inventari
                  </Link>
                </div>
                {data?.expiryAlerts?.length ? (
                  data.expiryAlerts.map((item) => (
                    <Link key={item.inventoryId} to="/inventory" style={alertRowStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{item.productCode} - {item.productName}</div>
                          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                            {item.warehouseName} • {item.binCode}
                          </div>
                        </div>
                        <div style={{ ...alertChipStyle(item.isExpired ? "danger" : "warn"), padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
                          {item.isExpired ? "I skaduar" : "Skadon shpejt"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--muted-strong)", fontSize: 13 }}>
                        <span>Skadon: <b>{formatDateOnly(item.expiryDate)}</b></span>
                        <span>Sasia: <b>{item.availableQty}</b></span>
                        {item.lotNumber ? <span>Seria: <b>{item.lotNumber}</b></span> : null}
                        {item.batchNumber ? <span>Grupi: <b>{item.batchNumber}</b></span> : null}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div style={{ ...alertRowStyle, opacity: 0.78 }}>Nuk ka produkte ne alarm skadence per momentin.</div>
                )}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Dokumente me pagese ne pritje</h3>
                  <Link to="/finance" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                    Pagesat
                  </Link>
                </div>
                {data?.paymentAlerts?.length ? (
                  data.paymentAlerts.map((item) => (
                    <Link
                      key={`${item.documentType}-${item.documentId}`}
                      to={item.documentType === "inbound" ? `/inbound/${item.documentId}` : `/outbound/${item.documentId}`}
                      style={alertRowStyle}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{item.documentNo}</div>
                          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                            {item.partnerCode ? `${item.partnerCode} - ` : ""}{item.partnerName ?? "Pa partner"}
                          </div>
                        </div>
                        <div style={{ ...alertChipStyle(item.paymentStatus === "I papaguar" ? "danger" : "warn"), padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
                          {item.paymentStatus}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--muted-strong)", fontSize: 13, flexWrap: "wrap" }}>
                        <span>Balance: <b>{formatMoney(item.balance)}</b></span>
                        <span>{item.documentType === "inbound" ? "Inbound" : "Outbound"} • {formatDateOnly(item.createdAt)}</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div style={{ ...alertRowStyle, opacity: 0.78 }}>Nuk ka dokumente te papaguara per momentin.</div>
                )}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Partneret me balance te hapur</h3>
                  <Link to="/finance" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                    Shiko te gjitha
                  </Link>
                </div>

                {data?.topCustomerDebtors?.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>Kliente me borxh</div>
                    {data.topCustomerDebtors.map((item) => (
                      <Link key={`customer-${item.partnerId}`} to="/finance" style={alertRowStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{item.partnerCode} - {item.partnerName}</div>
                            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Arketim ne pritje</div>
                          </div>
                          <div style={{ ...alertChipStyle("success"), padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
                            {formatMoney(item.balance)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}

                {data?.topSupplierPayables?.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>Furnizues ndaj te cileve kemi detyrim</div>
                    {data.topSupplierPayables.map((item) => (
                      <Link key={`supplier-${item.partnerId}`} to="/finance" style={alertRowStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{item.partnerCode} - {item.partnerName}</div>
                            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Pagese ne pritje</div>
                          </div>
                          <div style={{ ...alertChipStyle("warn"), padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
                            {formatMoney(item.balance)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}

                {!data?.topCustomerDebtors?.length && !data?.topSupplierPayables?.length ? (
                  <div style={{ ...alertRowStyle, opacity: 0.78 }}>Nuk ka partnere me balance te hapur per momentin.</div>
                ) : null}
              </div>
            </div>
          </SurfaceCard>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16 }}>
            <SurfaceCard>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h2 style={{ marginBottom: 6 }}>{UI.dashboard.quickActions.title}</h2>
                  <div style={{ color: "var(--muted)" }}>Hyr ne modulet kryesore dhe vazhdo punen pa humbur kohe.</div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
                {quickActions.map((action, index) => {
                  const isCreateAction = index < 2;
                  return (
                    <Link
                      key={action.to}
                      to={action.to}
                      style={{
                        ...actionCardBase,
                        minHeight: isCreateAction ? 128 : actionCardBase.minHeight,
                        border: isCreateAction ? "1px solid rgba(96, 165, 250, 0.30)" : actionCardBase.border,
                        boxShadow: isCreateAction ? "0 14px 30px rgba(37,99,235,0.12)" : undefined,
                        background:
                          isCreateAction
                            ? "linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(255,255,255,0.02))"
                            : index % 2 === 0
                              ? "linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, var(--panel-soft)), var(--panel-soft))"
                              : "linear-gradient(180deg, color-mix(in srgb, var(--accent-warm) 12%, var(--panel-soft)), var(--panel-soft))",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: isCreateAction ? "#bfdbfe" : "var(--accent)",
                            fontSize: 12,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontWeight: isCreateAction ? 800 : 600,
                          }}
                        >
                          {action.eyebrow}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>{action.title}</div>
                      </div>
                      <div style={{ color: "var(--muted-strong)", fontSize: 13 }}>{action.description}</div>
                    </Link>
                  );
                })}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <h2 style={{ marginBottom: 8 }}>{UI.dashboard.systemSnapshot}</h2>
              <div style={{ color: "var(--muted)", marginBottom: 16 }}>
                Nje permbledhje e shpejte e gjendjes se sistemit ne kete moment.
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: "var(--panel-soft)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {UI.dashboard.pendingDocuments}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>{data?.pendingDraftsCount ?? 0}</div>
                  <div style={{ color: "var(--muted-strong)", marginTop: 6, fontSize: 13 }}>
                    dokumente ne pritje per kontroll ose konfirmim.
                  </div>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: "var(--panel-soft)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {UI.dashboard.warehouseCoverage}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>
                    {(data?.totalProducts ?? 0) > 0 ? `${data?.totalBins ?? 0} shporta` : "0 shporta"}
                  </div>
                  <div style={{ color: "var(--muted-strong)", marginTop: 6, fontSize: 13 }}>
                    aktive per {data?.totalProducts ?? 0} produkte te regjistruara ne sistem.
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </section>

          <SurfaceCard>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ marginBottom: 6 }}>Aktiviteti se fundmi</h2>
                <div style={{ color: "var(--muted)" }}>Konfirmime, ndryshime dhe gjurme te fundit ne sistem.</div>
              </div>
            </div>

            {data?.latestAuditLogs?.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {data.latestAuditLogs.slice(0, 10).map((a, idx) => (
                  <div
                    key={`${a.entityId}-${a.createdAt}-${idx}`}
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      background: "var(--panel-soft)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{auditActionLabel(a.action)}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(a.createdAt)}</div>
                    </div>

                    <div style={{ fontSize: 13, color: "var(--muted-strong)", marginTop: 8 }}>
                      Lloji: <b>{auditEntityLabel(a.entity)}</b> • ID: <span style={{ opacity: 0.9 }}>{a.entityId}</span>
                      {a.ipAddress ? (
                        <>
                          {" "}
                          • IP: <span style={{ opacity: 0.9 }}>{a.ipAddress}</span>
                        </>
                      ) : null}
                    </div>

                    {a.details ? (
                      <div style={{ fontSize: 13, color: "var(--muted-strong)", marginTop: 10, whiteSpace: "pre-wrap" }}>
                        Detaje: {a.details}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>Nuk ka aktivitete ende.</div>
            )}
          </SurfaceCard>
        </>
      ) : null}
    </div>
  );
}
