import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listInventory, getInventoryCharts, getInventoryExpiryReport, getInventorySummary, getInventoryStockAlerts, inventoryExcelUrl, inventoryReorderExcelUrl, } from "../../services/inventory";
import type { InventoryExpiryFilter, InventoryExpiryItemDto, InventoryExpiryReportDto, InventoryListItemDto, InventoryProductStockAlertDto, InventorySortBy, InventoryStockAlertsDto, PagedInventoryResponse } from "../../types/inventory";
import { errorMessage } from "../../shared/errors";
import { listWarehouses, listZones, listRacks, listBins, type LookupDto } from "../../services/lookups";
import { downloadFile } from "../../services/download";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { isExactScanMatch, normalizeScannerValue } from "../../shared/scanner";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}
function formatNum(n: number) {
    return new Intl.NumberFormat().format(n ?? 0);
}

function formatDateOnly(value: string | undefined | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("sq-AL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

const stickyThStyle = {
    padding: 10,
    position: "sticky" as const,
    top: 0,
    zIndex: 2,
    background: "color-mix(in srgb, var(--panel-strong) 92%, transparent)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.06)",
    whiteSpace: "nowrap" as const,
};
function warehouseLabel(r: InventoryListItemDto) {
    return r.warehouseName
        ? `${r.warehouseCode} — ${r.warehouseName}`
        : r.warehouseCode;
}

export default function InventoryPage() {

    const [warehouseId, setWarehouseId] = useState("");
    const [zoneId, setZoneId] = useState("");
    const [rackId, setRackId] = useState("");
    const [binId, setBinId] = useState("");

    const [warehouses, setWarehouses] = useState<LookupDto[]>([]);
    const [zones, setZones] = useState<LookupDto[]>([]);
    const [racks, setRacks] = useState<LookupDto[]>([]);
    const [bins, setBins] = useState<LookupDto[]>([]);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const scannerInputRef = useRef<HTMLInputElement | null>(null);
    const [scannerValue, setScannerValue] = useState("");
    const [scannerPendingTerm, setScannerPendingTerm] = useState<string | null>(null);
    const [scannerFeedback, setScannerFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

    const resetFilters = () => {
        setSearch("");
        setScannerValue("");
        setScannerPendingTerm(null);
        setScannerFeedback(null);
        setOnlyInStock(false);
        setOnlyOutOfStock(false);
        setOnlyBelowMinStock(false);
        setExpiryFilter("");
        setLowStockThreshold(5);

        setWarehouseId("");
        setZoneId("");
        setRackId("");
        setBinId("");

        // opsionale: zbraz dropdown lists poshtë (do mbushen prapë nga useEffect)
        setZones([]);
        setRacks([]);
        setBins([]);

        setSortBy("sku");
        setSortDir("asc");

        setPage(1);
    };
    
    useEffect(() => {
        const ac = new AbortController();
        listWarehouses(ac.signal).then(setWarehouses).catch(() => { });
        return () => ac.abort();
    }, []);

    useEffect(() => {
        const ac = new AbortController();

        // reset downstream
        setZoneId(""); setRackId(""); setBinId("");
        setZones([]); setRacks([]); setBins([]);

        if (!warehouseId) return;

        listZones(warehouseId, ac.signal).then(setZones).catch(() => { });
        return () => ac.abort();
    }, [warehouseId]);

    useEffect(() => {
        const ac = new AbortController();

        setRackId(""); setBinId("");
        setRacks([]); setBins([]);

        if (!zoneId) return;

        listRacks(zoneId, ac.signal).then(setRacks).catch(() => { });
        return () => ac.abort();
    }, [zoneId]);

    useEffect(() => {
        const ac = new AbortController();

        setBinId("");
        setBins([]);

        if (!rackId) return;

        listBins(rackId, ac.signal).then(setBins).catch(() => { });
        return () => ac.abort();
    }, [rackId]);


    // ---- Query state
    const [search, setSearch] = useState("");
    const [onlyInStock, setOnlyInStock] = useState(false);
    const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
    const [onlyBelowMinStock, setOnlyBelowMinStock] = useState(false);
    const [expiryFilter, setExpiryFilter] = useState<InventoryExpiryFilter>("");
    const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);

    const [sortBy, setSortBy] = useState<InventorySortBy>("sku");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    const [page, setPage] = useState(1);
    const pageSize = 25;

    // ---- Data state
    const [rows, setRows] = useState<InventoryListItemDto[]>([]);
    const [total, setTotal] = useState(0);

    const [summary, setSummary] = useState<{
        totalProducts: number;
        totalQtyOnHand: number;
        totalQtyReserved: number;
        totalQtyAvailable: number;
        productsInStock: number;
        productsOutOfStock: number;
        lowStockProducts: number;
    } | null>(null);
    
    const [charts, setCharts] = useState<any>(null);
    const [expiryReport, setExpiryReport] = useState<InventoryExpiryReportDto | null>(null);
    const [stockAlerts, setStockAlerts] = useState<InventoryStockAlertsDto | null>(null);
    //const [charts, setCharts] = useState<InventoryChartsDto | null>(null);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // ---- debounce search
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        if (!scannerFeedback) return;
        const t = window.setTimeout(() => setScannerFeedback(null), 2200);
        return () => window.clearTimeout(t);
    }, [scannerFeedback]);

    const abortRef = useRef<AbortController | null>(null);

    const query = useMemo(
        () => ({
            page,
            pageSize,
            search: debouncedSearch,
            onlyInStock,
            onlyOutOfStock,
            onlyBelowMinStock,
            expiryFilter: expiryFilter || undefined,
            lowStockThreshold,
            sortBy,
            sortDir,

            // ✅ NEW: location filters
            warehouseId: warehouseId || undefined,
            zoneId: zoneId || undefined,
            rackId: rackId || undefined,
            binId: binId || undefined,
        }),
        [
            page,
            pageSize,
            debouncedSearch,
            onlyInStock,
            onlyOutOfStock,
            onlyBelowMinStock,
            expiryFilter,
            lowStockThreshold,
            sortBy,
            sortDir,

            // ✅ NEW deps
            warehouseId,
            zoneId,
            rackId,
            binId,
        ]
    );


    // ---- load list + summary + charts
    useEffect(() => {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        (async () => {
            setLoading(true);
            setErr(null);
            try {
                const [listRes, summaryRes, chartsRes, expiryRes, stockAlertsRes] = await Promise.all([
                    listInventory(query, ac.signal),
                    getInventorySummary(lowStockThreshold, ac.signal),
                    //getInventoryCharts({ days: 30, top: 10, lowStockThreshold }, ac.signal),
                    getInventoryCharts(
                        { days: 30, top: 10, lowStockThreshold, warehouseId: warehouseId || undefined },
                        ac.signal
                    ),
                    getInventoryExpiryReport(
                        { warehouseId: warehouseId || undefined },
                        ac.signal
                    ),
                    getInventoryStockAlerts({ lowStockThreshold, top: 20 }, ac.signal),

                ]);

                const list = listRes as PagedInventoryResponse;
                setRows(list.data ?? []);
                setTotal(list.total ?? 0);

                setSummary(summaryRes as any);
                setCharts(chartsRes as any);
                setExpiryReport(expiryRes as InventoryExpiryReportDto);
                setStockAlerts(stockAlertsRes as InventoryStockAlertsDto);
            } catch (e) {
                if ((e as any)?.name === "AbortError") return;
                setErr(errorMessage(e));
            } finally {
                setLoading(false);
            }
        })();

        return () => ac.abort();
    }, [query, lowStockThreshold]);

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(total / pageSize));
    }, [total, pageSize]);
    const criticalRows = useMemo(() => rows.filter((r) => r.isBelowMinStock), [rows]);
    const outOfStockPreview = useMemo(() => (stockAlerts?.outOfStockItems ?? []).slice(0, 8), [stockAlerts]);
    const lowStockPreview = useMemo(() => (stockAlerts?.lowStockItems ?? []).slice(0, 8), [stockAlerts]);
    const scannedInventoryRow = useMemo(() => {
        if (!scannerPendingTerm) return null;
        return rows.find((row) => isExactScanMatch(scannerPendingTerm, row.productSku, row.productBarcode)) ?? null;
    }, [rows, scannerPendingTerm]);

    useEffect(() => {
        // keep page in range if total changes
        setPage((p) => clamp(p, 1, totalPages));
    }, [totalPages]);

    useEffect(() => {
        if (!scannerPendingTerm || loading) return;

        if (scannedInventoryRow) {
            setScannerFeedback({
                tone: "success",
                message: `${scannedInventoryRow.productSku} u gjet ne ${scannedInventoryRow.warehouseCode} / ${scannedInventoryRow.binCode}.`,
            });
            return;
        }

        if (rows.length === 0) {
            setScannerFeedback({
                tone: "error",
                message: `Nuk u gjet inventar per kodin ${scannerPendingTerm}.`,
            });
            return;
        }

        setScannerFeedback({
            tone: "error",
            message: `U gjeten rezultate per ${scannerPendingTerm}, por jo perputhje ekzakte me SKU/Barkod.`,
        });
    }, [loading, rows.length, scannedInventoryRow, scannerPendingTerm]);

    useEffect(() => {
        const t = window.setTimeout(() => scannerInputRef.current?.focus(), 80);
        return () => window.clearTimeout(t);
    }, []);

    const onToggleInStock = () => {
        setOnlyInStock((v) => {
            const next = !v;
            if (next) setOnlyOutOfStock(false);
            if (next) setOnlyBelowMinStock(false);
            setPage(1);
            return next;
        });
    };

    const onToggleOutOfStock = () => {
        setOnlyOutOfStock((v) => {
            const next = !v;
            if (next) setOnlyInStock(false);
            if (next) setOnlyBelowMinStock(false);
            setPage(1);
            return next;
        });
    };

    const onToggleBelowMinStock = () => {
        setOnlyBelowMinStock((v) => {
            const next = !v;
            if (next) {
                setOnlyInStock(false);
                setOnlyOutOfStock(false);
            }
            setPage(1);
            return next;
        });
    };

    const onSort = (col: InventorySortBy) => {
        setSortBy((prev) => {
            if (prev !== col) {
                setSortDir("asc");
                setPage(1);
                return col;
            }
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            setPage(1);
            return prev;
        });
    };

    function submitScannerSearch(rawValue: string) {
        const normalized = normalizeScannerValue(rawValue);
        if (!normalized) {
            setScannerFeedback({ tone: "error", message: "Skano nje barkod ose shkruaj SKU-ne." });
            return;
        }

        setScannerValue("");
        setScannerPendingTerm(normalized);
        setSearch(normalized);
        setDebouncedSearch(normalized);
        setPage(1);
        window.setTimeout(() => {
            scannerInputRef.current?.focus();
            scannerInputRef.current?.select();
        }, 30);
    }
    
    // ---- Mini “bar” chart renderer (no deps)
    const WarehouseBars = () => {
        const pts = charts?.stockByWarehouse ?? [];
        if (!pts.length) return <div style={{ opacity: 0.7 }}>S’ka të dhëna.</div>;

        const max = Math.max(...pts.map((x: any) => x.qtyAvailable ?? 0), 1);

        return (
            <div style={{ display: "grid", gap: 10 }}>
                {pts.slice(0, 8).map((p: any) => {
                    const w = Math.round(((p.qtyAvailable ?? 0) / max) * 100);
                    return (
                        <div key={p.warehouseId} style={{ display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.9 }}>
                                <span>{p.warehouseName ? `${p.warehouseCode} — ${p.warehouseName}`: p.warehouseCode}</span>
                                <span>{formatNum(p.qtyAvailable)}</span>
                            </div>
                            <div
                                style={{
                                    height: 10,
                                    borderRadius: 999,
                                    background: "rgba(255,255,255,0.08)",
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        width: `${w}%`,
                                        height: "100%",
                                        background: "rgba(93, 173, 226, 0.75)",
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const ExpiryListCard = ({
        title,
        subtitle,
        items,
        tone,
    }: {
        title: string;
        subtitle: string;
        items: InventoryExpiryItemDto[];
        tone: "danger" | "warn" | "info";
    }) => {
        const toneStyles =
            tone === "danger"
                ? {
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.18)",
                    chip: expiredChipStyle,
                }
                : tone === "warn"
                    ? {
                        background: "rgba(251, 191, 36, 0.08)",
                        border: "1px solid rgba(251, 191, 36, 0.18)",
                        chip: nearExpiryChipStyle,
                    }
                    : {
                        background: "rgba(96, 165, 250, 0.08)",
                        border: "1px solid rgba(96, 165, 250, 0.18)",
                        chip: infoChipStyle,
                    };

        return (
            <SurfaceCard style={{ padding: 14, background: toneStyles.background, border: toneStyles.border }}>
                <div style={{ fontWeight: 700 }}>{title}</div>
                <div style={{ opacity: 0.76, fontSize: 12, marginTop: 3 }}>{subtitle}</div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {items.length === 0 ? (
                        <div style={{ opacity: 0.7 }}>Nuk ka artikuj ne kete kategori.</div>
                    ) : (
                        items.map((item) => (
                            <div key={item.inventoryId} style={{ padding: 10, borderRadius: 12, background: "var(--panel-soft)", border: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700 }}>
                                            {item.productSku} — {item.productName}
                                        </div>
                                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                                            Depo: {item.warehouseCode} • Shporta: {item.binCode}
                                        </div>
                                    </div>
                                    <span style={toneStyles.chip}>{formatDateOnly(item.expiryDate)}</span>
                                </div>

                                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {item.lotNumber ? <span style={infoChipStyle}>Lot: {item.lotNumber}</span> : null}
                                    {item.batchNumber ? <span style={infoChipStyle}>Batch: {item.batchNumber}</span> : null}
                                    <span style={qtyChipStyle}>Ne dispozicion: {formatNum(item.qtyAvailable)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SurfaceCard>
        );
    };

    const StockProductListCard = ({
        title,
        subtitle,
        items,
        tone,
        emptyText,
    }: {
        title: string;
        subtitle: string;
        items: InventoryProductStockAlertDto[];
        tone: "danger" | "warn";
        emptyText: string;
    }) => {
        const toneStyle = tone === "danger" ? expiredChipStyle : nearExpiryChipStyle;
        const cardTone =
            tone === "danger"
                ? { background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.18)" }
                : { background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.18)" };

        return (
            <SurfaceCard style={{ padding: 14, background: cardTone.background, border: cardTone.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <div>
                        <div style={{ fontWeight: 800 }}>{title}</div>
                        <div style={{ opacity: 0.76, fontSize: 12, marginTop: 3 }}>{subtitle}</div>
                    </div>
                    <div style={{ fontWeight: 800 }}>{formatNum(items.length)}</div>
                </div>

                <div className="standard-scrollbar" style={{ marginTop: 12, display: "grid", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
                    {items.length === 0 ? (
                        <div style={{ opacity: 0.72 }}>{emptyText}</div>
                    ) : (
                        items.map((item) => (
                            <Link
                                key={item.productId}
                                to={`/products/${item.productId}/history`}
                                style={{
                                    color: "inherit",
                                    textDecoration: "none",
                                    padding: 10,
                                    borderRadius: 12,
                                    background: "var(--panel-soft)",
                                    border: "1px solid var(--border)",
                                    display: "grid",
                                    gap: 8,
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 800 }}>
                                            {item.sku} — {item.name}
                                        </div>
                                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78 }}>
                                            {item.barcode ? `Barkodi: ${item.barcode}` : "Pa barkod"} • {item.hasInventoryRows ? "Ka rreshta inventari" : "Nuk ka rresht inventari"}
                                        </div>
                                    </div>
                                    <span style={toneStyle}>{tone === "danger" ? "Pa stok" : "Nen prag"}</span>
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <span style={qtyChipStyle}>Ne depo: {formatNum(item.qtyOnHand)}</span>
                                    <span style={qtyChipStyle}>Rezervuar: {formatNum(item.qtyReserved)}</span>
                                    <span style={qtyChipStyle}>Ne dispozicion: {formatNum(item.qtyAvailable)}</span>
                                    <span style={infoChipStyle}>Pragu: {formatNum(item.minStockLevel)}</span>
                                    <span style={toneStyle}>Mungon: {formatNum(item.missingToMinStock)}</span>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </SurfaceCard>
        );
    };

    return (
        <div style={{ padding: 18, maxWidth: 1250 }}>
            <PageIntro
                title="Inventari i depove"
                subtitle="Gjendja aktuale e stokut ne depo dhe analiza e levizjeve kryesore."
                actions={
                    <button
                        style={toolbarBtnStyle}
                        onClick={() =>
                            downloadFile(
                                inventoryExcelUrl(query),
                                `Inventari_i_Plote.xlsx`
                            )
                        }
                    >
                        Eksporto inventarin
                    </button>
                }
            />

            {/* Error */}
            {err && (
                <div
                    style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid rgba(255,80,80,0.35)",
                        background: "rgba(255,80,80,0.10)",
                    }}
                >
                    {err}
                </div>
            )}

            {/* Summary cards */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                    { label: "Produkte gjithsej", value: summary ? formatNum(summary.totalProducts) : "—" },
                    { label: "Sasia ne depo", value: summary ? formatNum(summary.totalQtyOnHand) : "—" },
                    { label: "Sasia e rezervuar", value: summary ? formatNum(summary.totalQtyReserved) : "—" },
                    { label: "Sasia ne dispozicion", value: summary ? formatNum(summary.totalQtyAvailable) : "—" },
                ].map((c) => (
                    <SurfaceCard
                        key={c.label}
                        style={{
                            padding: 14,
                            background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, var(--panel)), var(--panel))",
                        }}
                    >
                        <div style={{ opacity: 0.75, fontSize: 13 }}>{c.label}</div>
                        <div style={{ fontSize: 22, marginTop: 6, fontWeight: 700 }}>{c.value}</div>
                    </SurfaceCard>
                ))}
            </div>

            {/* Secondary cards */}
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                    { label: "Produkte me stok", value: summary ? formatNum(summary.productsInStock) : "—" },
                    { label: "Produkte pa stok", value: summary ? formatNum(summary.productsOutOfStock) : "—" },
                    { label: "Nen prag minimal", value: summary ? formatNum(summary.lowStockProducts) : "—" },
                ].map((c) => (
                    <SurfaceCard
                        key={c.label}
                        style={{
                            padding: 14,
                            background: "var(--panel-soft)",
                        }}
                    >
                        <div style={{ opacity: 0.75, fontSize: 13 }}>{c.label}</div>
                        <div style={{ fontSize: 20, marginTop: 6, fontWeight: 700 }}>{c.value}</div>
                    </SurfaceCard>
                ))}
            </div>

            <SurfaceCard
                style={{
                    marginTop: 16,
                    padding: 14,
                    background: "linear-gradient(180deg, rgba(217, 119, 6, 0.12), rgba(217, 119, 6, 0.04))",
                    border: "1px solid rgba(217, 119, 6, 0.24)",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                        <div style={{ fontWeight: 800 }}>Sinjalizime per stok kritik</div>
                        <div style={{ marginTop: 4, opacity: 0.78, fontSize: 13 }}>
                            Kjo pamje eshte sipas produktit, prandaj perfshin edhe produktet qe nuk kane fare rresht inventari.
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>
                            {summary ? `${formatNum(summary.productsOutOfStock)} pa stok • ${formatNum(summary.lowStockProducts)} nen prag` : "—"}
                        </div>
                        <button
                            type="button"
                            onClick={() => downloadFile(inventoryReorderExcelUrl(lowStockThreshold), "Lista_per_Porosi_Malli.xlsx")}
                            style={toolbarBtnStyle}
                        >
                            Shkarko listen per porosi
                        </button>
                    </div>
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
                    <StockProductListCard
                        title="Produkte pa stok"
                        subtitle={`Shfaqen ${formatNum(outOfStockPreview.length)} nga ${formatNum(stockAlerts?.productsOutOfStock ?? 0)} produkte.`}
                        items={outOfStockPreview}
                        tone="danger"
                        emptyText="Nuk ka produkte pa stok."
                    />
                    <StockProductListCard
                        title="Produkte nen prag minimal"
                        subtitle={`Shfaqen ${formatNum(lowStockPreview.length)} nga ${formatNum(stockAlerts?.lowStockProducts ?? 0)} produkte.`}
                        items={lowStockPreview}
                        tone="warn"
                        emptyText="Nuk ka produkte nen prag minimal."
                    />
                </div>
            </SurfaceCard>

            {/* Charts */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                <SurfaceCard
                    style={{
                        padding: 14,
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div style={{ fontWeight: 700 }}>Stoku sipas depos</div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>Ne dispozicion</div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                        <WarehouseBars />
                    </div>
                </SurfaceCard>

                <SurfaceCard
                    style={{
                        padding: 14,
                    }}
                >
                    <div style={{ fontWeight: 700 }}>Levizjet me te medha (30 dite)</div>
                    <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>Sasia e levizur ne depo</div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {(charts?.topMovers30d ?? []).slice(0, 8).map((p: any) => (
                            <div key={p.productId} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    <span style={{ opacity: 0.8 }}>{p.sku}</span> — {p.name}
                                </div>
                                <div style={{ fontWeight: 700 }}>{formatNum(p.value)}</div>
                            </div>
                        ))}
                        {!((charts?.topMovers30d ?? []).length > 0) && <div style={{ opacity: 0.7 }}>S’ka të dhëna.</div>}
                    </div>
                </SurfaceCard>
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                <SurfaceCard
                    style={{
                        padding: 14,
                        background: "linear-gradient(180deg, color-mix(in srgb, var(--accent-warm) 10%, var(--panel)), var(--panel))",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                        <div>
                            <div style={{ fontWeight: 800 }}>Raporti i skadences</div>
                            <div style={{ opacity: 0.76, fontSize: 13, marginTop: 4 }}>
                                Pamje e shpejte per artikujt e skaduar dhe ata qe skadojne se shpejti.
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 12 }}>
                        {[
                            { label: "I skaduar", value: expiryReport?.expiredCount ?? 0, tone: "danger" },
                            { label: "Skadon ne 7 dite", value: expiryReport?.expiringIn7DaysCount ?? 0, tone: "warn" },
                            { label: "Skadon ne 30 dite", value: expiryReport?.expiringIn30DaysCount ?? 0, tone: "info" },
                        ].map((card) => (
                            <div
                                key={card.label}
                                style={{
                                    padding: 14,
                                    borderRadius: 14,
                                    border: "1px solid var(--border)",
                                    background:
                                        card.tone === "danger"
                                            ? "rgba(239, 68, 68, 0.08)"
                                            : card.tone === "warn"
                                                ? "rgba(251, 191, 36, 0.08)"
                                                : "rgba(96, 165, 250, 0.08)",
                                }}
                            >
                                <div style={{ fontSize: 12, opacity: 0.76 }}>{card.label}</div>
                                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{formatNum(card.value)}</div>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
                    <ExpiryListCard
                        title="Artikuj te skaduar"
                        subtitle="Prioritet per izolim ose kthim."
                        items={expiryReport?.expiredItems ?? []}
                        tone="danger"
                    />
                    <ExpiryListCard
                        title="Skadon ne 7 dite"
                        subtitle="Kerkon veprim te shpejte nga depoja ose shitja."
                        items={expiryReport?.expiringIn7DaysItems ?? []}
                        tone="warn"
                    />
                    <ExpiryListCard
                        title="Skadon ne 30 dite"
                        subtitle="Per planifikim, oferta ose FEFO me prioritet."
                        items={expiryReport?.expiringIn30DaysItems ?? []}
                        tone="info"
                    />
                </div>
            </div>

            <SurfaceCard
                style={{
                    marginTop: 16,
                    padding: 14,
                    background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--panel)), var(--panel))",
                    border: "1px solid color-mix(in srgb, var(--accent) 26%, var(--border))",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start", flexWrap: "wrap" }}>
                    <div style={{ maxWidth: 720 }}>
                        <div style={{ fontWeight: 800 }}>Scanner lookup per Honeywell</div>
                        <div style={{ marginTop: 4, opacity: 0.8, fontSize: 13 }}>
                            Skano barkodin ose SKU-ne dhe SMD do ta filtroje inventarin menjehere. Kjo eshte praktike per gjetje te shpejte te produktit, depo-se dhe shportes.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            scannerInputRef.current?.focus();
                            scannerInputRef.current?.select();
                        }}
                        style={toolbarBtnStyle}
                    >
                        Fokuso scanner-in
                    </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(280px, 420px) 1fr", gap: 12, alignItems: "start" }}>
                    <div>
                        <div
                            style={{
                                height: 42,
                                borderRadius: 12,
                                border: scannerFeedback?.tone === "success"
                                    ? "1px solid color-mix(in srgb, var(--success) 48%, var(--border))"
                                    : scannerFeedback?.tone === "error"
                                        ? "1px solid color-mix(in srgb, var(--danger) 48%, var(--border))"
                                        : "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 12px",
                                gap: 8,
                                boxShadow: scannerFeedback?.tone === "success"
                                    ? "0 0 0 3px color-mix(in srgb, var(--success) 14%, transparent)"
                                    : scannerFeedback?.tone === "error"
                                        ? "0 0 0 3px color-mix(in srgb, var(--danger) 12%, transparent)"
                                        : undefined,
                            }}
                        >
                            <span style={{ opacity: 0.78 }}>⌁</span>
                            <input
                                ref={scannerInputRef}
                                value={scannerValue}
                                onChange={(e) => setScannerValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        submitScannerSearch(scannerValue);
                                    }
                                }}
                                placeholder="Skano barkodin ose shkruaj SKU..."
                                style={{
                                    flex: 1,
                                    height: "100%",
                                    border: "none",
                                    background: "transparent",
                                    color: "var(--text)",
                                    outline: "none",
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => submitScannerSearch(scannerValue)}
                                style={{
                                    height: 30,
                                    padding: "0 10px",
                                    borderRadius: 8,
                                    border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))",
                                    background: "color-mix(in srgb, var(--accent) 14%, var(--panel-soft))",
                                    color: "var(--accent-strong)",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                }}
                            >
                                Kerko
                            </button>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.76 }}>
                            Honeywell Xenon 1900 zakonisht dergon kodin si tastiere dhe perfundon me `Enter`, prandaj kjo fushe eshte gati per skanim te perseritur.
                        </div>
                    </div>

                    <div
                        style={{
                            minHeight: 42,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: scannerFeedback?.tone === "success"
                                ? "1px solid color-mix(in srgb, var(--success) 32%, var(--border))"
                                : scannerFeedback?.tone === "error"
                                    ? "1px solid color-mix(in srgb, var(--danger) 28%, var(--border))"
                                    : "1px solid var(--border)",
                            background: scannerFeedback?.tone === "success"
                                ? "color-mix(in srgb, var(--success) 12%, var(--panel-soft))"
                                : scannerFeedback?.tone === "error"
                                    ? "color-mix(in srgb, var(--danger) 10%, var(--panel-soft))"
                                    : "var(--panel-soft)",
                        }}
                    >
                        {scannedInventoryRow ? (
                            <div style={{ display: "grid", gap: 4 }}>
                                <div style={{ fontWeight: 800 }}>{scannedInventoryRow.productSku} — {scannedInventoryRow.productName}</div>
                                <div style={{ fontSize: 13, opacity: 0.82 }}>
                                    Depo: {warehouseLabel(scannedInventoryRow)} | Zona: {scannedInventoryRow.zoneCode} | Rafti: {scannedInventoryRow.rackCode} | Shporta: {scannedInventoryRow.binCode}
                                </div>
                                <div style={{ fontSize: 13, opacity: 0.82 }}>
                                    Ne dispozicion: {formatNum(scannedInventoryRow.qtyAvailable)} | Ne depo: {formatNum(scannedInventoryRow.qtyOnHand)}
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, opacity: 0.78 }}>
                                {scannerFeedback?.message ?? "Pasi te skanosh, ketu do shfaqet vendndodhja dhe gjendja e produktit."}
                            </div>
                        )}
                    </div>
                </div>
            </SurfaceCard>

            {/* Filters */}
            <SurfaceCard
                style={{
                    marginTop: 16,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    overflow: "hidden",
                }}
            >
                {/* Row 1: search + toggles + lowstock + sort + reset */}
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        alignItems: "center",
                        minWidth: 0,
                    }}
                >
                    <div
                        style={{
                            flex: "1 1 320px",
                            minWidth: 240,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 12px",
                            gap: 8,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                    >
                        <span style={{ opacity: 0.7 }}>🔎</span>
                        <input
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Kerko sipas SKU-se, produktit, barkodit, depos, zones, raftit ose shportes..."
                            style={{
                                flex: 1,
                                height: "100%",
                                border: "none",
                                background: "transparent",
                                color: "var(--text)",
                                outline: "none",
                            }}
                        />
                        {/*NEWWW Clear button */} 
                        {!!search.trim() && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch("");
                                    setPage(1);
                                }}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "var(--muted)",
                                    cursor: "pointer",
                                    fontSize: 16,
                                }}
                                title="Pastro kërkimin"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    
                    <button
                        onClick={onToggleInStock}
                        style={{
                            flex: "0 0 auto",
                            height: 38,
                            padding: "0 12px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: onlyInStock ? "rgba(5, 150, 105, 0.18)" : "var(--panel-soft)",
                            color: "var(--text)",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        🟢 Ne depo
                    </button>

                    <button
                        onClick={onToggleOutOfStock}
                        style={{
                            flex: "0 0 auto",
                            height: 38,
                            padding: "0 12px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: onlyOutOfStock ? "rgba(220, 38, 38, 0.18)" : "var(--panel-soft)",
                            color: "var(--text)",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        🔴 Jashta depos
                    </button>

                    <button
                        onClick={onToggleBelowMinStock}
                        style={{
                            flex: "0 0 auto",
                            height: 38,
                            padding: "0 12px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: onlyBelowMinStock ? "rgba(217, 119, 6, 0.20)" : "var(--panel-soft)",
                            color: "var(--text)",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        🟠 Nen prag minimal
                    </button>

                    <div style={{ flex: "0 1 190px", display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--muted)", fontSize: 13 }}>Stok me pak se:</span>
                        <input
                            type="number"
                            min={1}
                            value={lowStockThreshold}
                            onChange={(e) => {
                                setLowStockThreshold(Math.max(1, Number(e.target.value || 1)));
                                setPage(1);
                            }}
                            style={{
                                width: 86,
                                height: 38,
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                padding: "0 10px",
                                outline: "none",
                            }}
                        />
                    </div>

                    <select
                        value={expiryFilter}
                        onChange={(e) => {
                            setExpiryFilter(e.target.value as InventoryExpiryFilter);
                            setPage(1);
                        }}
                        style={{
                            flex: "1 1 190px",
                            minWidth: 180,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            color: "var(--text)",
                            padding: "0 10px",
                            outline: "none",
                        }}
                        title="Filtro sipas skadences"
                    >
                        <option value="">Skadenca: Te gjitha</option>
                        <option value="expired">Skadenca: I skaduar</option>
                        <option value="nearExpiry">Skadenca: Skadon shpejt</option>
                        <option value="noExpiry">Skadenca: Pa skadence</option>
                    </select>

                    <div style={{ flex: "1 1 250px", display: "flex", gap: 8, justifyContent: "flex-end", minWidth: 220 }}>
                        <select
                            value={sortBy}
                            onChange={(e) => {
                                setSortBy(e.target.value as InventorySortBy);
                                setPage(1);
                            }}
                            style={{
                                flex: "1 1 170px",
                                minWidth: 150,
                                height: 38,
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                padding: "0 10px",
                                outline: "none",
                            }}
                        >
                            <option value="sku">Rendit: SKU</option>
                            <option value="name">Rendit: Emrit</option>
                            <option value="qty">Rendit: Sasise</option>
                            <option value="available">Rendit: Ne dispozicion</option>
                        </select>

                        <button
                            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                            style={{
                                height: 38,
                                padding: "0 12px",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                cursor: "pointer",
                            }}
                            title="Nderro drejtimin e renditjes"
                        >
                            {sortDir === "asc" ? "⬆️" : "⬇️"}
                        </button>
                    </div>

                    <button
                        onClick={resetFilters}
                        style={{
                            flex: "0 0 auto",
                            height: 38,
                            padding: "0 12px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            color: "var(--text)",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                        title="Pastro filtrat"
                    >
                        ♻️ Fshi filtrat
                    </button>
                </div>

                {/* Row 2: cascading dropdowns */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 10,
                        alignItems: "center",
                        minWidth: 0,
                    }}
                >
                    <select
                        value={warehouseId}
                        onChange={(e) => {
                            setWarehouseId(e.target.value);
                            setPage(1);
                        }}
                        style={{
                            width: "100%",
                            minWidth: 0,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            color: "var(--text)",
                            padding: "0 10px",
                            outline: "none",
                        }}
                    >
                        <option value="">Te gjitha depot</option>
                        {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                                {w.code} — {w.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={zoneId}
                        disabled={!warehouseId}
                        onChange={(e) => {
                            setZoneId(e.target.value);
                            setPage(1);
                        }}
                        style={{
                            width: "100%",
                            minWidth: 0,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            color: "var(--text)",
                            padding: "0 10px",
                            outline: "none",
                            opacity: warehouseId ? 1 : 0.6,
                            cursor: warehouseId ? "pointer" : "not-allowed",
                        }}
                    >
                        <option value="">Te gjitha zonat</option>
                        {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                                {z.code} — {z.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={rackId}
                        disabled={!zoneId}
                        onChange={(e) => {
                            setRackId(e.target.value);
                            setPage(1);
                        }}
                        style={{
                            width: "100%",
                            minWidth: 0,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            color: "var(--text)",
                            padding: "0 10px",
                            outline: "none",
                            opacity: zoneId ? 1 : 0.6,
                            cursor: zoneId ? "pointer" : "not-allowed",
                        }}
                    >
                        <option value="">Te gjithe raftet</option>
                        {racks.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.code} — {r.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={binId}
                        disabled={!rackId}
                        onChange={(e) => {
                            setBinId(e.target.value);
                            setPage(1);
                        }}
                        style={{
                            width: "100%",
                            minWidth: 0,
                            height: 38,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel-soft)",
                            color: "var(--text)",
                            padding: "0 10px",
                            outline: "none",
                            opacity: rackId ? 1 : 0.6,
                            cursor: rackId ? "pointer" : "not-allowed",
                        }}
                    >
                        <option value="">Te gjitha shportat</option>
                        {bins.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.code} — {b.name}
                            </option>
                        ))}
                    </select>
                </div>
            </SurfaceCard>
            {/* Table */}
            <SurfaceCard padded={false} style={{ marginTop: 16, overflow: "hidden" }}>
                <div style={{ padding: 12, background: "var(--panel-soft)", display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700 }}>Inventari ne depo</div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>
                        {loading ? "Duke u ngarkuar..." : `${formatNum(total)} rreshta • ${formatNum(criticalRows.length)} kritik ne kete faqe`}
                    </div>
                </div>

                <div className="standard-scrollbar" style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ textAlign: "left", background: "color-mix(in srgb, var(--panel-strong) 92%, transparent)" }}>
                                <th style={{ ...stickyThStyle, cursor: "pointer" }} onClick={() => onSort("sku")}>SKU</th>
                                <th style={{ ...stickyThStyle, cursor: "pointer" }} onClick={() => onSort("name")}>Produkti</th>
                                <th style={{ ...stickyThStyle, cursor: "pointer" }} onClick={() => onSort("warehouse")}>Depoja</th>
                                <th style={stickyThStyle}>Zona</th>
                                <th style={stickyThStyle}>Rafti</th>
                                <th style={{ ...stickyThStyle, cursor: "pointer" }} onClick={() => onSort("bin")}>Shporta</th>
                                <th style={stickyThStyle}>Grumbulli / Seria / Skadenca</th>
                                <th style={{ ...stickyThStyle, textAlign: "right" }}>Pragu min.</th>
                                <th style={{ ...stickyThStyle, cursor: "pointer", textAlign: "right" }} onClick={() => onSort("qty")}>Ne depo</th>
                                <th style={{ ...stickyThStyle, textAlign: "right" }}>E rezervuar</th>
                                <th style={{ ...stickyThStyle, cursor: "pointer", textAlign: "right" }} onClick={() => onSort("available")}>Ne dispozicion</th>

                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const isOut = r.qtyAvailable <= 0;
                                const effectiveThreshold = r.productMinStockLevel > 0 ? r.productMinStockLevel : lowStockThreshold;
                                const isLow = !isOut && r.qtyAvailable <= effectiveThreshold;
                                const isCritical = r.isBelowMinStock || isLow;
                                const status = isOut ? "Pa stok" : isCritical ? "Nen prag minimal" : "Ne stok";
                                const statusBg = isOut
                                    ? "rgba(231, 76, 60, 0.18)"
                                    : isCritical
                                        ? "rgba(243, 156, 18, 0.18)"
                                        : "rgba(46, 204, 113, 0.16)";
                                const statusBorder = isOut
                                    ? "rgba(231, 76, 60, 0.35)"
                                    : isCritical
                                        ? "rgba(243, 156, 18, 0.35)"
                                        : "rgba(46, 204, 113, 0.30)";
                                const statusColor = isOut
                                    ? "#fca5a5"
                                    : isCritical
                                        ? "#fcd34d"
                                        : "#86efac";

                                return (
                                    <tr
                                        key={r.inventoryId}
                                        onMouseEnter={() => setHoveredRow(r.inventoryId)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                        style={{
                                            borderTop: "1px solid rgba(255,255,255,0.06)",
                                            background:
                                                hoveredRow === r.inventoryId
                                                    ? "rgba(255,255,255,0.05)"
                                                    : isOut
                                                        ? "rgba(231, 76, 60, 0.08)"
                                                        : isCritical
                                                            ? "rgba(243, 156, 18, 0.08)"
                                                            : "transparent",
                                            transition: "background 0.15s ease",
                                            transform: hoveredRow === r.inventoryId ? "scale(1.01)" : "scale(1)",
                                            //cursor: "default",
                                        }}
                                    >
                                        <td style={{ padding: 10, opacity: 0.95, fontWeight: 600 }}>
                                            {r.productSku}
                                        </td>

                                        <td style={{ padding: 10, minWidth: 260 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                <div style={{ fontWeight: 600 }}>
                                                    {r.productName}
                                                </div>

                                                <span
                                                    style={{
                                                        height: 22,
                                                        padding: "0 8px",
                                                        borderRadius: 999,
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        background: statusBg,
                                                        border: `1px solid ${statusBorder}`,
                                                        color: statusColor,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {status}
                                                </span>
                                            </div>

                                            {(r.productBarcode || r.productDescription) && (
                                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                                                    {r.productBarcode ? `Barkodi: ${r.productBarcode}` : r.productDescription}
                                                </div>
                                            )}

                                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                                                Prag minimal: {formatNum(r.productMinStockLevel || 0)}
                                            </div>
                                        </td>

                                        <td style={{ padding: 10, minWidth: 190 }}>
                                            <div style={{ fontWeight: 500 }}>
                                                {warehouseLabel(r)}
                                            </div>

                                            {r.warehouseAddress && (
                                                <div style={{ marginTop: 3, fontSize: 12, opacity: 0.68 }}>
                                                    {r.warehouseAddress}
                                                </div>
                                            )}
                                        </td>

                                        <td style={{ padding: 10, minWidth: 100 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {r.zoneCode}
                                            </div>

                                            {(r.zoneName) && (
                                                <div style={{ marginTop: 3, fontSize: 12, opacity: 0.72 }}>
                                                    {r.zoneName}
                                                </div>
                                            )}
                                        </td>

                                        <td style={{ padding: 10, minWidth: 150 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {r.rackCode}
                                            </div>

                                            {(r.rackName) && (
                                                <div style={{ marginTop: 3, fontSize: 12, opacity: 0.72 }}>
                                                    {r.rackName}
                                                </div>
                                            )}
                                        </td>

                                        <td style={{ padding: 10, minWidth: 150 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {r.binCode}
                                            </div>

                                            {(r.binName) && (
                                                <div style={{ marginTop: 3, fontSize: 12, opacity: 0.72 }}>
                                                    {r.binName}
                                                </div>
                                            )}
                                        </td>

                                        <td style={{ padding: 10, minWidth: 220 }}>
                                            <div style={{ display: "grid", gap: 6 }}>
                                                <div style={{ fontSize: 12, opacity: 0.84 }}>
                                                    Grumbulli: <b style={{ color: "var(--text)" }}>{r.lotNumber || "—"}</b>
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.84 }}>
                                                    Seria: <b style={{ color: "var(--text)" }}>{r.batchNumber || "—"}</b>
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.84 }}>
                                                    Skadenca: <b style={{ color: "var(--text)" }}>{formatDateOnly(r.expiryDate)}</b>
                                                </div>
                                                {r.isExpired ? (
                                                    <span style={expiredChipStyle}>I skaduar</span>
                                                ) : r.isNearExpiry ? (
                                                    <span style={nearExpiryChipStyle}>Skadon shpejt</span>
                                                ) : null}
                                            </div>
                                        </td>

                                        <td style={{ padding: 10, textAlign: "right", fontWeight: 700 }}>
                                            {formatNum(r.productMinStockLevel || 0)}
                                        </td>

                                        <td style={{ padding: 10, fontWeight: 700 }}>
                                            {formatNum(r.qtyOnHand)}
                                        </td>

                                        <td style={{ padding: 10 }}>
                                            {formatNum(r.qtyReserved)}
                                        </td>

                                        <td style={{ padding: 10, fontWeight: 700 }}>
                                            {formatNum(r.qtyAvailable)}
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={11} style={{ padding: 14, opacity: 0.7 }}>
                                        S’ka rezultate për këto filtra.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paging */}
                <div
                    style={{
                        padding: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "var(--panel-soft)",
                    }}
                >
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                        Faqja {page} / {totalPages}
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            style={{
                                height: 36,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                cursor: page === 1 ? "not-allowed" : "pointer",
                                opacity: page === 1 ? 0.5 : 1,
                            }}
                        >
                            ⏮
                        </button>

                        <button
                            onClick={() => setPage((p) => clamp(p - 1, 1, totalPages))}
                            disabled={page === 1}
                            style={{
                                height: 36,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                cursor: page === 1 ? "not-allowed" : "pointer",
                                opacity: page === 1 ? 0.5 : 1,
                            }}
                        >
                            ◀
                        </button>

                        <button
                            onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))}
                            disabled={page === totalPages}
                            style={{
                                height: 36,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                cursor: page === totalPages ? "not-allowed" : "pointer",
                                opacity: page === totalPages ? 0.5 : 1,
                            }}
                        >
                            ▶
                        </button>

                        <button
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            style={{
                                height: 36,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--panel-soft)",
                                color: "var(--text)",
                                cursor: page === totalPages ? "not-allowed" : "pointer",
                                opacity: page === totalPages ? 0.5 : 1,
                            }}
                        >
                            ⏭
                        </button>
                    </div>
                </div>
            </SurfaceCard>
        </div>
    );
}

const toolbarBtnStyle: React.CSSProperties = {
    height: 40,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--text)",
    cursor: "pointer",
    display: "flex",
    gap: 8,
    alignItems: "center",
};

const nearExpiryChipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(251, 191, 36, 0.12)",
    border: "1px solid rgba(251, 191, 36, 0.22)",
    color: "#fde68a",
};

const expiredChipStyle: React.CSSProperties = {
    ...nearExpiryChipStyle,
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.22)",
    color: "#fca5a5",
};

const infoChipStyle: React.CSSProperties = {
    ...nearExpiryChipStyle,
    background: "rgba(96, 165, 250, 0.12)",
    border: "1px solid rgba(96, 165, 250, 0.22)",
    color: "#bfdbfe",
};

const qtyChipStyle: React.CSSProperties = {
    ...nearExpiryChipStyle,
    background: "rgba(148, 163, 184, 0.12)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    color: "var(--text)",
};
