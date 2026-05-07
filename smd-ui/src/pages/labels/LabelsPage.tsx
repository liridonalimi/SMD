import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { searchBins, type BinHitDto } from "../../services/bins";
import { listInventory } from "../../services/inventory";
import { listBins, listRacks, listWarehouses, listZones, type LookupDto } from "../../services/lookups";
import type { InventoryListItemDto } from "../../types/inventory";

type LabelMode = "bin" | "location" | "series";

type PrintableLabel = {
  id: string;
  mode: LabelMode;
  title: string;
  code: string;
  subtitle: string;
  lines: string[];
  copies: number;
};

const LABELS_STORAGE_KEY = "smd:labels:print-list";

function isLabelMode(value: unknown): value is LabelMode {
  return value === "bin" || value === "location" || value === "series";
}

function parseStoredLabel(value: unknown): PrintableLabel | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<PrintableLabel>;
  if (
    typeof item.id !== "string" ||
    !isLabelMode(item.mode) ||
    typeof item.title !== "string" ||
    typeof item.code !== "string" ||
    typeof item.subtitle !== "string" ||
    !Array.isArray(item.lines)
  ) {
    return null;
  }

  return {
    id: item.id,
    mode: item.mode,
    title: item.title,
    code: item.code,
    subtitle: item.subtitle,
    lines: item.lines.filter((line): line is string => typeof line === "string"),
    copies: Math.max(1, Math.min(99, Math.trunc(Number(item.copies) || 1))),
  };
}

function loadStoredLabels() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LABELS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(parseStoredLabel).filter((item): item is PrintableLabel => item !== null);
  } catch {
    return [];
  }
}

function labelPrintTitle(labels: PrintableLabel[]) {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const type = labels.every((label) => label.mode === "bin")
    ? "Shporta"
    : labels.every((label) => label.mode === "location")
      ? "Lokacione"
      : labels.every((label) => label.mode === "series")
        ? "SeriaGrupi"
        : "TePerziera";

  return `Etiketat_${type}_${stamp}`;
}

function wholeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

const code128Patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

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

const softButtonStyle: CSSProperties = {
  background: "var(--panel-soft)",
};

const primaryButtonStyle: CSSProperties = {
  borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))",
  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 26%, var(--panel-strong)), color-mix(in srgb, var(--accent) 10%, var(--panel-soft)))",
};

function normalizeBarcodeText(value: string) {
  return value
    .trim()
    .replace(/[^\x20-\x7e]/g, "?")
    .slice(0, 48);
}

