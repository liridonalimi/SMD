import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getProductHistory } from "../../services/products";
import { statusLabel } from "../../shared/documentStatus";
import { errorMessage } from "../../shared/errors";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import type {
  ProductHistoryDocumentRowDto,
  ProductHistoryDto,
  ProductHistoryMovementDto,
} from "../../types/products";

function formatQty(value?: number | null) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function formatMoney(value?: number | null) {
  return `${new Intl.NumberFormat("sq-AL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0))} €`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("sq-AL");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sq-AL");
}

function movementLabel(type: ProductHistoryMovementDto["type"]) {
  switch (String(type).toUpperCase()) {
    case "IN":
    case "1":
      return { label: "Hyrje", color: "#6ee7b7", bg: "rgba(5,150,105,0.14)" };
    case "OUT":
    case "2":
      return { label: "Dalje", color: "#fca5a5", bg: "rgba(220,38,38,0.14)" };
    case "TRANSFER":
    case "3":
      return { label: "Transfer", color: "#93c5fd", bg: "rgba(37,99,235,0.14)" };
    case "ADJUST":
    case "4":
      return { label: "Korrigjim", color: "#fcd34d", bg: "rgba(217,119,6,0.14)" };
    default:
      return { label: String(type), color: "var(--muted-strong)", bg: "rgba(148,163,184,0.14)" };
  }
}

function partnerLabel(row: ProductHistoryDocumentRowDto) {
  if (row.partnerCode && row.partnerName) return `${row.partnerCode} - ${row.partnerName}`;
  return row.partnerName || row.partnerCode || "-";
}

function documentHref(row: ProductHistoryDocumentRowDto) {
  return row.documentType === "INBOUND" ? `/inbound/${row.documentId}` : `/outbound/${row.documentId}`;
}

