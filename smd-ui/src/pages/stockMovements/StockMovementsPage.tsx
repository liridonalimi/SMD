/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import {
    listStockMovements,
    stockAdjust,
    stockIn,
    stockOut,
    stockTransfer,
} from "../../services/stockMovements";
import type {
    StockAdjustRequest,
    StockInRequest,
    StockMovementListItemDto,
    StockMovementType,
    StockOutRequest,
    StockTransferRequest,
} from "../../types/stockMovements";
import { errorMessage } from "../../shared/errors";
import { env } from "../../config/env";
import { getToken, clearToken } from "../../services/token";
import { searchBins, type BinHitDto } from "../../services/bins";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { FieldLabel } from "../../shared/ui/FieldLabel";
import { getScanFieldValue, isExactScanMatch, normalizeScannerValue, parseScanPayload } from "../../shared/scanner";
import { useScannerCapture } from "../../shared/useScannerCapture";
import { canMoveStockDirectly } from "../../shared/permissions";
import { getSessionUser } from "../../shared/session";

type LookupDto = {
    id: string;
    code: string;
    name: string;
};

type ProductOption = {
    id: string;
    sku: string;
    name: string;
    barcode?: string | null;
};

type ActionMode = "IN" | "OUT" | "TRANSFER" | "ADJUST";
type ScanTarget = "product" | "fromBin" | "toBin" | "bin";

function formatDate(value: string) {
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

function movementBadge(type: StockMovementType) {
    switch (type) {
        case "IN":
            return { bg: "rgba(5, 150, 105, 0.14)", color: "#6ee7b7", label: "Hyrje" };
        case "OUT":
            return { bg: "rgba(220, 38, 38, 0.14)", color: "#fca5a5", label: "Dalje" };
        case "TRANSFER":
            return { bg: "rgba(37, 99, 235, 0.14)", color: "#93c5fd", label: "Transfer" };
        case "ADJUST":
            return { bg: "rgba(217, 119, 6, 0.14)", color: "#fcd34d", label: "Korrigjim" };
        default:
            return { bg: "rgba(100, 116, 139, 0.14)", color: "#cbd5e1", label: type };
    }
}

function wholeNumberInput(value: string, allowNegative = false) {
    let next = value.replace(/[^\d-]/g, "");

    if (!allowNegative) {
        return next.replace(/-/g, "");
    }

    const negative = next.startsWith("-");
    next = next.replace(/-/g, "");
    return negative ? `-${next}` : next;
}

function parseWholeNumber(value: string) {
    if (!/^-?\d+$/.test(value.trim())) return NaN;
    return Number(value);
}

function formatWholeQty(value: number) {
    return Math.trunc(value).toLocaleString();
}

async function readJson<T>(res: Response): Promise<T> {
    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.location.href = "/login";
            throw new Error("Sesioni ka skaduar. Ju lutem kyçuni përsëri.");
        }

        if (res.status === 403) {
            throw new Error("Nuk keni të drejtë për këtë veprim.");
        }

        const text = await res.text().catch(() => "");
        throw new Error(text || "Ndodhi një gabim.");
    }

    return res.json();
}

function authHeaders() {
    const token = getToken();

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function fetchLookups(path: string): Promise<LookupDto[]> {
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
        method: "GET",
        headers: authHeaders(),
    });

    return readJson<LookupDto[]>(res);
}

async function fetchProducts(): Promise<ProductOption[]> {
    const res = await fetch(`${env.apiBaseUrl}/api/products`, {
        method: "GET",
        headers: authHeaders(),
    });
    
    const data = await readJson<any[]>(res);

    return data
        .filter((x) => x.isActive !== false)
        .map((x) => ({
            id: x.id,
            sku: x.sku,
            name: x.name,
            barcode: x.barcode,
        }));
}

