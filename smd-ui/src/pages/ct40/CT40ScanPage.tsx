import { useEffect, useMemo, useRef, useState } from "react";
import { searchBins, type BinHitDto } from "../../services/bins";
import { searchProducts, type ProductHitDto } from "../../services/products";
import { stockAdjust, stockIn, stockOut, stockTransfer } from "../../services/stockMovements";
import type { StockMovementType } from "../../types/stockMovements";
import { errorMessage } from "../../shared/errors";
import { getPreferredScanLookupTerm, getScanFieldValue, isExactScanMatch, normalizeScannerValue, parseScanPayload } from "../../shared/scanner";
import { useScannerCapture } from "../../shared/useScannerCapture";
import { canMoveStockDirectly } from "../../shared/permissions";
import { getSessionUser } from "../../shared/session";

type ScanMode = StockMovementType;

function wholeNumberInput(value: string, allowNegative = false) {
    let next = value.replace(/[^\d-]/g, "");
    if (!allowNegative) return next.replace(/-/g, "");

    const negative = next.startsWith("-");
    next = next.replace(/-/g, "");
    return negative ? `-${next}` : next;
}

function parseWholeNumber(value: string) {
    if (!/^-?\d+$/.test(value.trim())) return NaN;
    return Number(value);
}

function modeLabel(mode: ScanMode) {
    if (mode === "IN") return "Hyrje";
    if (mode === "OUT") return "Dalje";
    if (mode === "TRANSFER") return "Transfer";
    return "Korrigjim";
}

function binLocation(bin: BinHitDto | null) {
    if (!bin) return "";
    return [bin.warehouseCode, bin.zoneCode, bin.rackCode].filter(Boolean).join(" / ");
}