export default function ProductHistoryPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<ProductHistoryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();

    setLoading(true);
    setErr(null);

    getProductHistory(id, ac.signal)
      .then(setData)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [id]);

  const signals = useMemo(() => {
    if (!data) return [];

    const result: Array<{ label: string; tone: "ok" | "warn" | "danger" }> = [];

    if (data.summary.totalAvailable <= 0) {
      result.push({ label: "Nuk ka sasi te disponueshme", tone: "danger" });
    } else if (data.summary.isBelowMinStock) {
      result.push({ label: "Nen pragun minimal", tone: "warn" });
    } else {
      result.push({ label: "Disponueshmeria eshte ne rregull", tone: "ok" });
    }

    if (data.summary.expiredRows > 0) {
      result.push({ label: `${data.summary.expiredRows} rreshta te skaduar`, tone: "danger" });
    }

    if (data.summary.nearExpiryRows > 0) {
      result.push({ label: `${data.summary.nearExpiryRows} rreshta skadojne shpejt`, tone: "warn" });
    }

    if (!data.product.isActive) {
      result.push({ label: "Produkti nuk eshte aktiv", tone: "warn" });
    }

    return result;
  }, [data]);

  if (loading) return <div>Duke u ngarkuar...</div>;
  if (err) return <div style={errorBoxStyle}>{err}</div>;
  if (!data) return <div>Produkti nuk u gjet.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageIntro
        title={`Historia e produktit • ${data.product.sku}`}
        subtitle={
          <>
            {data.product.name}
            {data.product.barcode ? <> • Barkodi: <b>{data.product.barcode}</b></> : null}
          </>
        }
        actions={
          <button type="button" onClick={() => nav("/products")} style={buttonStyle}>
            Kthehu te Produktet
          </button>
        }
      />

      <div style={metricGridStyle}>
        <Metric label="Sasia ne inventar" value={formatQty(data.summary.totalOnHand)} />
        <Metric label="Rezervuar" value={formatQty(data.summary.totalReserved)} />
        <Metric label="Disponueshme" value={formatQty(data.summary.totalAvailable)} />
        <Metric label="Shporta" value={String(data.summary.binCount)} />
        <Metric label="Seri/Lote" value={String(data.summary.lotCount)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
        <SurfaceCard>
          <h2 style={sectionTitleStyle}>Te dhenat e produktit</h2>
          <InfoRow label="Emri" value={data.product.name} />
          <InfoRow label="Njesia" value={data.product.unitOfMeasure || "-"} />
          <InfoRow label="Pragu minimal" value={formatQty(data.product.minStockLevel)} />
          <InfoRow label="Statusi" value={data.product.isActive ? "Aktiv" : "Jo aktiv"} />
          <InfoRow label="Krijuar" value={formatDate(data.product.createdAt)} />
          <InfoRow label="Perditesuar" value={formatDate(data.product.updatedAt)} />

          <div style={{ height: 1, background: "var(--border)", margin: "14px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniPrice label="Blerje" value={formatMoney(data.product.purchasePrice)} />
            <MiniPrice label="Pakice" value={formatMoney(data.product.retailPrice)} />
            <MiniPrice label="Shumice" value={formatMoney(data.product.wholesalePrice)} />
            <MiniPrice label="VIP" value={formatMoney(data.product.vipPrice)} />
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 style={sectionTitleStyle}>Sinjalet kryesore</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {signals.map((signal) => (
              <span key={signal.label} style={signalChipStyle(signal.tone)}>
                {signal.label}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 18, color: "var(--muted-strong)" }}>
            Levizja e fundit: <b style={{ color: "var(--text)" }}>{formatDateTime(data.summary.lastMovementAt)}</b>
          </div>
          <div style={{ marginTop: 10, color: "var(--muted)" }}>
            Kjo faqe bashkon stokun aktual, levizjet dhe dokumentet per produktin e zgjedhur.
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard padded={false}>
        <TableHeader title="Stoku aktual sipas lokacionit" meta={`${data.inventoryRows.length} rreshta`} />
        <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
          <table style={{ ...tableStyle, minWidth: 980 }}>
            <thead>
              <tr>
                <Th>Depoja</Th>
                <Th>Shporta</Th>
                <Th>Seria / Grupi</Th>
                <Th>Skadenca</Th>
                <Th align="right">Sasia</Th>
                <Th align="right">Rezervuar</Th>
                <Th align="right">Disponueshme</Th>
              </tr>
            </thead>
            <tbody>
              {data.inventoryRows.length === 0 ? (
                <EmptyRow colSpan={7} text="Ky produkt nuk ka stok te regjistruar." />
              ) : (
                data.inventoryRows.map((row) => (
                  <tr key={row.inventoryId}>
                    <Td>
                      <b>{row.warehouseCode}</b>
                      <div style={mutedSmallStyle}>{row.warehouseName}</div>
                    </Td>
                    <Td>
                      <b>{row.binCode}</b>
                      <div style={mutedSmallStyle}>{row.zoneCode} / {row.rackCode}</div>
                    </Td>
                    <Td>
                      <div>Seria: <b>{row.lotNumber || "-"}</b></div>
                      <div style={mutedSmallStyle}>Grupi: {row.batchNumber || "-"}</div>
                    </Td>
                    <Td>
                      {formatDate(row.expiryDate)}
                      {row.isExpired ? <div style={dangerSmallStyle}>E skaduar</div> : null}
                      {!row.isExpired && row.isNearExpiry ? <div style={warningSmallStyle}>Skadon shpejt</div> : null}
                    </Td>
                    <Td align="right">{formatQty(row.qtyOnHand)}</Td>
                    <Td align="right">{formatQty(row.qtyReserved)}</Td>
                    <Td align="right"><b>{formatQty(row.qtyAvailable)}</b></Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
        <SurfaceCard padded={false}>
          <TableHeader title="Levizjet e fundit" meta={`${data.movements.length} rreshta`} />
          <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
            <table style={{ ...tableStyle, minWidth: 860 }}>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Lloji</Th>
                  <Th>Nga</Th>
                  <Th>Ne</Th>
                  <Th align="right">Sasia</Th>
                  <Th align="right">Ndikimi</Th>
                  <Th>Referenca</Th>
                </tr>
              </thead>
              <tbody>
                {data.movements.length === 0 ? (
                  <EmptyRow colSpan={7} text="Nuk ka levizje per kete produkt." />
                ) : (
                  data.movements.map((row) => {
                    const badge = movementLabel(row.type);
                    return (
                      <tr key={row.id}>
                        <Td>{formatDateTime(row.createdAt)}</Td>
                        <Td>
                          <span style={{ ...badgeStyle, color: badge.color, background: badge.bg }}>
                            {badge.label}
                          </span>
                        </Td>
                        <Td>{row.fromBinCode || "-"}</Td>
                        <Td>{row.toBinCode || "-"}</Td>
                        <Td align="right">{formatQty(row.quantity)}</Td>
                        <Td align="right">
                          <b style={{ color: row.quantityEffect < 0 ? "#fca5a5" : row.quantityEffect > 0 ? "#6ee7b7" : "var(--muted-strong)" }}>
                            {row.quantityEffect > 0 ? "+" : ""}{formatQty(row.quantityEffect)}
                          </b>
                        </Td>
                        <Td>
                          {row.reference || "-"}
                          {row.note ? <div style={mutedSmallStyle}>{row.note}</div> : null}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard padded={false}>
          <TableHeader title="Dokumentet e lidhura" meta={`${data.documents.length} rreshta`} />
          <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
            <table style={{ ...tableStyle, minWidth: 900 }}>
              <thead>
                <tr>
                  <Th>Dokumenti</Th>
                  <Th>Statusi</Th>
                  <Th>Partneri</Th>
                  <Th>Shporta</Th>
                  <Th align="right">Sasia</Th>
                  <Th>Seria / Grupi</Th>
                </tr>
              </thead>
              <tbody>
                {data.documents.length === 0 ? (
                  <EmptyRow colSpan={6} text="Nuk ka dokumente te lidhura per kete produkt." />
                ) : (
                  data.documents.map((row) => (
                    <tr key={row.lineId}>
                      <Td>
                        <Link to={documentHref(row)} style={{ color: "var(--accent)", fontWeight: 850 }}>
                          {row.documentNo}
                        </Link>
                        <div style={mutedSmallStyle}>{row.direction} • {formatDate(row.createdAt)}</div>
                      </Td>
                      <Td>{statusLabel(row.status)}</Td>
                      <Td>{partnerLabel(row)}</Td>
                      <Td>{row.binCode}</Td>
                      <Td align="right">
                        <b>{formatQty(row.quantity)}</b>
                        {row.reservedQuantity !== null && row.reservedQuantity !== undefined ? (
                          <div style={mutedSmallStyle}>Rez.: {formatQty(row.reservedQuantity)}</div>
                        ) : null}
                      </Td>
                      <Td>
                        <div>Seria: <b>{row.lotNumber || "-"}</b></div>
                        <div style={mutedSmallStyle}>Grupi: {row.batchNumber || "-"} • Skadon: {formatDate(row.expiryDate)}</div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard style={{ padding: 14, borderRadius: 14 }}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </SurfaceCard>
  );
}

function MiniPrice({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-soft)" }}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={{ fontWeight: 850, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 750 }}>{value}</div>
    </div>
  );
}

function TableHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{title}</h2>
      <div style={{ color: "var(--muted)" }}>{meta}</div>
    </div>
  );
}

function Th({ children, align }: { children: ReactNode; align?: "left" | "right" }) {
  return <th style={{ ...thStyle, textAlign: align ?? "left" }}>{children}</th>;
}

function Td({ children, align }: { children: ReactNode; align?: "left" | "right" }) {
  return <td style={{ ...tdStyle, textAlign: align ?? "left" }}>{children}</td>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", padding: 24 }}>
        {text}
      </td>
    </tr>
  );
}

const buttonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const metricLabelStyle: CSSProperties = {
  color: "var(--muted)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 18,
  fontWeight: 850,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  padding: "11px 12px",
  borderBottom: "1px solid var(--border)",
  color: "var(--muted-strong)",
  background: "var(--panel-strong)",
  fontSize: 12,
  textTransform: "uppercase",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
};

const mutedSmallStyle: CSSProperties = {
  color: "var(--muted)",
  fontSize: 12,
  marginTop: 3,
};

const dangerSmallStyle: CSSProperties = {
  color: "#fca5a5",
  fontSize: 12,
  marginTop: 3,
  fontWeight: 750,
};

const warningSmallStyle: CSSProperties = {
  color: "#fcd34d",
  fontSize: 12,
  marginTop: 3,
  fontWeight: 750,
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
};

function signalChipStyle(tone: "ok" | "warn" | "danger"): CSSProperties {
  const colors = {
    ok: { color: "#6ee7b7", bg: "rgba(5,150,105,0.14)", border: "rgba(5,150,105,0.28)" },
    warn: { color: "#fcd34d", bg: "rgba(217,119,6,0.14)", border: "rgba(217,119,6,0.28)" },
    danger: { color: "#fca5a5", bg: "rgba(220,38,38,0.14)", border: "rgba(220,38,38,0.28)" },
  }[tone];

  return {
    padding: "8px 10px",
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.color,
    fontWeight: 800,
    fontSize: 13,
  };
}

const errorBoxStyle: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(248,113,113,0.12)",
  border: "1px solid rgba(248,113,113,0.24)",
  color: "#fecaca",
};