function code128Svg(value: string) {
  const text = normalizeBarcodeText(value);
  if (!text) return "";

  const codes = [104, ...Array.from(text).map((ch) => ch.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  const patterns = [...codes, checksum, 106].map((code) => code128Patterns[code]).join("");
  const quietZone = 10;
  const height = 52;
  let x = quietZone;
  const bars: string[] = [];

  for (const [index, char] of Array.from(patterns).entries()) {
    const width = Number(char);
    if (index % 2 === 0) {
      bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#111827"/>`);
    }
    x += width;
  }

  const totalWidth = x + quietZone;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none"><rect width="${totalWidth}" height="${height}" fill="#fff"/>${bars.join("")}</svg>`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(Math.trunc(value ?? 0));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("sq-AL");
}

function labelKey(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join("|");
}

export default function LabelsPage() {
  const [mode, setMode] = useState<LabelMode>("bin");
  const [labels, setLabels] = useState<PrintableLabel[]>(() => loadStoredLabels());
  const [copyDrafts, setCopyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [binTerm, setBinTerm] = useState("");
  const [binHits, setBinHits] = useState<BinHitDto[]>([]);

  const [warehouses, setWarehouses] = useState<LookupDto[]>([]);
  const [zones, setZones] = useState<LookupDto[]>([]);
  const [racks, setRacks] = useState<LookupDto[]>([]);
  const [bins, setBins] = useState<LookupDto[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [rackId, setRackId] = useState("");
  const [binId, setBinId] = useState("");

  const [inventoryTerm, setInventoryTerm] = useState("");
  const [inventoryRows, setInventoryRows] = useState<InventoryListItemDto[]>([]);

  useEffect(() => {
    if (labels.length === 0) {
      window.localStorage.removeItem(LABELS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(labels));
  }, [labels]);

  useEffect(() => {
    const ac = new AbortController();
    listWarehouses(ac.signal).then(setWarehouses).catch(() => undefined);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!warehouseId) {
      setZones([]);
      setZoneId("");
      return;
    }
    const ac = new AbortController();
    listZones(warehouseId, ac.signal).then(setZones).catch(() => setZones([]));
    setZoneId("");
    setRackId("");
    setBinId("");
    return () => ac.abort();
  }, [warehouseId]);

  useEffect(() => {
    if (!zoneId) {
      setRacks([]);
      setRackId("");
      return;
    }
    const ac = new AbortController();
    listRacks(zoneId, ac.signal).then(setRacks).catch(() => setRacks([]));
    setRackId("");
    setBinId("");
    return () => ac.abort();
  }, [zoneId]);

  useEffect(() => {
    if (!rackId) {
      setBins([]);
      setBinId("");
      return;
    }
    const ac = new AbortController();
    listBins(rackId, ac.signal).then(setBins).catch(() => setBins([]));
    setBinId("");
    return () => ac.abort();
  }, [rackId]);

  useEffect(() => {
    const q = binTerm.trim();
    if (mode !== "bin" || q.length < 2) {
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
  }, [binTerm, mode]);

  useEffect(() => {
    const q = inventoryTerm.trim();
    if (mode !== "series" || q.length < 2) {
      setInventoryRows([]);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      listInventory({ search: q, page: 1, pageSize: 20, sortBy: "sku", sortDir: "asc" }, ac.signal)
        .then((res) => setInventoryRows(res.data))
        .catch(() => {
          if (!ac.signal.aborted) setInventoryRows([]);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [inventoryTerm, mode]);

  const expandedLabels = useMemo(
    () => labels.flatMap((label) => Array.from({ length: label.copies }, (_, index) => ({ ...label, copyKey: `${label.id}-${index}` }))),
    [labels]
  );

  function addLabel(label: PrintableLabel) {
    setError(null);
    setLabels((current) => {
      const existing = current.find((item) => item.id === label.id);
      if (existing) {
        return current.map((item) => (item.id === label.id ? { ...item, copies: Math.min(item.copies + 1, 99) } : item));
      }
      return [...current, label];
    });
  }

  function addBinLabel(bin: BinHitDto) {
    addLabel({
      id: labelKey(["bin", bin.id]),
      mode: "bin",
      title: "Shporta",
      code: bin.code,
      subtitle: bin.name,
      lines: [
        `Depo: ${bin.warehouseCode ?? "-"}`,
        `Zona: ${bin.zoneCode ?? "-"}`,
        `Rafti: ${bin.rackCode ?? "-"}`,
      ],
      copies: 1,
    });
    setBinTerm("");
    setBinHits([]);
  }

  function addLocationLabel() {
    const warehouse = warehouses.find((item) => item.id === warehouseId);
    const zone = zones.find((item) => item.id === zoneId);
    const rack = racks.find((item) => item.id === rackId);
    const bin = bins.find((item) => item.id === binId);

    const selected = bin ?? rack ?? zone ?? warehouse;
    if (!selected) {
      setError("Zgjidh te pakten depon per te ndertuar etikete lokacioni.");
      return;
    }

    const title = bin ? "Shporta" : rack ? "Rafti" : zone ? "Zona" : "Depoja";
    addLabel({
      id: labelKey(["location", warehouse?.id, zone?.id, rack?.id, bin?.id]),
      mode: "location",
      title,
      code: selected.code,
      subtitle: selected.name,
      lines: [
        warehouse ? `Depo: ${warehouse.code} - ${warehouse.name}` : "",
        zone ? `Zona: ${zone.code} - ${zone.name}` : "",
        rack ? `Rafti: ${rack.code} - ${rack.name}` : "",
      ].filter(Boolean),
      copies: 1,
    });
  }

  function addSeriesLabel(row: InventoryListItemDto) {
    const series = row.lotNumber || "-";
    const productionGroup = row.batchNumber || "-";
    const code = row.lotNumber || row.batchNumber || row.productSku;

    addLabel({
      id: labelKey(["series", row.inventoryId]),
      mode: "series",
      title: "Seria / Grupi",
      code,
      subtitle: `${row.productSku} - ${row.productName}`,
      lines: [
        `Seria: ${series}`,
        `Grupi: ${productionGroup}`,
        `Skadon: ${formatDate(row.expiryDate)}`,
        `Shporta: ${row.binCode}`,
        `Sasia: ${formatQty(row.qtyOnHand)}`,
      ],
      copies: 1,
    });
  }

  function updateCopies(id: string, value: string) {
    const digits = wholeNumberInput(value);
    const normalized = digits.length > 2 ? digits.slice(-2) : digits;

    setCopyDrafts((current) => ({ ...current, [id]: normalized }));

    if (!normalized) return;

    const parsed = Math.trunc(Number(normalized));
    if (parsed >= 1 && parsed <= 99) {
      setLabels((current) => current.map((item) => (item.id === id ? { ...item, copies: parsed } : item)));
    }
  }

  function commitCopies(id: string) {
    const raw = copyDrafts[id];
    const digits = wholeNumberInput(raw ?? "");
    const copies = Math.max(1, Math.min(99, Math.trunc(Number(digits) || 1)));

    setLabels((items) => items.map((item) => (item.id === id ? { ...item, copies } : item)));

    setCopyDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function removeLabel(id: string) {
    setLabels((current) => current.filter((item) => item.id !== id));
  }

  function onPrint() {
    if (labels.length === 0) {
      setError("Shto te pakten nje etikete para printimit.");
      return;
    }

    const previousTitle = document.title;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    document.title = labelPrintTitle(labels);
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  }

  return (
    <div className="labels-page" style={{ display: "grid", gap: 18 }}>
      <section className="labels-no-print" style={{ ...panelStyle, padding: "clamp(18px, 2.2vw, 28px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.08em" }}>Depoja</div>
            <h1 style={{ margin: "6px 0", fontSize: "clamp(28px, 3vw, 42px)", lineHeight: 1.08 }}>Etiketat</h1>
            <p style={{ ...mutedStyle, maxWidth: 760, fontSize: 16 }}>
              Nderto etiketa per shporta, lokacione dhe seri/grup prodhimi. Shto etiketat ne listen e printimit dhe printoji ne A4.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setLabels([])} disabled={labels.length === 0} style={softButtonStyle}>
              Pastro listen
            </button>
            <button type="button" onClick={onPrint} disabled={labels.length === 0} style={primaryButtonStyle}>
              Printo etiketat
            </button>
          </div>
        </div>
      </section>

      <section className="labels-no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...panelStyle, padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 16 }}>
            <ModeButton active={mode === "bin"} onClick={() => setMode("bin")}>Shporta</ModeButton>
            <ModeButton active={mode === "location"} onClick={() => setMode("location")}>Lokacione</ModeButton>
            <ModeButton active={mode === "series"} onClick={() => setMode("series")}>Seria/Grupi</ModeButton>
          </div>

          {mode === "bin" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Etiketa shporte</h2>
              <p style={mutedStyle}>Kerko shporten dhe shtoje ne listen e printimit.</p>
              <input value={binTerm} onChange={(e) => setBinTerm(e.target.value)} placeholder="Kerko shporte me kod ose emer" style={inputStyle} />
              <div style={{ display: "grid", gap: 8 }}>
                {binHits.map((bin) => (
                  <button key={bin.id} type="button" onClick={() => addBinLabel(bin)} style={{ ...softButtonStyle, textAlign: "left" }}>
                    <strong>{bin.code}</strong>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                      {bin.name} · {bin.warehouseCode}/{bin.zoneCode}/{bin.rackCode}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "location" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Etiketa lokacioni</h2>
              <p style={mutedStyle}>Zgjidh depo, zone, raft ose shporte. Etiketa ndertohet per nivelin me te detajuar qe zgjedh.</p>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={inputStyle}>
                <option value="">Zgjidh depo</option>
                {warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
              </select>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={!warehouseId} style={inputStyle}>
                <option value="">Zgjidh zone</option>
                {zones.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
              </select>
              <select value={rackId} onChange={(e) => setRackId(e.target.value)} disabled={!zoneId} style={inputStyle}>
                <option value="">Zgjidh raft</option>
                {racks.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
              </select>
              <select value={binId} onChange={(e) => setBinId(e.target.value)} disabled={!rackId} style={inputStyle}>
                <option value="">Zgjidh shporte</option>
                {bins.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
              </select>
              <button type="button" onClick={addLocationLabel} style={primaryButtonStyle}>Shto etikete lokacioni</button>
            </div>
          ) : null}

          {mode === "series" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Etiketa serie/grupi</h2>
              <p style={mutedStyle}>Kerko sipas produktit, shportes, serise ose grupit.</p>
              <input value={inventoryTerm} onChange={(e) => setInventoryTerm(e.target.value)} placeholder="Kerko inventar" style={inputStyle} />
              <div className="standard-scrollbar" style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
                {inventoryRows.map((row) => (
                  <button key={row.inventoryId} type="button" onClick={() => addSeriesLabel(row)} style={{ ...softButtonStyle, textAlign: "left" }}>
                    <strong>{row.productSku}</strong> · {row.productName}
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
                      Seria: {row.lotNumber || "-"} · Grupi: {row.batchNumber || "-"} · Shporta: {row.binCode} · Sasia: {formatQty(row.qtyOnHand)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(239,68,68,0.32)", background: "rgba(239,68,68,0.10)", color: "#ffd2d2" }}>
              {error}
            </div>
          ) : null}
        </div>

        <div style={{ ...panelStyle, overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Lista e printimit</h2>
              <div style={mutedStyle}>{expandedLabels.length} etiketa gjithsej</div>
            </div>
          </div>

          <div className="standard-scrollbar" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }}>
                  <th style={thStyle}>Lloji</th>
                  <th style={thStyle}>Kodi</th>
                  <th style={thStyle}>Pershkrimi</th>
                  <th style={thStyle}>Kopje</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => (
                  <tr key={label.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>{label.title}</td>
                    <td style={{ ...tdStyle, fontWeight: 850 }}>{label.code}</td>
                    <td style={tdStyle}>
                      <div>{label.subtitle}</div>
                      <div style={mutedStyle}>{label.lines.join(" · ")}</div>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={copyDrafts[label.id] ?? String(label.copies)}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => updateCopies(label.id, e.target.value)}
                        onBlur={() => commitCopies(label.id)}
                        style={{ ...inputStyle, width: 90 }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => removeLabel(label.id)} style={softButtonStyle}>Largo</button>
                    </td>
                  </tr>
                ))}
                {labels.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", padding: 28 }}>
                      Lista eshte bosh.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="labels-print-area" aria-label="Etiketat per printim">
        {expandedLabels.map((label) => (
          <LabelPreview key={label.copyKey} label={label} />
        ))}
      </section>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "color-mix(in srgb, var(--accent) 18%, var(--panel-soft))" : "var(--panel-soft)",
        borderColor: active ? "color-mix(in srgb, var(--accent) 42%, var(--border))" : "var(--border)",
      }}
    >
      {children}
    </button>
  );
}

function LabelPreview({ label }: { label: PrintableLabel & { copyKey?: string } }) {
  const svg = code128Svg(label.code);

  return (
    <article className="warehouse-label">
      <div className="warehouse-label-type">{label.title}</div>
      <div className="warehouse-label-code">{label.code}</div>
      <div className="warehouse-label-subtitle">{label.subtitle}</div>
      <div className="warehouse-label-barcode" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="warehouse-label-barcode-text">{label.code}</div>
      <div className="warehouse-label-lines">
        {label.lines.map((line) => <span key={line}>{line}</span>)}
      </div>
      <div className="warehouse-label-footer">SMD · {new Date().toLocaleDateString("sq-AL")}</div>
    </article>
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