export default function StockMovementPage() {
    const me = getSessionUser();
    const allowDirectStockMove = canMoveStockDirectly(me?.role);
    const [rows, setRows] = useState<StockMovementListItemDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState("");

    const [products, setProducts] = useState<ProductOption[]>([]);
    const [warehouses, setWarehouses] = useState<LookupDto[]>([]);
    const [zones, setZones] = useState<LookupDto[]>([]);
    const [racks, setRacks] = useState<LookupDto[]>([]);
    const [bins, setBins] = useState<LookupDto[]>([]);

    const [filterProductId, setFilterProductId] = useState("");
    const [filterBinId, setFilterBinId] = useState("");
    const [filterType, setFilterType] = useState<StockMovementType | "">("");

    const [mode, setMode] = useState<ActionMode>("IN");

    const [productId, setProductId] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [zoneId, setZoneId] = useState("");
    const [rackId, setRackId] = useState("");

    const [fromBinId, setFromBinId] = useState("");
    const [toBinId, setToBinId] = useState("");
    const [binId, setBinId] = useState("");

    const [quantity, setQuantity] = useState("");
    const [quantityChange, setQuantityChange] = useState("");
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [reason, setReason] = useState("");
    const [scanTarget, setScanTarget] = useState<ScanTarget>("product");
    const [scanInput, setScanInput] = useState("");
    const [scanFeedback, setScanFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

    const [filterBins, setFilterBins] = useState<LookupDto[]>([]);


    async function loadRows() {
        try {
            setLoading(true);
            setErr("");

            const data = await listStockMovements({
                productId: filterProductId || undefined,
                binId: filterBinId || undefined,
                type: filterType || "",
            });

            setRows(data);
        } catch (e: any) {
            setErr(errorMessage(e));
        } finally {
            setLoading(false);
        }
    }
    
    function applyFilters() {
        loadRows();
    }
    
    function resetFilters() {
        setFilterProductId("");
        setFilterBinId("");
        setFilterType("");

        setTimeout(() => {
            loadRows();
        }, 0);
    }

   async function loadInitialLookups() {
    try {
        const [warehouseData, productData, binData] = await Promise.all([
            fetchLookups("/api/warehouses/lookup"),
            fetchProducts(),
            fetchLookups("/api/bins/lookup"),
        ]);

        setWarehouses(warehouseData);
        setProducts(productData);
        setFilterBins(binData);
    } catch (e: any) {
        setErr(errorMessage(e));
    }
}

    useEffect(() => {
        loadInitialLookups();
        loadRows();
    }, []);

    useEffect(() => {
        async function loadZones() {
            if (!warehouseId) {
                setZones([]);
                setZoneId("");
                setRacks([]);
                setRackId("");
                setBins([]);
                setFromBinId("");
                setToBinId("");
                setBinId("");
                return;
            }

            try {
                const data = await fetchLookups(`/api/zones/lookup?warehouseId=${warehouseId}`);
                setZones(data);
            } catch (e: any) {
                setErr(errorMessage(e));
            }
        }

        loadZones();
    }, [warehouseId]);

    useEffect(() => {
        async function loadRacks() {
            if (!zoneId) {
                setRacks([]);
                setRackId("");
                setBins([]);
                setFromBinId("");
                setToBinId("");
                setBinId("");
                return;
            }

            try {
                const data = await fetchLookups(`/api/racks/lookup?zoneId=${zoneId}`);
                setRacks(data);
            } catch (e: any) {
                setErr(errorMessage(e));
            }
        }

        loadRacks();
    }, [zoneId]);

    useEffect(() => {
        async function loadBins() {
            if (!rackId) {
                setBins([]);
                setFromBinId("");
                setToBinId("");
                setBinId("");
                return;
            }

            try {
                const data = await fetchLookups(`/api/bins/lookup?rackId=${rackId}`);
                setBins(data);
            } catch (e: any) {
                setErr(errorMessage(e));
            }
        }

        loadBins();
    }, [rackId]);

    const productOptions = useMemo(
        () =>
            products.map((p) => ({
                value: p.id,
                label: `${p.sku} - ${p.name}`,
            })),
        [products]
    );

    function findProductByScan(value: string) {
        const term = normalizeScannerValue(value);
        return products.find((p) => isExactScanMatch(term, p.sku, p.barcode)) ?? null;
    }

    function findBinByScan(value: string) {
        const term = getScanFieldValue(value, "bin") || normalizeScannerValue(value);
        if (!term) return null;
        return bins.find((b) => isExactScanMatch(term, b.code)) ?? null;
    }

    async function findBinHitByScan(value: string) {
        const term = getScanFieldValue(value, "bin") || normalizeScannerValue(value);
        if (!term) return null;

        const localBin = findBinByScan(value);
        if (localBin && rackId) {
            return {
                ...localBin,
                rackId,
                zoneId,
                warehouseId,
            } as BinHitDto;
        }

        const results = await searchBins(term);
        return results.find((b) => isExactScanMatch(value, b.code, b.name))
            ?? results.find((b) => normalizeScannerValue(b.code).toLowerCase() === term.toLowerCase())
            ?? results[0]
            ?? null;
    }

    function applyBinLocation(bin: BinHitDto) {
        setWarehouseId(bin.warehouseId);
        setZoneId(bin.zoneId);
        setRackId(bin.rackId);

        if (bin.zoneCode || bin.zoneName) {
            setZones((current) => current.some((z) => z.id === bin.zoneId)
                ? current
                : [{ id: bin.zoneId, code: bin.zoneCode ?? "", name: bin.zoneName ?? "" }, ...current]);
        }

        if (bin.rackCode || bin.rackName) {
            setRacks((current) => current.some((r) => r.id === bin.rackId)
                ? current
                : [{ id: bin.rackId, code: bin.rackCode ?? "", name: bin.rackName ?? "" }, ...current]);
        }

        setBins((current) => current.some((b) => b.id === bin.id)
            ? current
            : [{ id: bin.id, code: bin.code, name: bin.name }, ...current]);
    }

    function setBinByScanTarget(bin: LookupDto | BinHitDto) {
        if ("warehouseId" in bin) {
            applyBinLocation(bin);
        }

        if (mode === "IN") {
            setToBinId(bin.id);
            setScanTarget("toBin");
            setScanResultSuccess(`U vendos "Ne shporte": ${bin.code} - ${bin.name}`);
            return;
        }

        if (mode === "OUT") {
            setFromBinId(bin.id);
            setScanTarget("fromBin");
            setScanResultSuccess(`U vendos "Nga shporta": ${bin.code} - ${bin.name}`);
            return;
        }

        if (mode === "ADJUST") {
            setBinId(bin.id);
            setScanTarget("bin");
            setScanResultSuccess(`U vendos "Shporta": ${bin.code} - ${bin.name}`);
            return;
        }

        if (scanTarget === "toBin" || (fromBinId && !toBinId)) {
            setToBinId(bin.id);
            setScanTarget("toBin");
            setScanResultSuccess(`U vendos "Ne shporte": ${bin.code} - ${bin.name}`);
            return;
        }

        setFromBinId(bin.id);
        setScanTarget("fromBin");
        setScanResultSuccess(`U vendos "Nga shporta": ${bin.code} - ${bin.name}`);
    }

    function setScanResultSuccess(message: string) {
        setScanFeedback({ tone: "success", message });
    }

    function setScanResultError(message: string) {
        setScanFeedback({ tone: "error", message });
    }

    async function applyScan(rawValue: string) {
        const value = normalizeScannerValue(rawValue);
        if (!value) return;

        const parsedScan = parseScanPayload(rawValue);
        const explicitProductScan = parsedScan.type === "product";
        const explicitBinScan = parsedScan.type === "bin" || parsedScan.type === "location";

        const product = !explicitBinScan ? findProductByScan(value) : null;
        if (explicitProductScan || product) {
            if (!product) {
                setScanResultError(`Produkti nuk u gjet per kodin "${value}".`);
                return;
            }
            setProductId(product.id);
            setScanTarget("product");
            setScanResultSuccess(`Produkti u vendos: ${product.sku} - ${product.name}`);
            return;
        }

        const bin = await findBinHitByScan(value);
        if (!bin) {
            setScanResultError(`Nuk u gjet produkt ose shporte per kodin "${value}".`);
            return;
        }

        setBinByScanTarget(bin);
    }

    function resetForm() {
        setProductId("");
        setWarehouseId("");
        setZoneId("");
        setRackId("");
        setFromBinId("");
        setToBinId("");
        setBinId("");
        setQuantity("");
        setQuantityChange("");
        setReference("");
        setNote("");
        setReason("");
        setScanInput("");
        setScanFeedback(null);
        setZones([]);
        setRacks([]);
        setBins([]);
    }

    useEffect(() => {
        if (!scanFeedback) return;
        const timer = window.setTimeout(() => setScanFeedback(null), 2200);
        return () => window.clearTimeout(timer);
    }, [scanFeedback]);

    useEffect(() => {
        if (mode === "IN" && (scanTarget === "fromBin" || scanTarget === "bin")) setScanTarget("toBin");
        if (mode === "OUT" && (scanTarget === "toBin" || scanTarget === "bin")) setScanTarget("fromBin");
        if (mode === "TRANSFER" && scanTarget === "bin") setScanTarget("fromBin");
        if (mode === "ADJUST" && (scanTarget === "fromBin" || scanTarget === "toBin")) setScanTarget("bin");
    }, [mode, scanTarget]);

    useScannerCapture({
        enabled: allowDirectStockMove,
        onScan: async (value) => {
            await applyScan(value);
        },
    });

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!allowDirectStockMove) {
            setErr("Vetem Admin mund te kryeje hyrje, dalje, transfer ose korrigjim direkt te stokut.");
            return;
        }

        setSubmitting(true);
        setErr("");

        try {
            const parsedQuantity = parseWholeNumber(quantity);
            const parsedQuantityChange = parseWholeNumber(quantityChange);

            if (mode === "IN") {
                if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
                    throw new Error("Sasia duhet te jete numer i plote me i madh se 0.");
                }

                const req: StockInRequest = {
                    productId,
                    toBinId,
                    quantity: parsedQuantity,
                    reference: reference || undefined,
                    note    : note || undefined,
                };
                await stockIn(req);
            } else if (mode === "OUT") {
                if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
                    throw new Error("Sasia duhet te jete numer i plote me i madh se 0.");
                }

                const req: StockOutRequest = {
                    productId,
                    fromBinId,
                    quantity: parsedQuantity,
                    reference: reference || undefined,
                    note: note || undefined,
                };
                await stockOut(req);
            } else if (mode === "TRANSFER") {
                if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
                    throw new Error("Sasia duhet te jete numer i plote me i madh se 0.");
                }

                const req: StockTransferRequest = {
                    productId,
                    fromBinId,
                    toBinId,
                    quantity: parsedQuantity,
                    reference: reference || undefined,
                    note: note || undefined,
                };
                await stockTransfer(req);
            } else {
                if (!Number.isInteger(parsedQuantityChange) || parsedQuantityChange === 0) {
                    throw new Error("Ndryshimi i sasise duhet te jete numer i plote dhe jo 0.");
                }

                const req: StockAdjustRequest = {
                    productId,
                    binId,
                    quantityChange: parsedQuantityChange,
                    reason,
                    reference: reference || undefined,
                };
                await stockAdjust(req);
            }

            resetForm();
            await loadRows();
            alert("Veprimi u krye me sukses.");
        } catch (e: any) {
            setErr(errorMessage(e));
        } finally {
            setSubmitting(false);
        }
    }

    const quantityNumber = parseWholeNumber(quantity);
    const quantityChangeNumber = parseWholeNumber(quantityChange);

    const canSubmit =
        allowDirectStockMove &&
        !!productId &&
        (
            (mode === "IN" &&
                !!toBinId &&
                Number.isInteger(quantityNumber) &&
                quantityNumber > 0) ||

            (mode === "OUT" &&
                !!fromBinId &&
                Number.isInteger(quantityNumber) &&
                quantityNumber > 0) ||

            (mode === "TRANSFER" &&
                !!fromBinId &&
                !!toBinId &&
                fromBinId !== toBinId &&
                Number.isInteger(quantityNumber) &&
                quantityNumber > 0) ||

            (mode === "ADJUST" &&
                !!binId &&
                Number.isInteger(quantityChangeNumber) &&
                quantityChangeNumber !== 0 &&
                reason.trim().length > 0)
        );

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <PageIntro
                title="Levizjet e stokut"
                subtitle="Menaxho hyrjet, daljet, transferet dhe korrigjimet nga nje panel i vetem i punes."
            />

            {err && (
                <div style={errorBoxStyle}>{err}</div>
            )}

            <SurfaceCard>
                <h3 style={sectionTitleStyle}>Filtrat</h3>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                    }}
                >
                    <div>
                        <FieldLabel>Produkti</FieldLabel>
                        <select
                            value={filterProductId}
                            onChange={(e) => setFilterProductId(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="">Të gjitha</option>
                            {productOptions.map((p) => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <FieldLabel>Shporta</FieldLabel>
                        <select
                            value={filterBinId}
                            onChange={(e) => setFilterBinId(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="">Të gjitha</option>
                            {filterBins.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.code} - {b.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <FieldLabel>Lloji</FieldLabel>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as StockMovementType | "")}
                            style={inputStyle}
                        >
                            <option value="">Të gjitha</option>
                            <option value="IN">Hyrje</option>
                            <option value="OUT">Dalje</option>
                            <option value="TRANSFER">Transfer</option>
                            <option value="ADJUST">Korrigjim</option>
                        </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
                        <button style={primaryBtn} onClick={applyFilters}>
                            Kerko
                        </button>
                        <button
                            type="button"
                            style={btnStyle}
                            onClick={resetFilters}>
                            Pastro
                        </button>
                    </div>
                </div>
            </SurfaceCard>

            {allowDirectStockMove ? (
            <SurfaceCard>
                <h3 style={sectionTitleStyle}>Veprime</h3>

                <div
                    style={{
                        marginBottom: 16,
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: 12,
                        background: "var(--panel-soft)",
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>PDA Scan</div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                        Skanoni produktin ose QR shporte; sistemi e dallon automatikisht tipin e kodit.
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        <span style={{ ...btnStyle, cursor: "default", opacity: 0.78 }}>
                            Auto-detect aktiv
                        </span>
                        <button type="button" style={{ ...btnStyle, ...(scanTarget === "product" ? activeChipStyle : undefined) }} onClick={() => setScanTarget("product")}>
                            Produkt
                        </button>
                        {(mode === "OUT" || mode === "TRANSFER") ? (
                            <button type="button" style={{ ...btnStyle, ...(scanTarget === "fromBin" ? activeChipStyle : undefined) }} onClick={() => setScanTarget("fromBin")}>
                                Nga shporta
                            </button>
                        ) : null}
                        {(mode === "IN" || mode === "TRANSFER") ? (
                            <button type="button" style={{ ...btnStyle, ...(scanTarget === "toBin" ? activeChipStyle : undefined) }} onClick={() => setScanTarget("toBin")}>
                                Ne shporte
                            </button>
                        ) : null}
                        {mode === "ADJUST" ? (
                            <button type="button" style={{ ...btnStyle, ...(scanTarget === "bin" ? activeChipStyle : undefined) }} onClick={() => setScanTarget("bin")}>
                                Shporta
                            </button>
                        ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                            value={scanInput}
                            onChange={(e) => setScanInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void applyScan(scanInput);
                                    setScanInput("");
                                }
                            }}
                            placeholder="Skano kodin dhe shtyp Enter"
                            style={{ ...inputStyle, flex: "1 1 280px", minWidth: 220 }}
                        />
                        <button
                            type="button"
                            style={primaryBtn}
                            onClick={() => {
                                void applyScan(scanInput);
                                setScanInput("");
                            }}
                        >
                            Apliko Scan
                        </button>
                    </div>

                    {scanFeedback ? (
                        <div
                            style={{
                                marginTop: 10,
                                borderRadius: 10,
                                padding: "8px 10px",
                                fontWeight: 700,
                                fontSize: 13,
                                border:
                                    scanFeedback.tone === "success"
                                        ? "1px solid rgba(34, 197, 94, 0.30)"
                                        : "1px solid rgba(239, 68, 68, 0.34)",
                                background:
                                    scanFeedback.tone === "success"
                                        ? "rgba(34, 197, 94, 0.10)"
                                        : "rgba(239, 68, 68, 0.10)",
                                color: "var(--text)",
                            }}
                        >
                            {scanFeedback.message}
                        </div>
                    ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {(["IN", "OUT", "TRANSFER", "ADJUST"] as ActionMode[]).map((x) => {
                        const styleMap: Record<ActionMode, React.CSSProperties> = {
                            IN: btnIn,
                            OUT: btnOut,
                            TRANSFER: btnTransfer,
                            ADJUST: btnAdjust,
                        };

                        const labelMap: Record<ActionMode, string> = {
                            IN: "⬆ Hyrje",
                            OUT: "⬇ Dalje",
                            TRANSFER: "⇄ Transfer",
                            ADJUST: "⚙ Korrigjim",
                        };

                        return (
                            <button
                                key={x}
                                type="button"
                                style={{
                                    ...styleMap[x],
                                    opacity: mode === x ? 1 : 0.6,
                                }}
                                onClick={() => setMode(x)}
                            >
                                {labelMap[x]}
                            </button>
                        );
                    })}
                </div>

                <form onSubmit={onSubmit}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <div style={{ gridColumn: "1 / -1" }}>
                            <FieldLabel>Produkti</FieldLabel>
                            <select
                                value={productId}
                                onChange={(e) => setProductId(e.target.value)}
                                style={inputStyle}
                                required
                            >
                                <option value="">Zgjedh produktin</option>
                                {productOptions.map((p) => (
                                    <option key={p.value} value={p.value}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <FieldLabel>Depoja</FieldLabel>
                            <select
                                value={warehouseId}
                                onChange={(e) => setWarehouseId(e.target.value)}
                                style={inputStyle}
                                required
                            >
                                <option value="">Zgjedh depo</option>
                                {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.code} - {w.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <FieldLabel>Zona</FieldLabel>
                            <select
                                value={zoneId}
                                onChange={(e) => setZoneId(e.target.value)}
                                style={inputStyle}
                                required
                                disabled={!warehouseId}
                            >
                                <option value="">Zgjedh zonë</option>
                                {zones.map((z) => (
                                    <option key={z.id} value={z.id}>
                                        {z.code} - {z.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <FieldLabel>Rafti</FieldLabel>
                            <select
                                value={rackId}
                                onChange={(e) => setRackId(e.target.value)}
                                style={inputStyle}
                                required
                                disabled={!zoneId}
                            >
                                <option value="">Zgjedh raft</option>
                                {racks.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.code} - {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {(mode === "IN" || mode === "TRANSFER") && (
                            <div>
                                <FieldLabel>Ne shporte</FieldLabel>
                                <select
                                    value={toBinId}
                                    onChange={(e) => setToBinId(e.target.value)}
                                    style={inputStyle}
                                    required
                                    disabled={!rackId}
                                >
                                <option value="">Zgjedh shporte</option>
                                    {bins.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.code} - {b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {(mode === "OUT" || mode === "TRANSFER") && (
                            <div>
                                <FieldLabel>Nga shporta</FieldLabel>
                                <select
                                    value={fromBinId}
                                    onChange={(e) => setFromBinId(e.target.value)}
                                    style={inputStyle}
                                    required
                                    disabled={!rackId}
                                >
                                <option value="">Zgjedh shporte</option>
                                    {bins.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.code} - {b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {mode === "ADJUST" && (
                            <div>
                                <FieldLabel>Shporta</FieldLabel>
                                <select
                                    value={binId}
                                    onChange={(e) => setBinId(e.target.value)}
                                    style={inputStyle}
                                    required
                                    disabled={!rackId}
                                >
                                    <option value="">Zgjedh shporten</option>
                                    {bins.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.code} - {b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {(mode === "IN" || mode === "OUT" || mode === "TRANSFER") && (
                            <div>
                                <FieldLabel>Sasia</FieldLabel>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={quantity}
                                    onChange={(e) => setQuantity(wholeNumberInput(e.target.value))}
                                    style={inputStyle}
                                    required
                                    placeholder="p.sh. 12"
                                />
                            </div>
                        )}

                        {mode === "ADJUST" && (
                            <div>
                                <FieldLabel>Ndryshimi i sasise</FieldLabel>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={quantityChange}
                                    onChange={(e) => setQuantityChange(wholeNumberInput(e.target.value, true))}
                                    style={inputStyle}
                                    required
                                    placeholder="p.sh. 5 ose -3"
                                />
                            </div>
                        )}

                        <div>
                            <FieldLabel>Referenca</FieldLabel>
                                <input
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    style={inputStyle}
                                    placeholder="p.sh. Fatur, dokument ose porosi"
                                />
                        </div>

                        {(mode === "IN" || mode === "OUT" || mode === "TRANSFER") && (
                            <div>
                                <FieldLabel>Shenim</FieldLabel>
                                <input
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                        )}

                        {mode === "ADJUST" && (
                            <div style={{ gridColumn: "1 / -1" }}>
                                <FieldLabel>Arsyeja</FieldLabel>
                                <input
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    style={inputStyle}
                                    required
                                />
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                        <button type="submit" 
                            style={{
                                ...primaryBtn,
                                opacity: canSubmit ? 1 : 0.5,
                                cursor: canSubmit ? "pointer" : "not-allowed",
                            }} disabled={submitting || !canSubmit}>
                            {submitting ? "Duke ruajtur..." : "Ruaj veprimin"}
                        </button>
                        <button type="button" style={btnStyle} onClick={resetForm}>
                            Pastro
                        </button>
                    </div>
                </form>
            </SurfaceCard>
            ) : (
            <SurfaceCard>
                <h3 style={sectionTitleStyle}>Veprimet direkte jane te kufizuara</h3>
                <div style={{ color: "var(--muted)", lineHeight: 1.5 }}>
                    Ky rol mund te shohe historikun e levizjeve te stokut. Hyrjet, daljet, transferet dhe korrigjimet direkte mund t'i kryeje vetem Admin.
                </div>
            </SurfaceCard>
            )}

            <SurfaceCard padded={false}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "18px 18px 12px",
                    }}
                >
                    <h3 style={sectionTitleStyle}>Historiku</h3>
                    <div style={{ color: "var(--muted)" }}>{rows.length} rreshta</div>
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "var(--panel-strong)" }}>
                                <th style={th}>Data</th>
                                <th style={th}>Lloji</th>
                                <th style={th}>Produkti</th>
                                <th style={th}>Nga shporta</th>
                                <th style={th}>Ne shporte</th>
                                <th style={th}>Sasia</th>
                                <th style={th}>Referenca</th>
                                <th style={th}>Shenim</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={tdCenter}>
                                        Duke ngarkuar...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={tdCenter}>
                                        Nuk ka të dhëna.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => {
                                    const badge = movementBadge(r.type);

                                    return (
                                        <tr key={r.id}>
                                            <td style={td}>{formatDate(r.createdAt)}</td>
                                            <td style={td}>
                                                <span
                                                    style={{
                                                        display: "inline-block",
                                                        padding: "4px 8px",
                                                        borderRadius: 999,
                                                        background: badge.bg,
                                                        color: badge.color,
                                                        fontWeight: 700,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td style={td}>{r.productSku} {r.productName ? ` - ${r.productName}` : ""}</td>
                                            <td style={td}>{r.fromBinCode ?? "-"}</td>
                                            <td style={td}>{r.toBinCode ?? "-"}</td>
                                            <td style={td}>{formatWholeQty(r.quantity)}</td>
                                            <td style={td}>{r.reference || "-"}</td>
                                            <td style={td}>{r.note || "-"}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </SurfaceCard>
        </div>
    );
}

const sectionTitleStyle: React.CSSProperties = {
    marginTop: 0,
    marginBottom: 14,
    color: "var(--text)",
    fontSize: 16,
    fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--text)",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
};

const btnStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--text)",
    cursor: "pointer",
    fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
    ...btnStyle,
    background: "var(--accent)",
    color: "#f8fbff",
    border: "1px solid color-mix(in srgb, var(--accent-strong) 70%, white)",
};

const activeChipStyle: React.CSSProperties = {
    background: "color-mix(in srgb, var(--accent) 24%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent) 58%, white)",
};
/*
const ghostBtn: React.CSSProperties = {
    ...btnStyle,
    background: "transparent",
    color: "#d4d4d8",
};
*/
const th: React.CSSProperties = {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--muted-strong)",
    fontWeight: 700,
};

const td: React.CSSProperties = {
    padding: 12,
    borderBottom: "1px solid var(--border)",
    verticalAlign: "top",
    fontSize: 14,
    color: "var(--text)",
};

const tdCenter: React.CSSProperties = {
    padding: 20,
    textAlign: "center",
    color: "var(--muted)",
};

const errorBoxStyle: React.CSSProperties = {
    background: "rgba(220, 38, 38, 0.12)",
    color: "#fecaca",
    border: "1px solid rgba(220, 38, 38, 0.28)",
    padding: 12,
    borderRadius: 14,
};
/*
const tableWrapStyle: React.CSSProperties = {
    overflowX: "auto",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.06)",
};
*/
const actionBtnBase: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 600,
    color: "#f8fbff",
    transition: "all 0.15s ease",
};

const btnIn: React.CSSProperties = {
    ...actionBtnBase,
    background: "var(--success)",
    borderColor: "rgba(5,150,105,0.4)",
};

const btnOut: React.CSSProperties = {
    ...actionBtnBase,
    background: "var(--danger)",
    borderColor: "rgba(220,38,38,0.4)",
};

const btnTransfer: React.CSSProperties = {
    ...actionBtnBase,
    background: "var(--accent)",
    borderColor: "rgba(37,99,235,0.4)",
};

const btnAdjust: React.CSSProperties = {
    ...actionBtnBase,
    background: "var(--accent-warm)",
    borderColor: "rgba(217,119,6,0.4)",
};
