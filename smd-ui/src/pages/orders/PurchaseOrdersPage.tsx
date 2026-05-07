import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addPurchaseOrderLine,
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createInboundFromPurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrderLine,
  getPurchaseOrder,
  listPurchaseOrders,
} from "../../services/orders";
import { listProducts } from "../../services/products";
import { listSuppliersLookup } from "../../services/partners";
import { errorMessage } from "../../shared/errors";
import { orderStatusLabel } from "../../shared/orderLabels";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import type { OrderListItem, PurchaseOrderDetails } from "../../types/orders";
import type { ProductRecordDto } from "../../types/products";
import type { PartnerLookupDto } from "../../types/partners";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
  cursor: "pointer",
};

const dateInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: undefined,
  backgroundColor: "var(--panel-soft)",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "var(--muted-strong)",
  fontSize: 13,
  fontWeight: 700,
};

const searchResultsStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  maxHeight: 220,
  overflowY: "auto",
  padding: 8,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
};

const searchResultButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  textAlign: "left",
  padding: 10,
};

function money(value: number) {
  return `${new Intl.NumberFormat("sq-AL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0)} €`;
}

function normalizeSearch(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const lineHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.7fr 0.6fr 0.7fr 0.8fr auto",
  gap: 10,
  padding: "0 10px",
  color: "var(--muted)",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const maxInputDate = "9999-12-31";
const statusFilterOptions = [
  { value: "", label: "Te gjitha statuset" },
  { value: "Draft", label: "Draft" },
  { value: "Cancelled", label: "Anuluar" },
  { value: "Confirmed", label: "Konfirmuar" },
  { value: "Fulfilled", label: "Kthyer ne dokument" },
];
const orderPageSize = 5;

function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) throw new Error("Data duhet te jete date valide.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Data nuk eshte valide.");
  }
  if (trimmed > maxInputDate) throw new Error("Viti i dates nuk mund te kete me shume se 4 shifra.");
  return trimmed;
}