export default function CT40ScanPage() {
    const me = getSessionUser();
    const canMove = canMoveStockDirectly(me?.role);

    const [mode, setMode] = useState<ScanMode>("IN");
    const [product, setProduct] = useState<ProductHitDto | null>(null);
    const [fromBin, setFromBin] = useState<BinHitDto | null>(null);
    const [toBin, setToBin] = useState<BinHitDto | null>(null);
    const [adjustBin, setAdjustBin] = useState<BinHitDto | null>(null);
    const [quantity, setQuantity] = useState("1");
    const [reason, setReason] = useState("Korrigjim nga CT40");
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [manualScan, setManualScan] = useState("");
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
    const quantityInputRef = useRef<HTMLInputElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const activeBin = mode === "OUT" ? fromBin : mode === "ADJUST" ? adjustBin : toBin;
    const quantityValue = parseWholeNumber(quantity);

    const canSubmit = useMemo(() => {
        if (!canMove || busy || !product) return false;
        if (mode === "IN") return !!toBin && Number.isInteger(quantityValue) && quantityValue > 0;
        if (mode === "OUT") return !!fromBin && Number.isInteger(quantityValue) && quantityValue > 0;
        if (mode === "TRANSFER") return !!fromBin && !!toBin && fromBin.id !== toBin.id && Number.isInteger(quantityValue) && quantityValue > 0;
        return !!adjustBin && Number.isInteger(quantityValue) && quantityValue !== 0 && reason.trim().length > 0;
    }, [adjustBin, busy, canMove, fromBin, mode, product, quantityValue, reason, toBin]);

    useEffect(() => {
        if (!feedback) return;
        const timer = window.setTimeout(() => setFeedback(null), 2600);
        return () => window.clearTimeout(timer);
    }, [feedback]);

    useEffect(() => {
        if (!canSubmit) return;
        const timer = window.setTimeout(() => {
            quantityInputRef.current?.focus();
            quantityInputRef.current?.select();
        }, 80);
        return () => window.clearTimeout(timer);
    }, [canSubmit]);

    function pulse(tone: "success" | "error" | "info") {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            const pattern = tone === "success" ? [45] : tone === "error" ? [80, 45, 80] : [35];
            navigator.vibrate(pattern);
        }

        try {
            const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextCtor) return;

            const ctx = audioContextRef.current ?? new AudioContextCtor();
            audioContextRef.current = ctx;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.frequency.value = tone === "success" ? 880 : tone === "error" ? 220 : 520;
            oscillator.type = "sine";
            gain.gain.value = 0.045;
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + (tone === "error" ? 0.18 : 0.09));
        } catch {
            // Audio feedback is best-effort on mobile browsers.
        }
    }

    function showFeedback(tone: "success" | "error" | "info", message: string) {
        setFeedback({ tone, message });
        pulse(tone);
    }

    function resetTargetsForMode(nextMode: ScanMode) {
        setMode(nextMode);
        showFeedback("info", `Modaliteti: ${modeLabel(nextMode)}.`);
    }

    function clearAll() {
        setProduct(null);
        setFromBin(null);
        setToBin(null);
        setAdjustBin(null);
        setQuantity("1");
        setReference("");
        setNote("");
        setManualScan("");
        setFeedback(null);
    }

    async function findProduct(rawValue: string) {
        const normalized = normalizeScannerValue(rawValue);
        const lookup = getScanFieldValue(normalized, "barcode", "barkod", "sku") || getPreferredScanLookupTerm(normalized) || normalized;
        if (!lookup) return null;

        const hits = await searchProducts(lookup);
        return hits.find((item) => isExactScanMatch(normalized, item.sku, item.barcode))
            ?? hits.find((item) => item.sku.toLowerCase() === lookup.toLowerCase() || item.barcode?.toLowerCase() === lookup.toLowerCase())
            ?? hits[0]
            ?? null;
    }

    async function findBin(rawValue: string) {
        const normalized = normalizeScannerValue(rawValue);
        const lookup = getScanFieldValue(normalized, "bin", "code") || getPreferredScanLookupTerm(normalized) || normalized;
        if (!lookup) return null;

        const hits = await searchBins(lookup);
        return hits.find((item) => isExactScanMatch(normalized, item.code, item.name))
            ?? hits.find((item) => item.code.toLowerCase() === lookup.toLowerCase())
            ?? hits[0]
            ?? null;
    }

    function applyBin(bin: BinHitDto) {
        if (mode === "IN") {
            setToBin(bin);
            showFeedback("success", `Ne shporte: ${bin.code}`);
            return;
        }

        if (mode === "OUT") {
            setFromBin(bin);
            showFeedback("success", `Nga shporta: ${bin.code}`);
            return;
        }

        if (mode === "ADJUST") {
            setAdjustBin(bin);
            showFeedback("success", `Shporta: ${bin.code}`);
            return;
        }

        if (!fromBin) {
            setFromBin(bin);
            showFeedback("success", `Nga shporta: ${bin.code}`);
            return;
        }

        setToBin(bin);
        showFeedback("success", `Ne shporte: ${bin.code}`);
    }

    async function applyScan(rawValue: string) {
        const normalized = normalizeScannerValue(rawValue);
        if (!normalized || busy) return;

        try {
            const parsed = parseScanPayload(rawValue);
            const isBinScan = parsed.type === "bin" || parsed.type === "location" || !!parsed.fields.bin;

            if (!isBinScan) {
                const foundProduct = await findProduct(rawValue);
                if (foundProduct) {
                    setProduct(foundProduct);
                    showFeedback("success", `Produkti: ${foundProduct.sku}`);
                    return;
                }
            }

            const foundBin = await findBin(rawValue);
            if (foundBin) {
                applyBin(foundBin);
                return;
            }

            showFeedback("error", `Kodi nuk u gjet: ${normalized}`);
        } catch (e) {
            showFeedback("error", errorMessage(e));
        }
    }

    async function submitMovement() {
        if (!canSubmit || !product) return;

        setBusy(true);
        try {
            if (mode === "IN" && toBin) {
                await stockIn({ productId: product.id, toBinId: toBin.id, quantity: quantityValue, reference: reference || undefined, note: note || undefined });
            } else if (mode === "OUT" && fromBin) {
                await stockOut({ productId: product.id, fromBinId: fromBin.id, quantity: quantityValue, reference: reference || undefined, note: note || undefined });
            } else if (mode === "TRANSFER" && fromBin && toBin) {
                await stockTransfer({ productId: product.id, fromBinId: fromBin.id, toBinId: toBin.id, quantity: quantityValue, reference: reference || undefined, note: note || undefined });
            } else if (mode === "ADJUST" && adjustBin) {
                await stockAdjust({ productId: product.id, binId: adjustBin.id, quantityChange: quantityValue, reason, reference: reference || undefined });
            }

            showFeedback("success", `${modeLabel(mode)} u ruajt me sukses.`);
            setQuantity("1");
            if (mode === "TRANSFER") {
                setFromBin(toBin);
                setToBin(null);
            } else if (mode === "IN") {
                setProduct(null);
            } else if (mode === "OUT") {
                setProduct(null);
            } else if (mode === "ADJUST") {
                setProduct(null);
            }
        } catch (e) {
            showFeedback("error", errorMessage(e));
        } finally {
            setBusy(false);
        }
    }

    useScannerCapture({
        enabled: canMove,
        onScan: applyScan,
        minLength: 3,
        maxInterKeyDelayMs: 70,
    });

    return (
        <div style={{ display: "grid", gap: 14, maxWidth: 720, margin: "0 auto" }}>
            <section style={panelStyle}>
                <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>CT40 Scan Mode</div>
                <h1 style={{ margin: "4px 0 8px", fontSize: 30 }}>Skanim i shpejte</h1>
                <div style={{ color: "var(--muted-strong)", lineHeight: 1.4 }}>
                    Skano produktin, skano shporten, vendos sasine dhe ruaj veprimin.
                </div>
            </section>

            {!canMove ? (
                <section style={{ ...panelStyle, borderColor: "rgba(239,68,68,0.34)", color: "#fecaca" }}>
                    Ky rol nuk ka te drejte per levizje direkte te stokut.
                </section>
            ) : null}

            <section style={panelStyle}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                    {(["IN", "OUT", "TRANSFER", "ADJUST"] as ScanMode[]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => resetTargetsForMode(item)}
                            style={{
                                ...modeButtonStyle,
                                ...(mode === item ? activeModeButtonStyle : undefined),
                            }}
                        >
                            {modeLabel(item)}
                        </button>
                    ))}
                </div>
            </section>

            <section style={panelStyle}>
                <div style={{ display: "grid", gap: 10 }}>
                    <ScanCard title="Produkti" primary={product?.sku ?? "Skano produktin"} secondary={product ? product.name : "Barcode ose QR produkti"} active={!product} />

                    {mode === "TRANSFER" ? (
                        <>
                            <ScanCard title="Nga shporta" primary={fromBin?.code ?? "Skano shporten burim"} secondary={binLocation(fromBin)} active={!!product && !fromBin} />
                            <ScanCard title="Ne shporte" primary={toBin?.code ?? "Skano shporten destinacion"} secondary={binLocation(toBin)} active={!!product && !!fromBin && !toBin} />
                        </>
                    ) : (
                        <ScanCard
                            title={mode === "OUT" ? "Nga shporta" : mode === "ADJUST" ? "Shporta" : "Ne shporte"}
                            primary={activeBin?.code ?? "Skano shporten"}
                            secondary={binLocation(activeBin)}
                            active={!!product && !activeBin}
                        />
                    )}
                </div>
            </section>

            <section style={panelStyle}>
                <label style={fieldStyle}>
                    <span style={labelStyle}>{mode === "ADJUST" ? "Ndryshimi i sasise" : "Sasia"}</span>
                    <input
                        ref={quantityInputRef}
                        value={quantity}
                        onChange={(e) => setQuantity(wholeNumberInput(e.target.value, mode === "ADJUST"))}
                        inputMode="numeric"
                        style={largeInputStyle}
                    />
                </label>

                {mode === "ADJUST" ? (
                    <label style={fieldStyle}>
                        <span style={labelStyle}>Arsyeja</span>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                    </label>
                ) : null}

                <label style={fieldStyle}>
                    <span style={labelStyle}>Referenca</span>
                    <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opsionale" style={inputStyle} />
                </label>

                {mode !== "ADJUST" ? (
                    <label style={fieldStyle}>
                        <span style={labelStyle}>Shenim</span>
                        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsionale" style={inputStyle} />
                    </label>
                ) : null}
            </section>

            <section style={panelStyle}>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        value={manualScan}
                        onChange={(e) => setManualScan(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void applyScan(manualScan);
                                setManualScan("");
                            }
                        }}
                        placeholder="Scan manual / test"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            void applyScan(manualScan);
                            setManualScan("");
                        }}
                        style={secondaryButtonStyle}
                    >
                        Apliko
                    </button>
                </div>
            </section>

            {feedback ? (
                <section
                    style={{
                        ...panelStyle,
                        borderColor: feedback.tone === "success" ? "rgba(34,197,94,0.34)" : feedback.tone === "error" ? "rgba(239,68,68,0.34)" : "var(--border)",
                        background: feedback.tone === "success" ? "rgba(34,197,94,0.12)" : feedback.tone === "error" ? "rgba(239,68,68,0.12)" : "var(--panel-soft)",
                        fontWeight: 800,
                    }}
                >
                    {feedback.message}
                </section>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, position: "sticky", bottom: 12 }}>
                <button type="button" disabled={!canSubmit} onClick={() => void submitMovement()} style={{ ...saveButtonStyle, opacity: canSubmit ? 1 : 0.52 }}>
                    {busy ? "Duke ruajtur..." : `Ruaj ${modeLabel(mode)}`}
                </button>
                <button type="button" onClick={clearAll} style={secondaryButtonStyle}>
                    Pastro
                </button>
            </div>
        </div>
    );
}

