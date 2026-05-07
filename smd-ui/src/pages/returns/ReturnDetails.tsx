import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addReturnLine, cancelReturn, confirmReturn, deleteReturnLine, getReturn } from "../../services/returns";
import { searchProducts, type ProductHitDto } from "../../services/products";
import { getSuggestedBins, searchBins, type BinHitDto, type SuggestedBinDto } from "../../services/bins";
import type { DocumentStatus, OutboundPriceTier } from "../../types/documents";
import type { ReturnDetails as ReturnDetailsDto, ReturnDocumentType } from "../../types/returns";

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

const dangerButtonStyle: CSSProperties = {
  borderColor: "rgba(239,68,68,0.32)",
  background: "rgba(239,68,68,0.10)",
  color: "#ffd2d2",
};

function typeLabel(type: ReturnDocumentType) {
  return type === 1 ? "Kthim nga klienti" : "Kthim te furnizuesi";
}

function statusLabel(status: DocumentStatus) {
  if (status === 1) return "Konfirmuar";
  if (status === 2) return "Anuluar";
  return "Draft";
}

function priceTierLabel(tier: OutboundPriceTier) {
  if (tier === 1) return "Shumice";
  if (tier === 2) return "VIP";
  return "Pakice";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("sq-AL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value ?? 0)} €`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sq-AL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateOnly(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizeWholeInput(value: string) {
  return /^\d*$/.test(value) ? value : null;
}

function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDisplayDateToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlighted(text: string | undefined | null, term: string) {
  const source = text ?? "";
  const query = term.trim();
  if (!source || query.length < 2) return source || "-";
  const regex = new RegExp(`(${escapeRegExp(query)})`, "ig");
  return source.split(regex).map((part, index) => (
    <Fragment key={`${part}-${index}`}>
      {part.toLowerCase() === query.toLowerCase() ? (
        <mark style={{ background: "rgba(250, 204, 21, 0.18)", color: "inherit", padding: "0 2px", borderRadius: 4 }}>
          {part}
        </mark>
      ) : part}
    </Fragment>
  ));
}

export default function ReturnDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<ReturnDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productTerm, setProductTerm] = useState("");
  const [productHits, setProductHits] = useState<ProductHitDto[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductHitDto | null>(null);
  const [binTerm, setBinTerm] = useState("");
  const [binHits, setBinHits] = useState<Array<BinHitDto | SuggestedBinDto>>([]);
  const [selectedBin, setSelectedBin] = useState<BinHitDto | SuggestedBinDto | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [lotNumber, setLotNumber] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [priceTier, setPriceTier] = useState<OutboundPriceTier>(0);

  const isDraft = data?.status === 0;
  const isCustomerReturn = data?.type === 1;

  async function reload(signal?: AbortSignal) {
    if (!id) return;
    const detail = await getReturn(id, signal);
    setData(detail);
    setError(null);
  }

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    setLoading(true);
    reload(ac.signal)
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Kthimi nuk u lexua.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    const q = productTerm.trim();
    if (selectedProduct || q.length < 2) {
      setProductHits([]);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      searchProducts(q, ac.signal)
        .then(setProductHits)
        .catch(() => {
          if (!ac.signal.aborted) setProductHits([]);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [productTerm, selectedProduct]);

  useEffect(() => {
    const q = binTerm.trim();
    if (selectedBin || q.length < 2) {
      setBinHits([]);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      const load = data?.type === 2 && selectedProduct
        ? getSuggestedBins(selectedProduct.id, ac.signal, q, true)
        : searchBins(q, ac.signal);

      load
        .then(setBinHits)
        .catch(() => {
          if (!ac.signal.aborted) setBinHits([]);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [binTerm, selectedBin, selectedProduct, data?.type]);

  const partnerLabel = useMemo(() => {
    if (!data) return "-";
    if (data.type === 1) return data.customerCode ? `${data.customerCode} - ${data.customerName}` : "-";
    return data.supplierCode ? `${data.supplierCode} - ${data.supplierName}` : "-";
  }, [data]);

  function selectProduct(product: ProductHitDto) {
    setSelectedProduct(product);
    setProductTerm(`${product.sku} - ${product.name}`);
    setProductHits([]);
    setSelectedBin(null);
    setBinTerm("");
  }

  function selectBin(bin: BinHitDto | SuggestedBinDto) {
    setSelectedBin(bin);
    setBinTerm(`${bin.code} - ${bin.name}`);
    setBinHits([]);

    if ("lotNumber" in bin) {
      setLotNumber(bin.lotNumber ?? "");
      setBatchNumber(bin.batchNumber ?? "");
      setExpiryDate(formatDateOnly(bin.expiryDate));
    }
  }

  function clearLineForm() {
    setProductTerm("");
    setProductHits([]);
    setSelectedProduct(null);
    setBinTerm("");
    setBinHits([]);
    setSelectedBin(null);
    setQuantity("1");
    setLotNumber("");
    setBatchNumber("");
    setExpiryDate("");
    setPriceTier(0);
  }

  async function onAddLine() {
    if (!id || !data || !selectedProduct || !selectedBin) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Sasia duhet te jete numer i plote me i madh se zero.");
      return;
    }

    const expiryDateIso = parseDisplayDateToIso(expiryDate);
    if (expiryDateIso === undefined) {
      setError("Skadenca duhet te jete ne formatin dd/mm/yyyy, p.sh. 06/06/2026.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addReturnLine(id, {
        productId: selectedProduct.id,
        binId: selectedBin.id,
        lotNumber: lotNumber.trim() || null,
        batchNumber: batchNumber.trim() || null,
        expiryDate: expiryDateIso,
        priceTier: data.type === 1 ? priceTier : null,
        quantity: qty,
      });
      clearLineForm();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rreshti nuk u shtua.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteLine(lineId: string) {
    if (!id || !window.confirm("A deshiron ta fshish kete rresht?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteReturnLine(id, lineId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rreshti nuk u fshi.");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirm() {
    if (!id || !data) return;
    if (data.lines.length === 0) {
      setError("Kthimi nuk mund te konfirmohet pa rreshta.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const detail = await confirmReturn(id);
      setData(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kthimi nuk u konfirmua.");
    } finally {
      setSaving(false);
    }
  }

  async function onCancel() {
    if (!id || !window.confirm("A deshiron ta anulosh kete kthim?")) return;
    setSaving(true);
    setError(null);
    try {
      const detail = await cancelReturn(id);
      setData(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kthimi nuk u anulua.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ ...panelStyle, padding: 24 }}>Duke u lexuar kthimi...</div>;
  }

  if (!data) {
    return (
      <div style={{ ...panelStyle, padding: 24 }}>
        <button type="button" onClick={() => nav("/returns")}>Kthehu</button>
        <p style={{ marginTop: 16 }}>{error ?? "Kthimi nuk u gjet."}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...panelStyle, padding: "clamp(18px, 2.2vw, 28px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <button type="button" onClick={() => nav("/returns")} style={{ background: "var(--panel-soft)", marginBottom: 12 }}>
              Kthehu te kthimet
            </button>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.08em" }}>
              {typeLabel(data.type)}
            </div>
            <h1 style={{ margin: "6px 0", fontSize: "clamp(28px, 3vw, 42px)", lineHeight: 1.08 }}>{data.documentNo}</h1>
            <div style={{ color: "var(--muted-strong)" }}>
              Statusi: <b style={{ color: "var(--text)" }}>{statusLabel(data.status)}</b> · Partneri: <b style={{ color: "var(--text)" }}>{partnerLabel}</b>
            </div>
            <div style={{ ...mutedStyle, marginTop: 4 }}>Krijuar: {formatDate(data.createdAt)}</div>
            {data.reference ? <div style={{ ...mutedStyle, marginTop: 4 }}>Reference: {data.reference}</div> : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isDraft ? (
              <>
                <button type="button" onClick={onConfirm} disabled={saving || data.lines.length === 0} style={primaryButtonStyle}>
                  Konfirmo kthimin
                </button>
                <button type="button" onClick={onCancel} disabled={saving} style={dangerButtonStyle}>
                  Anulo
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void reload()} style={{ background: "var(--panel-soft)" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 18 }}>
          <Kpi title="Rreshta" value={data.lines.length} />
          <Kpi title="Vlera" value={formatMoney(data.documentTotal)} />
          <Kpi title="Ndikimi ne stok" value={data.type === 1 ? "Shton stok" : "Heq stok"} />
        </div>
      </section>

      {isDraft ? (
        <section style={{ ...panelStyle, padding: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Shto produkt</h2>
          <div style={mutedStyle}>
            {data.type === 1
              ? "Kthimi nga klienti shton stok ne shporten e zgjedhur."
              : "Kthimi te furnizuesi heq stok nga shporta e zgjedhur. Pasi zgjedh produktin, shporta tregon vetem stokun ekzistues per ate produkt."}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, marginTop: 14, alignItems: "end" }}>
            <div style={{ position: "relative", display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Produkti</span>
              <input
                value={productTerm}
                onChange={(e) => {
                  setSelectedProduct(null);
                  setProductTerm(e.target.value);
                }}
                placeholder="Kerko SKU, emer ose barcode"
                style={inputStyle}
              />
              {productHits.length > 0 ? (
                <div style={dropdownStyle}>
                  {productHits.slice(0, 8).map((product) => (
                    <button key={product.id} type="button" onMouseDown={() => selectProduct(product)} style={dropdownButtonStyle}>
                      <strong>{renderHighlighted(product.sku, productTerm)}</strong>
                      <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                        {renderHighlighted(product.name, productTerm)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ position: "relative", display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Shporta</span>
              <input
                value={binTerm}
                disabled={data.type === 2 && !selectedProduct}
                onChange={(e) => {
                  setSelectedBin(null);
                  setBinTerm(e.target.value);
                }}
                placeholder={data.type === 2 && !selectedProduct ? "Zgjidh produktin fillimisht" : "Kerko shporte"}
                style={inputStyle}
              />
              {binHits.length > 0 ? (
                <div style={dropdownStyle}>
                  {binHits.slice(0, 8).map((bin) => (
                    <button key={`${bin.id}-${"lotNumber" in bin ? bin.lotNumber ?? "" : ""}-${"batchNumber" in bin ? bin.batchNumber ?? "" : ""}`} type="button" onMouseDown={() => selectBin(bin)} style={dropdownButtonStyle}>
                      <strong>{bin.code}</strong>
                      <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                        {bin.warehouseCode}/{bin.zoneCode}/{bin.rackCode}
                        {"availableQty" in bin && typeof bin.availableQty === "number" ? ` · gjendje ${formatQty(bin.availableQty)}` : ""}
                      </span>
                      {"lotNumber" in bin && (bin.lotNumber || bin.batchNumber || bin.expiryDate) ? (
                        <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                          {bin.lotNumber ? `Seria ${bin.lotNumber}` : "Pa seri"}
                          {bin.batchNumber ? ` · Grupi ${bin.batchNumber}` : ""}
                          {bin.expiryDate ? ` · Skadon ${formatDateOnly(bin.expiryDate)}` : ""}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Sasia</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantity}
                onChange={(e) => {
                  const normalized = normalizeWholeInput(e.target.value);
                  if (normalized !== null) setQuantity(normalized);
                }}
                placeholder="p.sh. 10"
                style={inputStyle}
              />
            </label>

            {isCustomerReturn ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={mutedStyle}>Cmimi</span>
                <select value={priceTier} onChange={(e) => setPriceTier(Number(e.target.value) as OutboundPriceTier)} style={inputStyle}>
                  <option value={0}>Pakice</option>
                  <option value={1}>Shumice</option>
                  <option value={2}>VIP</option>
                </select>
              </label>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Seria</span>
              <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Opsionale" style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Grupi</span>
              <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Opsionale" style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={mutedStyle}>Skadenca</span>
              <input
                value={expiryDate}
                inputMode="numeric"
                maxLength={10}
                onChange={(e) => setExpiryDate(maskDateInput(e.target.value))}
                placeholder="dd/mm/yyyy"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" onClick={onAddLine} disabled={saving || !selectedProduct || !selectedBin} style={primaryButtonStyle}>
              Shto rreshtin
            </button>
            <button type="button" onClick={clearLineForm} disabled={saving} style={{ background: "var(--panel-soft)" }}>
              Pastro
            </button>
          </div>
        </section>
      ) : null}

      <section style={{ ...panelStyle, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Rreshtat</h2>
          <div style={mutedStyle}>Produktet e perfshira ne kthim.</div>
        </div>

        <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }}>
                <th style={thStyle}>Produkti</th>
                <th style={thStyle}>Shporta</th>
                <th style={thStyle}>Seria/Grupi</th>
                <th style={thStyle}>Sasia</th>
                <th style={thStyle}>Cmimi</th>
                <th style={thStyle}>Vlera</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={tdStyle}>
                    <strong>{line.productSku}</strong>
                    <div>{line.productName}</div>
                    {line.productBarcode ? <div style={mutedStyle}>Barcode: {line.productBarcode}</div> : null}
                  </td>
                  <td style={tdStyle}>
                    <strong>{line.binCode}</strong>
                    <div style={mutedStyle}>{line.warehouseCode}/{line.zoneCode}/{line.rackCode}</div>
                  </td>
                  <td style={tdStyle}>
                    <div>{line.lotNumber || "-"}</div>
                    <div style={mutedStyle}>{line.batchNumber || "-"}</div>
                    <div style={mutedStyle}>{formatDateOnly(line.expiryDate) || "-"}</div>
                  </td>
                  <td style={tdStyle}>{formatQty(line.quantity)}</td>
                  <td style={tdStyle}>{data.type === 1 ? priceTierLabel(line.priceTier) : "Blerje"}</td>
                  <td style={tdStyle}>{formatMoney(line.lineTotal)}</td>
                  <td style={tdStyle}>
                    {isDraft ? (
                      <button type="button" disabled={saving} onClick={() => void onDeleteLine(line.id)} style={dangerButtonStyle}>
                        Fshi
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", padding: 28 }}>
                    Kthimi nuk ka rreshta ende.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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

const dropdownStyle: CSSProperties = {
  position: "absolute",
  top: 72,
  left: 0,
  right: 0,
  zIndex: 10,
  display: "grid",
  gap: 6,
  padding: 8,
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "var(--panel-strong)",
  boxShadow: "var(--shadow)",
};

const dropdownButtonStyle: CSSProperties = {
  textAlign: "left",
  background: "var(--panel-soft)",
};

const thStyle: CSSProperties = {
  padding: "12px 14px",
  fontWeight: 800,
};

const tdStyle: CSSProperties = {
  padding: "14px",
  verticalAlign: "top",
};
