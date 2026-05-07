import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addSalesOrderLine,
  cancelSalesOrder,
  confirmSalesOrder,
  createOutboundFromSalesOrder,
  createSalesOrder,
  deleteSalesOrderLine,
  getSalesOrder,
  listSalesOrders,
} from "../../services/orders";
import { listCustomersLookup } from "../../services/partners";
import { listInventory } from "../../services/inventory";
import { errorMessage } from "../../shared/errors";
import { orderStatusLabel } from "../../shared/orderLabels";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import type { InventoryListItemDto } from "../../types/inventory";
import type { OrderListItem, SalesOrderDetails } from "../../types/orders";
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

const priceTierLabels = ["Pakice", "Shumice", "VIP"];

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
  gridTemplateColumns: "1.6fr 0.8fr 0.6fr 0.7fr 0.8fr auto",
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

export default function SalesOrdersPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<SalesOrderDetails | null>(null);
  const [customers, setCustomers] = useState<PartnerLookupDto[]>([]);
  const [inventory, setInventory] = useState<InventoryListItemDto[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [inventoryQ, setInventoryQ] = useState("");
  const [showInventorySearchResults, setShowInventorySearchResults] = useState(false);
  const [selectedInventorySnapshot, setSelectedInventorySnapshot] = useState<InventoryListItemDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ customerId: "", priceTier: 0, reference: "", note: "", requestedDate: "" });
  const [showDateRequired, setShowDateRequired] = useState(false);
  const [line, setLine] = useState({ inventoryId: "", quantity: "1", priceTier: 0 });
  const [showInventoryRequired, setShowInventoryRequired] = useState(false);
  const [showQuantityIssue, setShowQuantityIssue] = useState(false);
  const canCreateOrder = !!draft.requestedDate;
  const selectedInventory = useMemo(
    () => inventory.find((item) => item.inventoryId === line.inventoryId) ?? (
      selectedInventorySnapshot?.inventoryId === line.inventoryId ? selectedInventorySnapshot : undefined
    ),
    [inventory, line.inventoryId, selectedInventorySnapshot]
  );
  const selectedInventoryExistingQty = useMemo(() => {
    if (!selectedInventory || !details) return 0;
    return details.lines
      .filter((row) =>
        row.productId === selectedInventory.productId &&
        row.fromBinId === selectedInventory.binId &&
        (row.lotNumber ?? "") === (selectedInventory.lotNumber ?? "") &&
        (row.batchNumber ?? "") === (selectedInventory.batchNumber ?? "") &&
        ((row.expiryDate ?? "").slice(0, 10)) === ((selectedInventory.expiryDate ?? "").slice(0, 10))
      )
      .reduce((sum, row) => sum + Number(row.quantity), 0);
  }, [details, selectedInventory]);
  const visibleInventory = useMemo(() => {
    const inventoryRows = [...inventory];
    if (
      selectedInventorySnapshot &&
      selectedInventorySnapshot.inventoryId === line.inventoryId &&
      !inventoryRows.some((item) => item.inventoryId === selectedInventorySnapshot.inventoryId)
    ) {
      inventoryRows.unshift(selectedInventorySnapshot);
    }

    const search = normalizeSearch(inventoryQ);
    if (!search) return inventoryRows;

    return inventoryRows.filter((item) =>
      normalizeSearch(item.productSku).includes(search) ||
      normalizeSearch(item.productName).includes(search) ||
      normalizeSearch(`${item.productSku} - ${item.productName}`).includes(search) ||
      normalizeSearch(item.productBarcode).includes(search) ||
      normalizeSearch(item.binCode).includes(search) ||
      normalizeSearch(item.warehouseCode).includes(search)
    );
  }, [inventory, inventoryQ, line.inventoryId, selectedInventorySnapshot]);
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
    setShowInventoryRequired(false);
    setShowQuantityIssue(false);
  }

  function loadMoreOrders() {
    if (hasMoreOrders) {
      setPage((p) => Math.min(totalPages, p + 1));
    }
  }

  async function refreshOrders(targetSelectedId = selectedId) {
    const data = await listSalesOrders(q.trim() || undefined);
    setOrders(data);
    if (targetSelectedId) setDetails(await getSalesOrder(targetSelectedId));
  }

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      listSalesOrders(q.trim() || undefined, ac.signal),
      listCustomersLookup(undefined, ac.signal),
      listInventory({ search: inventoryQ, onlyInStock: true, pageSize: 50, sortBy: "sku" }, ac.signal),
    ])
      .then(([orderRows, customerRows, inventoryRows]) => {
        setOrders(orderRows);
        setCustomers(customerRows);
        setInventory(inventoryRows.data.filter((x) => x.qtyAvailable > 0));
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      });
    return () => ac.abort();
  }, [q, inventoryQ]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    getSalesOrder(selectedId).then(setDetails).catch((e) => setErr(errorMessage(e)));
  }, [selectedId]);

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
      <PageIntro title="Porosite e shitjes" subtitle="Krijo porosi klienti, rezervo stokun dhe ktheje ne dokument dalje kur porosia dergohet." />
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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kerko PS, reference ose klient" style={inputStyle} />
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
                <div style={{ marginTop: 5, color: "var(--muted-strong)", fontSize: 13 }}>{item.partnerName ?? "Pa klient"} | {item.lineCount} rreshta | {money(item.total)}</div>
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Porosi e re shitjeje</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>
              Klienti
              <select value={draft.customerId} onChange={(e) => setDraft((v) => ({ ...v, customerId: e.target.value }))} style={inputStyle}>
                <option value="">Pa klient</option>
                {customers.map((x) => <option key={x.id} value={x.id}>{x.code} - {x.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Lista e cmimit
              <select value={draft.priceTier} onChange={(e) => setDraft((v) => ({ ...v, priceTier: Number(e.target.value) }))} style={inputStyle}>
                {priceTierLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Referenca e porosise
              <input value={draft.reference} onChange={(e) => setDraft((v) => ({ ...v, reference: e.target.value }))} placeholder="p.sh. PS-2026-001" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Data *
              <input
                type="date"
                required
                value={draft.requestedDate}
                max={maxInputDate}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value || /^\d{0,4}(-\d{0,2})?(-\d{0,2})?$/.test(value)) {
                    clearFormFeedback();
                    setDraft((v) => ({ ...v, requestedDate: value }));
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
              title={!canCreateOrder ? "Ploteso daten." : undefined}
              style={buttonStyle}
              onClick={() => {
                if (!canCreateOrder) {
                  setShowDateRequired(true);
                  setErr("Ploteso daten para se ta krijosh porosine e shitjes.");
                  return;
                }

                void run(async () => {
              const created = await createSalesOrder({
                customerId: draft.customerId || null,
                priceTier: draft.priceTier,
                reference: draft.reference || null,
                note: draft.note || null,
                requestedDate: toIsoDate(draft.requestedDate),
              });
              setSelectedId(created.id);
              setDraft({ customerId: "", priceTier: 0, reference: "", note: "", requestedDate: "" });
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
              <div style={{ color: "var(--muted-strong)", marginTop: 4 }}>{details.customerName ?? "Pa klient"} | {priceTierLabels[details.priceTier] ?? "Cmim"} {details.outboundDocumentId ? "| Ka dalje te krijuar" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {details.status === "Draft" ? <button disabled={busy} style={buttonStyle} onClick={() => run(() => confirmSalesOrder(details.id))}>Konfirmo dhe rezervo</button> : null}
              {details.status === "Confirmed" ? <button disabled={busy} style={buttonStyle} onClick={() => run(async () => {
                const doc = await createOutboundFromSalesOrder(details.id);
                nav(`/outbound/${doc.id}`);
              })}>Krijo dalje</button> : null}
              {details.status !== "Fulfilled" && details.status !== "Cancelled" ? <button disabled={busy} style={buttonStyle} onClick={() => run(() => cancelSalesOrder(details.id))}>Anulo</button> : null}
            </div>
          </div>

          {details.status === "Draft" ? (
            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <input value={inventoryQ} onChange={(e) => {
                clearFormFeedback();
                setInventoryQ(e.target.value);
                setShowInventorySearchResults(true);
              }} placeholder="Kerko stok sipas SKU, emrit ose barkodit" style={inputStyle} />
              {inventoryQ.trim() && showInventorySearchResults ? (
                <div className="standard-scrollbar" style={searchResultsStyle}>
                  {visibleInventory.length > 0 ? visibleInventory.slice(0, 8).map((item) => (
                    <button
                      key={item.inventoryId}
                      type="button"
                      onClick={() => {
                        clearFormFeedback();
                        setLine((v) => ({ ...v, inventoryId: item.inventoryId }));
                        setSelectedInventorySnapshot(item);
                        setInventoryQ(`${item.productSku} - ${item.productName}`);
                        setShowInventorySearchResults(false);
                      }}
                      style={searchResultButtonStyle}
                    >
                      <b>{item.productSku}</b> - {item.productName}
                      <span style={{ display: "block", marginTop: 4, color: "var(--muted-strong)", fontSize: 12 }}>
                        {item.warehouseCode}/{item.binCode} | te disponueshem {item.qtyAvailable}
                      </span>
                    </button>
                  )) : (
                    <div style={{ padding: 10, color: "var(--muted-strong)", fontSize: 13 }}>
                      Nuk u gjet stok per kete kerkim.
                    </div>
                  )}
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr auto", gap: 10, alignItems: "end" }}>
                <label style={labelStyle}>
                  Produkti dhe lokacioni i stokut
                  <select value={line.inventoryId} onChange={(e) => {
                    const item = visibleInventory.find((x) => x.inventoryId === e.target.value);
                    clearFormFeedback();
                    setLine((v) => ({ ...v, inventoryId: e.target.value }));
                    setSelectedInventorySnapshot(item ?? null);
                    setInventoryQ(item ? `${item.productSku} - ${item.productName}` : inventoryQ);
                    setShowInventorySearchResults(false);
                  }} style={{
                    ...inputStyle,
                    borderColor: showInventoryRequired ? "rgba(239, 68, 68, 0.72)" : "var(--border)",
                    boxShadow: showInventoryRequired ? "0 0 0 3px rgba(239, 68, 68, 0.12)" : undefined,
                  }}>
                    <option value="">Zgjidh rresht inventari</option>
                    {visibleInventory.map((x) => <option key={x.inventoryId} value={x.inventoryId}>{x.productSku} - {x.productName} | {x.warehouseCode}/{x.binCode} | te disponueshem {x.qtyAvailable}</option>)}
                  </select>
                  {showInventoryRequired ? (
                    <span style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>
                      Zgjidh produktin dhe stokun para se ta shtosh ne porosi.
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
                      borderColor: showQuantityIssue ? "rgba(239, 68, 68, 0.72)" : "var(--border)",
                      boxShadow: showQuantityIssue ? "0 0 0 3px rgba(239, 68, 68, 0.12)" : undefined,
                    }}
                  />
                  {showQuantityIssue ? (
                    <span style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>
                      Sasia duhet te jete e vlefshme.
                    </span>
                  ) : null}
                </label>
                <button
                  type="button"
                  disabled={busy}
                  style={buttonStyle}
                  onClick={() => {
                    if (!line.inventoryId) {
                      setShowInventoryRequired(true);
                      setErr("Zgjidh produktin dhe stokun para se ta shtosh ne porosine e shitjes.");
                      return;
                    }
                    if (!line.quantity || Number(line.quantity) <= 0) {
                      setShowQuantityIssue(true);
                      setErr("Sasia duhet te jete e vlefshme.");
                      return;
                    }
                    if (selectedInventory) {
                      const requestedTotal = Number(line.quantity) + selectedInventoryExistingQty;
                      if (requestedTotal > selectedInventory.qtyAvailable) {
                        setShowQuantityIssue(true);
                        setErr(`Sasia nuk mjafton per ${selectedInventory.productSku} - ${selectedInventory.productName}. Te disponueshme: ${selectedInventory.qtyAvailable}.`);
                        return;
                      }
                    }

                    void run(() => addSalesOrderLine(details.id, {
                    inventoryId: line.inventoryId,
                    quantity: Number(line.quantity),
                    priceTier: details.priceTier,
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
                <div>Lokacioni</div>
                <div>Sasia</div>
                <div>Rezervuar</div>
                <div>Totali</div>
                <div />
              </div>
            ) : null}
            {details.lines.map((l) => (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 0.6fr 0.7fr 0.8fr auto", gap: 10, alignItems: "center", padding: 10, borderRadius: 12, background: "var(--panel-soft)" }}>
                <div><b>{l.productSku}</b> - {l.productName}</div>
                <div>{l.fromBinCode}</div>
                <div>{l.quantity}</div>
                <div>Rez: {l.reservedQuantity}</div>
                <div>{money(l.lineTotal)}</div>
                {details.status === "Draft" ? <button type="button" style={buttonStyle} onClick={() => run(() => deleteSalesOrderLine(details.id, l.id))}>Fshi</button> : <span />}
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