function ScanCard({ title, primary, secondary, active }: { title: string; primary: string; secondary?: string; active?: boolean }) {
    return (
        <div
            style={{
                padding: 14,
                borderRadius: 14,
                border: active ? "2px solid color-mix(in srgb, var(--accent) 70%, white)" : "1px solid var(--border)",
                background: active ? "color-mix(in srgb, var(--accent) 15%, var(--panel-soft))" : "var(--panel-soft)",
            }}
        >
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>{title}</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, overflowWrap: "anywhere" }}>{primary}</div>
            {secondary ? <div style={{ color: "var(--muted-strong)", marginTop: 4, overflowWrap: "anywhere" }}>{secondary}</div> : null}
        </div>
    );
}

const panelStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 16,
    background: "var(--panel)",
    padding: 14,
    boxShadow: "var(--shadow)",
};

const modeButtonStyle: React.CSSProperties = {
    minHeight: 46,
    padding: "8px 6px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--text)",
    fontWeight: 800,
};

const activeModeButtonStyle: React.CSSProperties = {
    borderColor: "color-mix(in srgb, var(--accent) 65%, white)",
    background: "color-mix(in srgb, var(--accent) 22%, var(--panel-soft))",
};

const fieldStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
    color: "var(--muted)",
    fontSize: 13,
    fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--text)",
    padding: "0 12px",
    boxSizing: "border-box",
};

const largeInputStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 58,
    fontSize: 26,
    fontWeight: 900,
};

const secondaryButtonStyle: React.CSSProperties = {
    minHeight: 50,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--panel-soft)",
    color: "var(--text)",
    fontWeight: 800,
    padding: "0 14px",
};

const saveButtonStyle: React.CSSProperties = {
    minHeight: 58,
    borderRadius: 14,
    border: "1px solid color-mix(in srgb, var(--accent) 55%, white)",
    background: "var(--accent)",
    color: "#f8fbff",
    fontWeight: 900,
    fontSize: 17,
};