export default function PurchaseOrdersPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<PurchaseOrderDetails | null>(null);
  const [suppliers, setSuppliers] = useState<PartnerLookupDto[]>([]);
  const [products, setProducts] = useState<ProductRecordDto[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [productQ, setProductQ] = useState("");
  const [showProductSearchResults, setShowProductSearchResults] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ supplierId: "", reference: "", note: "", expectedDate: "" });
  const [showDateRequired, setShowDateRequired] = useState(false);
  const [line, setLine] = useState({ productId: "", quantity: "1", unitPrice: "" });
  const [showProductRequired, setShowProductRequired] = useState(false);
  const [showQuantityRequired, setShowQuantityRequired] = useState(false);
  const [showPriceRequired, setShowPriceRequired] = useState(false);

  async function refreshOrders(targetSelectedId = selectedId) {
    const data = await listPurchaseOrders(q.trim() || undefined);
    setOrders(data);
    if (targetSelectedId) {
      const next = await getPurchaseOrder(targetSelectedId);
      setDetails(next);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      listPurchaseOrders(q.trim() || undefined, ac.signal),
      listSuppliersLookup(undefined, ac.signal),
      listProducts(undefined, ac.signal),
    ])
      .then(([orderRows, supplierRows, productRows]) => {
        setOrders(orderRows);
        setSuppliers(supplierRows);
        setProducts(productRows);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      });
    return () => ac.abort();
  }, [q]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    getPurchaseOrder(selectedId).then(setDetails).catch((e) => setErr(errorMessage(e)));
  }, [selectedId]);

  const selectedProduct = useMemo(() => products.find((x) => x.id === line.productId), [line.productId, products]);
  const visibleProducts = useMemo(() => {
    const search = normalizeSearch(productQ);
    if (!search) return products;

    return products.filter((item) =>
      normalizeSearch(item.sku).includes(search) ||
      normalizeSearch(item.name).includes(search) ||
      normalizeSearch(`${item.sku} - ${item.name}`).includes(search) ||
      normalizeSearch(item.barcode).includes(search)
    );
  }, [products, productQ]);
  const canCreateOrder = !!draft.expectedDate;
  const filteredOrders = useMemo(
    () => orders.filter((item) => !statusFilter || item.status === statusFilter),
    [orders, statusFilter]
  );
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredOrders.length / orderPageSize)), [filteredOrders.length]);
  const visibleOrderCount = Math.min(page * orderPageSize, filteredOrders.length);
  const pagedOrders = useMemo(() => {
    return filteredOrders.slice(0, Math.min(page * orderPageSize, filteredOrders.length));
  }, [filteredOrders, page]);
  const hasMoreOrders = visibleOrderCount < filteredOrders.length;

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function clearFormFeedback() {
    setErr(null);
    setShowDateRequired(false);
    setShowProductRequired(false);
    setShowQuantityRequired(false);
    setShowPriceRequired(false);
  }

  function loadMoreOrders() {
    if (hasMoreOrders) {
      setPage((p) => Math.min(totalPages, p + 1));
    }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    clearFormFeedback();
    try {
      const result = await action();
      await refreshOrders(typeof result === "string" ? result : selectedId);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageIntro title="Porosite e blerjes" subtitle="Krijo porosi te furnizuesit, konfirmoje dhe ktheje ne dokument pranim kur malli arrin." />

      {err ? <div style={{ padding: 12, borderRadius: 12, background: "rgba(248,113,113,0.12)", color: "#fecaca" }}>{err}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 18 }}>
        <SurfaceCard>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Lista e porosive</div>
            <div style={{ display: "grid", gridTemplateColumns: "190px 300px", gap: 10, alignItems: "center" }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              >
                {statusFilterOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kerko PB, reference ose furnizues" style={inputStyle} />
            </div>
          </div>
          <div
            className="standard-scrollbar"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
                loadMoreOrders();
              }
            }}
            onWheel={(e) => {
              if (e.deltaY > 0) loadMoreOrders();
            }}
            style={{ display: "grid", gap: 10, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}
          >
            {pagedOrders.map((item) => (
              <button key={item.id} type="button" onClick={() => {
                setSelectedId(item.id);
                clearFormFeedback();
              }} style={{ ...buttonStyle, textAlign: "left", background: item.id === selectedId ? "rgba(96,165,250,0.14)" : "var(--panel-soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <b>{item.orderNo}</b>
                  <span>{orderStatusLabel(item.status)}</span>
                </div>
                <div style={{ marginTop: 5, color: "var(--muted-strong)", fontSize: 13 }}>{item.partnerName ?? "Pa furnizues"} | {item.lineCount} rreshta | {money(item.total)}</div>
              </button>
            ))}
            {filteredOrders.length === 0 ? (
              <div style={{ padding: 12, borderRadius: 12, background: "var(--panel-soft)", color: "var(--muted-strong)", fontSize: 13 }}>
                Nuk ka porosi me kete filter.
              </div>
            ) : null}
            {hasMoreOrders ? (
              <div style={{ padding: 10, borderRadius: 12, background: "var(--panel-soft)", color: "var(--muted-strong)", fontSize: 13, textAlign: "center" }}>
                Vazhdo me scroll per te shfaqur porosi te tjera.
              </div>
            ) : null}
          </div>
          {filteredOrders.length > orderPageSize ? (
            <div style={{ marginTop: 14, color: "var(--muted-strong)", fontSize: 13 }}>
              <span>
                Po shfaqen 1-{visibleOrderCount} nga {filteredOrders.length} porosi
              </span>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Porosi e re blerjeje</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>
              Furnizuesi
              <select value={draft.supplierId} onChange={(e) => setDraft((v) => ({ ...v, supplierId: e.target.value }))} style={inputStyle}>
                <option value="">Pa furnizues</option>
                {suppliers.map((x) => <option key={x.id} value={x.id}>{x.code} - {x.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Referenca e porosise
              <input value={draft.reference} onChange={(e) => setDraft((v) => ({ ...v, reference: e.target.value }))} placeholder="p.sh. PB-2026-001" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Data *
              <input
                type="date"
                required
                value={draft.expectedDate}
                max={maxInputDate}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value || /^\d{0,4}(-\d{0,2})?(-\d{0,2})?$/.test(value)) {
                    clearFormFeedback();
                    setDraft((v) => ({ ...v, expectedDate: value }));
                  }
                }}
                style={{
                  ...dateInputStyle,
                  borderColor: showDateRequired ? "rgba(239, 68, 68, 0.72)" : "var(--border)",
                  boxShadow: showDateRequired ? "0 0 0 3px rgba(239, 68, 68, 0.12)" : undefined,
                }}
              />
              {showDateRequired ? (
                <span style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>
                  Data eshte e detyrueshme per te krijuar porosine.
                </span>
              ) : null}
            </label>
            <label style={labelStyle}>
              Shenim
              <textarea value={draft.note} onChange={(e) => setDraft((v) => ({ ...v, note: e.target.value }))} placeholder="Shenim" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </label>
            <button
              type="button"
              disabled={busy}
              title={!canCreateOrder ? "Ploteso daten e pritshme." : undefined}
              style={buttonStyle}
              onClick={() => {
                if (!canCreateOrder) {
                  setShowDateRequired(true);
                  setErr("Ploteso daten para se ta krijosh porosine e blerjes.");
                  return;
                }

                void run(async () => {
              const created = await createPurchaseOrder({
                supplierId: draft.supplierId || null,
                reference: draft.reference || null,
                note: draft.note || null,
                expectedDate: toIsoDate(draft.expectedDate),
              });
              setSelectedId(created.id);
              setDraft({ supplierId: "", reference: "", note: "", expectedDate: "" });
              setShowDateRequired(false);
              return created.id;
                });
              }}
            >
              Krijo porosi
            </button>
          </div>
        </SurfaceCard>
      </div>

      {details ? (
        <SurfaceCard>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{details.orderNo} | {orderStatusLabel(details.status)}</div>
              <div style={{ color: "var(--muted-strong)", marginTop: 4 }}>{details.supplierName ?? "Pa furnizues"} {details.inboundDocumentId ? "| Ka pranim te krijuar" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {details.status === "Draft" ? <button disabled={busy} style={buttonStyle} onClick={() => run(() => confirmPurchaseOrder(details.id))}>Konfirmo</button> : null}
              {details.status === "Confirmed" ? <button disabled={busy} style={buttonStyle} onClick={() => run(async () => {
                const doc = await createInboundFromPurchaseOrder(details.id);
                nav(`/inbound/${doc.id}`);
              })}>Krijo pranim</button> : null}
              {details.status !== "Fulfilled" && details.status !== "Cancelled" ? <button disabled={busy} style={buttonStyle} onClick={() => run(() => cancelPurchaseOrder(details.id))}>Anulo</button> : null}
            </div>
          </div>

          {details.status === "Draft" ? (
            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <input
                value={productQ}
                onChange={(e) => {
                  clearFormFeedback();
                  setProductQ(e.target.value);
                  setShowProductSearchResults(true);
                }}
                placeholder="Kerko produkt sipas SKU, emrit ose barkodit"
                style={inputStyle}
              />
              {productQ.trim() && showProductSearchResults ? (
                <div className="standard-scrollbar" style={searchResultsStyle}>
                  {visibleProducts.length > 0 ? visibleProducts.slice(0, 8).map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        clearFormFeedback();
                        setLine((v) => ({ ...v, productId: product.id, unitPrice: String(product.purchasePrice) }));
                        setProductQ(`${product.sku} - ${product.name}`);
                        setShowProductSearchResults(false);
                      }}
                      style={searchResultButtonStyle}
                    >
                      <b>{product.sku}</b> - {product.name}
                      <span style={{ display: "block", marginTop: 4, color: "var(--muted-strong)", fontSize: 12 }}>
                        Barcode: {product.barcode || "Pa barcode"} | Blerje: {money(product.purchasePrice)}
                      </span>
                    </button>
                  )) : (
                    <div style={{ padding: 10, color: "var(--muted-strong)", fontSize: 13 }}>
                      Nuk u gjet produkt per kete kerkim.
                    </div>
                  )}
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                <label style={labelStyle}>
                  Produkti
                  <select value={line.productId} onChange={(e) => {
                    const product = products.find((x) => x.id === e.target.value);
                    clearFormFeedback();
                    setLine((v) => ({ ...v, productId: e.target.value, unitPrice: product ? String(product.purchasePrice) : "" }));
                    setProductQ(product ? `${product.sku} - ${product.name}` : "");
                    setShowProductSearchResults(false);
                  }} style={{
                    ...inputStyle,
                    borderColor: showProductRequired ? "rgba(239, 68, 68, 0.72)" : "var(--border)",
                    boxShadow: showProductRequired ? "0 0 0 3px rgba(239, 68, 68, 0.12)" : undefined,
                  }}>
                    <option value="">Zgjidh produktin</option>
                    {visibleProducts.map((x) => <option key={x.id} value={x.id}>{x.sku} - {x.name}</option>)}
                  </select>
                  {showProductRequired ? (
                    <span style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>
                      Zgjidh produktin para se ta shtosh ne porosi.
                    </span>
                  ) : null}
                </label>
                <label style={labelStyle}>
                  Sasia
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={line.quantity}
                    onChange={(e) => {
                      if (!/^\d*$/.test(e.target.value)) return;
                      clearFormFeedback();
                      setLine((v) => ({ ...v, quantity: e.target.value }));
                    }}
                    style={{
                      ...inputStyle,
                      borderColor: showQuantityRequired ? "rgba(239, 68, 68, 0.72)" : "var(--border)",
                      boxShadow: showQuantityRequired ? "0 0 0 3px rgba(239, 68, 68, 0.12)" : undefined,
                    }}
                  />
                  {showQuantityRequired ? (
                    <span style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>
                      Sasia duhet te jete e vlefshme.
                    </span>
                  ) : null}
                </label>
                <label style={labelStyle}>
                  Cmimi i blerjes
                  <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => {
                    clearFormFeedback();
                    setLine((v) => ({ ...v, unitPrice: e.target.value }));
                  }} style={{
                    ...inputStyle,
                    borderColor: showPriceRequired ? "rgba(239, 68, 68, 0.72)" : "var(--border)",
                    boxShadow: showPriceRequired ? "0 0 0 3px rgba(239, 68, 68, 0.12)" : undefined,
                  }} />
                  {showPriceRequired ? (
                    <span style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>
                      Cmimi i blerjes duhet te jete i vlefshem.
                    </span>
                  ) : null}
                </label>
                <button
                  type="button"
                  disabled={busy}
                  style={buttonStyle}
                  onClick={() => {
                    const productMissing = !selectedProduct;
                    const quantityInvalid = !line.quantity || Number(line.quantity) <= 0;
                    const priceInvalid = line.unitPrice === "" || Number(line.unitPrice) <= 0;

                    setShowProductRequired(productMissing);
                    setShowQuantityRequired(quantityInvalid);
                    setShowPriceRequired(priceInvalid);

                    if (productMissing || quantityInvalid || priceInvalid) {
                      if (productMissing) {
                        setErr("Zgjidh produktin para se ta shtosh ne porosine e blerjes.");
                      } else if (quantityInvalid) {
                        setErr("Ploteso sasine para se ta shtosh produktin.");
                      } else {
                        setErr("Ploteso cmimin e blerjes para se ta shtosh produktin.");
                      }
                      return;
                    }

                    void run(() => addPurchaseOrderLine(details.id, {
                    productId: line.productId,
                    quantity: Number(line.quantity),
                    unitPrice: Number(line.unitPrice),
                    }));
                  }}
                >
                  Shto
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {details.lines.length > 0 ? (
              <div style={lineHeaderStyle}>
                <div>Produkti</div>
                <div>Sasia</div>
                <div>Cmimi blerjes</div>
                <div>Totali</div>
                <div />
              </div>
            ) : null}
            {details.lines.map((l) => (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.7fr 0.6fr 0.7fr 0.8fr auto", gap: 10, alignItems: "center", padding: 10, borderRadius: 12, background: "var(--panel-soft)" }}>
                <div><b>{l.productSku}</b> - {l.productName}</div>
                <div>{l.quantity}</div>
                <div>{money(l.unitPrice)}</div>
                <div>{money(l.lineTotal)}</div>
                {details.status === "Draft" ? <button type="button" style={buttonStyle} onClick={() => run(() => deletePurchaseOrderLine(details.id, l.id))}>Fshi</button> : <span />}
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
