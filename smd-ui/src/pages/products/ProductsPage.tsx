import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadFile } from "../../services/download";
import { createProduct, getNextProductBarcode, importProducts, listProducts, productBarcodeLabelsPdfUrl, productQrLabelsPdfUrl, updateProduct } from "../../services/products";
import { errorMessage } from "../../shared/errors";
import { ImportPanel } from "../../shared/ImportPanel";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { canEditMasterData } from "../../shared/permissions";
import { getSessionUser } from "../../shared/session";
import type { ProductRecordDto, UpsertProductDto } from "../../types/products";

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

const helperTextStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "var(--muted)",
  lineHeight: 1.45,
};

function formatMoney(value: number) {
  const formatted = new Intl.NumberFormat("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
  return `${formatted} €`;
}

function formatWhole(value: number) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(Math.trunc(value ?? 0));
}

function emptyForm(): UpsertProductDto {
  return {
    sku: "",
    name: "",
    barcode: "",
    description: "",
    unitOfMeasure: "pcs",
    minStockLevel: 5,
    purchasePrice: 0,
    retailPrice: 0,
    wholesalePrice: 0,
    vipPrice: 0,
    isActive: true,
  };
}

export default function ProductsPage() {
  const navigate = useNavigate();
  const me = getSessionUser();
  const allowEditMasterData = canEditMasterData(me?.role);
  const pageSize = 10;
  const [items, setItems] = useState<ProductRecordDto[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertProductDto>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [printingBarcode, setPrintingBarcode] = useState(false);
  const [printingQr, setPrintingQr] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    listProducts(query.trim() || undefined, ac.signal)
      .then((data) => {
        setItems(data);
        setPage(1);
        if (selectedId && !data.some((x) => x.id === selectedId)) {
          setSelectedId(null);
        }
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [query, selectedId]);

  const selectedItem = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length]
  );

  const pagedItems = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, totalPages]);

  const missingBarcodeCount = useMemo(
    () => items.filter((item) => !item.barcode?.trim()).length,
    [items]
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedItem) return;
    setForm({
      sku: selectedItem.sku,
      name: selectedItem.name,
      barcode: selectedItem.barcode ?? "",
      description: selectedItem.description ?? "",
      unitOfMeasure: selectedItem.unitOfMeasure ?? "pcs",
      minStockLevel: Math.trunc(selectedItem.minStockLevel ?? 0),
      purchasePrice: selectedItem.purchasePrice ?? 0,
      retailPrice: selectedItem.retailPrice ?? 0,
      wholesalePrice: selectedItem.wholesalePrice ?? 0,
      vipPrice: selectedItem.vipPrice ?? 0,
      isActive: selectedItem.isActive,
    });
  }, [selectedItem]);

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm());
  }

  async function refreshProducts() {
    const refreshed = await listProducts(query.trim() || undefined);
    setItems(refreshed);
    setPage(1);
  }

  function setNumberField<K extends keyof UpsertProductDto>(key: K, value: string) {
    const parsed = value === "" ? 0 : Number(value);
    setForm((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  function setWholeNumberField<K extends keyof UpsertProductDto>(key: K, value: string) {
    if (!/^\d*$/.test(value)) return;
    const parsed = value === "" ? 0 : Number(value);
    setForm((current) => ({ ...current, [key]: Number.isFinite(parsed) ? Math.trunc(parsed) : 0 }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!allowEditMasterData) {
      setErr("Nuk keni te drejte te ndryshoni katalogun e produkteve.");
      return;
    }

    const minStockLevel = Number(form.minStockLevel ?? 0);
    if (!Number.isInteger(minStockLevel) || minStockLevel < 0) {
      setErr("Pragu minimal duhet te jete numer i plote.");
      return;
    }

    setSaving(true);

    const payload: UpsertProductDto = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      barcode: form.barcode?.trim() || null,
      description: form.description?.trim() || null,
      unitOfMeasure: form.unitOfMeasure?.trim() || "pcs",
      minStockLevel,
      purchasePrice: Number(form.purchasePrice ?? 0),
      retailPrice: Number(form.retailPrice ?? 0),
      wholesalePrice: Number(form.wholesalePrice ?? 0),
      vipPrice: Number(form.vipPrice ?? 0),
      isActive: form.isActive ?? true,
    };

    try {
      if (selectedId) {
        await updateProduct(selectedId, payload);
      } else {
        await createProduct(payload);
      }

      resetForm();
      await refreshProducts();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateBarcode() {
    setGeneratingBarcode(true);
    setErr(null);
    try {
      const result = await getNextProductBarcode();
      setForm((current) => ({ ...current, barcode: result.barcode }));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setGeneratingBarcode(false);
    }
  }

  async function printBarcodeLabels() {
    if (!selectedId) {
      setErr("Zgjidh nje produkt ekzistues para se te printosh etiketa.");
      return;
    }

    if (!form.barcode?.trim()) {
      setErr("Produkti nuk ka barcode. Gjenero ose vendos nje barcode te standardit EAN-13 para printimit.");
      return;
    }

    setPrintingBarcode(true);
    setErr(null);
    try {
      await downloadFile(productBarcodeLabelsPdfUrl(selectedId, 18), `barcode-${form.sku}.pdf`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPrintingBarcode(false);
    }
  }

  async function printQrLabels() {
    if (!selectedId) {
      setErr("Zgjidh nje produkt ekzistues para se te printosh etiketa.");
      return;
    }

    setPrintingQr(true);
    setErr(null);
    try {
      await downloadFile(productQrLabelsPdfUrl(selectedId, 18), `qr-${form.sku}.pdf`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPrintingQr(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageIntro
        title="Produktet"
              subtitle="Menaxho katalogun e produkteve dhe vendos cmimin e blerjes, cmimin epakices, cmimin e shumices dhe cmimin VIP ne nje vend."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }}>
        <SurfaceCard>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Lista e produkteve</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Kerko sipas SKU, emrit ose barkodit dhe zgjidh produktin per editim.
                {missingBarcodeCount > 0 ? ` ${missingBarcodeCount} produkte jane pa barcode.` : ""}
              </div>
            </div>
            <div style={{ minWidth: 280 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kerko produkt me SKU, emrer ose barkod"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {loading ? <div>Duke u ngarkuar...</div> : null}
            {!loading && items.length === 0 ? <div>Nuk ka produkte te regjistruara.</div> : null}
            {pagedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                style={{
                  ...buttonStyle,
                  textAlign: "left",
                  background: selectedId === item.id ? "rgba(96, 165, 250, 0.12)" : "var(--panel-soft)",
                  border: selectedId === item.id ? "1px solid rgba(96, 165, 250, 0.32)" : buttonStyle.border,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{item.sku} - {item.name}</div>
                  {!item.isActive ? <span style={{ fontSize: 12, opacity: 0.72 }}>Jo aktiv</span> : null}
                </div>
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                  {item.barcode ? `Barcode: ${item.barcode} • ` : "Pa barcode • "}Njesia: {item.unitOfMeasure} • Prag minimal: {formatWhole(item.minStockLevel)}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(148, 163, 184, 0.12)" }}>Blerje: {formatMoney(item.purchasePrice)}</span>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(96, 165, 250, 0.12)" }}>Pakice: {formatMoney(item.retailPrice)}</span>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)" }}>Shumice: {formatMoney(item.wholesalePrice)}</span>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(251, 191, 36, 0.12)" }}>VIP: {formatMoney(item.vipPrice)}</span>
                </div>
              </button>
            ))}

            {!loading && items.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 4,
                  paddingTop: 8,
                }}
              >
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  Po shfaqen {(Math.min(page, totalPages) - 1) * pageSize + 1}-{Math.min(Math.min(page, totalPages) * pageSize, items.length)} nga {items.length} produkte
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    style={{ ...buttonStyle, opacity: page <= 1 ? 0.55 : 1 }}
                  >
                    Prapa
                  </button>
                  <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                    Faqe {Math.min(page, totalPages)} / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    style={{ ...buttonStyle, opacity: page >= totalPages ? 0.55 : 1 }}
                  >
                    Tjetra
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          {allowEditMasterData ? (
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {selectedId ? "Perditeso produktin" : "Shto produkt te ri"}
              </div>
              {selectedId ? (
                <button type="button" onClick={() => navigate(`/products/${selectedId}/history`)} style={buttonStyle}>
                  Historia e produktit
                </button>
              ) : null}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
              <input value={form.sku} onChange={(e) => setForm((v) => ({ ...v, sku: e.target.value }))} placeholder="SKU" style={inputStyle} disabled={!!selectedId} />
              <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="Emri i produktit" style={inputStyle} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input value={form.barcode ?? ""} onChange={(e) => setForm((v) => ({ ...v, barcode: e.target.value }))} placeholder="Barcode" style={inputStyle} />
                  <button
                    type="button"
                    onClick={generateBarcode}
                    disabled={generatingBarcode}
                    style={{ ...buttonStyle, whiteSpace: "nowrap" }}
                  >
                    {generatingBarcode ? "..." : "Gjenero"}
                  </button>
                </div>
                <div style={helperTextStyle}>
                  Nese produkti nuk ka barcode nga prodhuesi, kliko <b>Gjenero</b>. SMD krijon nje EAN-13 te brendshem qe mund ta printojme si etikete per scanner.
                </div>
                {selectedId && form.barcode?.trim() ? (
                  <button
                    type="button"
                    onClick={printBarcodeLabels}
                    disabled={printingBarcode}
                    style={{ ...buttonStyle, marginTop: 8, width: "100%" }}
                  >
                    {printingBarcode ? "Duke pergatitur PDF..." : "Printo etiketa barcode"}
                  </button>
                ) : null}
                {selectedId ? (
                  <button
                    type="button"
                    onClick={printQrLabels}
                    disabled={printingQr}
                    style={{ ...buttonStyle, marginTop: 8, width: "100%" }}
                  >
                    {printingQr ? "Duke pergatitur PDF..." : "Printo etiketa QR"}
                  </button>
                ) : null}
              </div>
              <input value={form.unitOfMeasure ?? "pcs"} onChange={(e) => setForm((v) => ({ ...v, unitOfMeasure: e.target.value }))} placeholder="Njesia (pcs, kg, m)" style={inputStyle} />
            </div>

            <textarea value={form.description ?? ""} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} placeholder="Pershkrimi" rows={3} style={{ ...inputStyle, resize: "vertical" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={Math.trunc(Number(form.minStockLevel ?? 0))}
                  onChange={(e) => setWholeNumberField("minStockLevel", e.target.value)}
                  placeholder="Pragu minimal"
                  style={inputStyle}
                />
                <div style={helperTextStyle}>
                  Pragu minimal i lejuar ne stok. P.sh. vlera <b>5</b> do te thote se sistemi sinjalizon kur produkti bie ne 5 ose me pak.
                </div>
              </div>
              <div style={{ ...inputStyle, display: "flex", alignItems: "center", opacity: 0.78 }}>
                SKU nuk lejohet te ndryshohet pasi produkti te krijohet.
              </div>
            </div>

            <div style={{ fontWeight: 700, marginTop: 4 }}>Cmimet</div>
            <div style={{ ...helperTextStyle, marginTop: -4 }}>
              Vendos cmimet sipas rolit tregtar te produktit: <b>Blerje</b> eshte kostoja nga furnizuesi, <b>Pakice</b> eshte cmimi standard per shitje individuale, <b>Shumice</b> per klientet me sasi me te medha, dhe <b>VIP</b> per klientet e vecante ose me marreveshje preferenciale.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setNumberField("purchasePrice", e.target.value)} placeholder="Cmimi i blerjes" style={inputStyle} />
                <div style={helperTextStyle}>Cmimi me te cilen e blen produktin nga furnizuesi.</div>
              </div>
              <div>
                <input type="number" min="0" step="0.01" value={form.retailPrice} onChange={(e) => setNumberField("retailPrice", e.target.value)} placeholder="Cmimi i pakices" style={inputStyle} />
                <div style={helperTextStyle}>Cmimi standard per shitje nje nga nje te klienti.</div>
              </div>
              <div>
                <input type="number" min="0" step="0.01" value={form.wholesalePrice} onChange={(e) => setNumberField("wholesalePrice", e.target.value)} placeholder="Cmimi i shumices" style={inputStyle} />
                <div style={helperTextStyle}>Cmimi me zbritje per klientet qe blejne me sasi te medha.</div>
              </div>
              <div>
                <input type="number" min="0" step="0.01" value={form.vipPrice} onChange={(e) => setNumberField("vipPrice", e.target.value)} placeholder="Cmimi VIP" style={inputStyle} />
                <div style={helperTextStyle}>Cmim special per klientet VIP ose marreveshje te vecanta.</div>
              </div>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={form.isActive ?? true} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))} />
              Aktiv
            </label>

            {err ? (
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca" }}>
                {err}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? "Duke ruajtur..." : selectedId ? "Ruaj ndryshimet" : "Shto"}
              </button>
              <button type="button" onClick={resetForm} style={buttonStyle}>
                Pastro
              </button>
            </div>
          </form>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Katalogu eshte vetem per lexim</div>
              <div style={{ color: "var(--muted)", lineHeight: 1.5 }}>
                Vetem Admin dhe Menaxher mund te shtojne ose ndryshojne produkte. Mund te kerkoni produkte dhe te hapni historikun e tyre nga lista.
              </div>
              {selectedId ? (
                <button type="button" onClick={() => navigate(`/products/${selectedId}/history`)} style={buttonStyle}>
                  Historia e produktit
                </button>
              ) : null}
            </div>
          )}
        </SurfaceCard>
      </div>

      {allowEditMasterData ? (
      <SurfaceCard>
        <ImportPanel
          title="Import nga XLSX, XLS ose CSV"
          hint="Header-at kryesore: sku, name, barcode, unit, minStock, purchasePrice, retailPrice, wholesalePrice, vipPrice. SKU dhe emri jane te detyrueshme. Kolona barcode duhet te jete e standardit EAN-13 me 13 shifra, jo format 2.92423E+12."
          importFile={importProducts}
          onImported={refreshProducts}
        />
      </SurfaceCard>
      ) : null}
    </div>
  );
}
