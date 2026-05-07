import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { OutboundDetailsDto, OutboundLine, OutboundPriceTier } from "../../types/documents";
import {
  addOutboundLine,
  adjustOutboundLineQuantity,
  cancelOutbound,
  confirmOutbound,
  deleteOutboundLine,
  getOutbound,
  outboundExcelUrl,
  outboundPdfUrl,
  setOutboundLinePriceTier,
} from "../../services/outbound";
import { downloadFile } from "../../services/download";
import { statusLabel } from "../../shared/documentStatus";
import { UI } from "../../shared/uiText";
import { errorMessage } from "../../shared/errors";
import { getSessionUser } from "../../shared/session";
import {
  canCancelDocument,
  canConfirmDocument,
  canEditDocumentLines,
} from "../../shared/documentPermissions";
import { searchProducts, type ProductHitDto } from "../../services/products";
import { getSuggestedBins, type SuggestedBinDto } from "../../services/bins";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { FieldLabel } from "../../shared/ui/FieldLabel";
import { isExactScanMatch } from "../../shared/scanner";
import { useScannerCapture } from "../../shared/useScannerCapture";

const LAST_OUTBOUND_BIN_BY_PRODUCT_KEY = "smd:last-outbound-bin-by-product";
let outboundScanAudioContext: AudioContext | null = null;

function readLastBinByProduct(): Record<string, SuggestedBinDto> {
  try {
    const raw = sessionStorage.getItem(LAST_OUTBOUND_BIN_BY_PRODUCT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SuggestedBinDto>;
  } catch {
    return {};
  }
}

function writeLastBinForProduct(productId: string, bin: SuggestedBinDto) {
  const current = readLastBinByProduct();
  current[productId] = bin;
  sessionStorage.setItem(LAST_OUTBOUND_BIN_BY_PRODUCT_KEY, JSON.stringify(current));
}

function getLastBinForProduct(productId: string) {
  return readLastBinByProduct()[productId] ?? null;
}

function mergeSuggestedBins(remembered: SuggestedBinDto | null, suggestions: SuggestedBinDto[]) {
  if (!remembered) return suggestions;
  const hasExactMatch = suggestions.some(
    (x) =>
      x.id === remembered.id &&
      (x.lotNumber ?? null) === (remembered.lotNumber ?? null) &&
      (x.batchNumber ?? null) === (remembered.batchNumber ?? null) &&
      (x.expiryDate ?? null) === (remembered.expiryDate ?? null)
  );
  return hasExactMatch ? suggestions : suggestions;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlighted(text: string | undefined | null, term: string) {
  const source = text ?? "";
  const query = term.trim();
  if (!source || query.length < 2) return source || "—";
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

function isExactProductMatch(product: ProductHitDto, term: string) {
  return isExactScanMatch(term, product.sku, product.barcode);
}

function formatProductPrices(product: ProductHitDto) {
  const prices = [
    product.purchasePrice && product.purchasePrice > 0 ? `Blerje ${product.purchasePrice.toFixed(2)}` : null,
    product.retailPrice && product.retailPrice > 0 ? `Pakice ${product.retailPrice.toFixed(2)}` : null,
    product.wholesalePrice && product.wholesalePrice > 0 ? `Shumice ${product.wholesalePrice.toFixed(2)}` : null,
    product.vipPrice && product.vipPrice > 0 ? `VIP ${product.vipPrice.toFixed(2)}` : null,
  ].filter(Boolean);

  return prices.length > 0 ? prices.join(" • ") : null;
}

function formatMoney(value: number | undefined | null) {
  const formatted = new Intl.NumberFormat("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
  return `${formatted} €`;
}

function formatQty(value: number | undefined | null) {
  return new Intl.NumberFormat("sq-AL", {
    maximumFractionDigits: 0,
  }).format(Math.trunc(Number(value ?? 0)));
}

function normalizeQtyInput(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

function parseWholeQty(value: string) {
  if (!/^\d+$/.test(value.trim())) return NaN;
  return Number(value);
}

function wholeQtyInputValue(value: number | undefined | null) {
  return String(Math.max(0, Math.trunc(Number(value ?? 0))));
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

function formatStockSelectionLabel(bin: SuggestedBinDto) {
  const details = [
    bin.lotNumber ? `Seria ${bin.lotNumber}` : null,
    bin.batchNumber ? `Grupi ${bin.batchNumber}` : null,
    bin.expiryDate ? `Skadon ${formatDateOnly(bin.expiryDate)}` : null,
  ].filter(Boolean);

  return details.length > 0
    ? `${bin.code} - ${bin.name} • ${details.join(" • ")}`
    : `${bin.code} - ${bin.name}`;
}

function paymentTone(paidTotal: number, balance: number): "danger" | "warn" | "success" {
  if (paidTotal <= 0) return "danger";
  if (balance > 0) return "warn";
  return "success";
}

function paymentSummaryCardStyle(base: React.CSSProperties, tone: "danger" | "warn" | "success"): React.CSSProperties {
  if (tone === "danger") {
    return {
      ...base,
      border: "1px solid rgba(239, 68, 68, 0.28)",
      background: "rgba(239, 68, 68, 0.10)",
    };
  }
  if (tone === "warn") {
    return {
      ...base,
      border: "1px solid rgba(245, 158, 11, 0.28)",
      background: "rgba(245, 158, 11, 0.10)",
    };
  }
  return {
    ...base,
    border: "1px solid rgba(34, 197, 94, 0.28)",
    background: "rgba(34, 197, 94, 0.10)",
  };
}

function paymentStatusChipStyle(tone: "danger" | "warn" | "success"): React.CSSProperties {
  if (tone === "danger") {
    return {
      fontSize: 12,
      fontWeight: 900,
      padding: "5px 10px",
      borderRadius: 999,
      background: "rgba(239, 68, 68, 0.16)",
      border: "1px solid rgba(239, 68, 68, 0.28)",
      color: "#fecaca",
      display: "inline-flex",
      width: "fit-content",
    };
  }
  if (tone === "warn") {
    return {
      fontSize: 12,
      fontWeight: 900,
      padding: "5px 10px",
      borderRadius: 999,
      background: "rgba(245, 158, 11, 0.16)",
      border: "1px solid rgba(245, 158, 11, 0.28)",
      color: "#fde68a",
      display: "inline-flex",
      width: "fit-content",
    };
  }
  return {
    fontSize: 12,
    fontWeight: 900,
    padding: "5px 10px",
    borderRadius: 999,
    background: "rgba(34, 197, 94, 0.16)",
    border: "1px solid rgba(34, 197, 94, 0.28)",
    color: "#bbf7d0",
    display: "inline-flex",
    width: "fit-content",
  };
}

function priceTierLabel(priceTier: OutboundPriceTier) {
  if (priceTier === 1) return "Shumice";
  if (priceTier === 2) return "VIP";
  return "Pakice";
}

function outboundUnitPrice(line: OutboundLine, priceTier: OutboundPriceTier) {
  if (priceTier === 1) return Number(line.wholesalePrice ?? 0);
  if (priceTier === 2) return Number(line.vipPrice ?? 0);
  return Number(line.retailPrice ?? 0);
}

function highlightActivePriceChip(base: React.CSSProperties, active: boolean): React.CSSProperties {
  if (!active) return base;
  return {
    ...base,
    fontWeight: 800,
    transform: "translateY(-1px)",
    border: "1px solid color-mix(in srgb, var(--accent) 52%, white 18%)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 10px 24px color-mix(in srgb, var(--accent) 18%, transparent)",
    color: "#ffffff",
  };
}

function selectablePriceChipStyle(base: React.CSSProperties, active: boolean, disabled: boolean): React.CSSProperties {
  return {
    ...highlightActivePriceChip(base, active),
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.82 : 1,
    transition: "transform 140ms ease, box-shadow 140ms ease, border 140ms ease, opacity 140ms ease",
  };
}

function totalChipStyleByTier(): React.CSSProperties {
  return {
    ...lineTotalChipStyle,
    background: "linear-gradient(135deg, rgba(168, 85, 247, 0.16), rgba(168, 85, 247, 0.10))",
    border: "1px dashed rgba(168, 85, 247, 0.42)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 10px 24px rgba(168, 85, 247, 0.12)",
    color: "#ffffff",
    fontWeight: 800,
    letterSpacing: "0.01em",
  };
}

function getOutboundScanAudioContext() {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!outboundScanAudioContext) {
    outboundScanAudioContext = new AudioCtx();
  }
  return outboundScanAudioContext;
}

async function armOutboundScanAudio() {
  const ctx = getOutboundScanAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx.state === "running";
}

async function playScanTone(type: "success" | "error") {
  const ctx = getOutboundScanAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  if (ctx.state !== "running") return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = type === "success" ? 880 : 240;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (type === "success" ? 0.12 : 0.18));
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + (type === "success" ? 0.12 : 0.18));
}

export default function OutboundDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const navState = location.state as { from?: string; successMessage?: string } | null;
  const from = navState?.from;
  const successMessage = navState?.successMessage;

  const [doc, setDoc] = useState<OutboundDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [savingPriceTierLineId, setSavingPriceTierLineId] = useState<string | null>(null);
  const me = useMemo(() => getSessionUser(), []);
  const paymentVisualTone = useMemo(
    () => paymentTone(Number(doc?.paidTotal ?? 0), Number(doc?.balance ?? 0)),
    [doc?.paidTotal, doc?.balance]
  );
  const totalQuantity = useMemo(() => doc?.lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0) ?? 0, [doc]);
  const documentTotalBySelectedTier = useMemo(
    () => doc?.lines.reduce((sum, line) => sum + (Number(line.quantity ?? 0) * outboundUnitPrice(line, line.priceTier)), 0) ?? 0,
    [doc]
  );
  const usedBins = useMemo(() => {
    if (!doc) return [];
    return Array.from(
      new Set(
        doc.lines
          .map((line) => line.fromBinCode || line.fromBinName || line.fromBinId)
          .filter(Boolean)
      )
    );
  }, [doc]);
  const duplicateProductIds = useMemo(() => {
    if (!doc) return new Set<string>();
    const counts = new Map<string, number>();
    for (const line of doc.lines) {
      counts.set(line.productId, (counts.get(line.productId) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([productId]) => productId));
  }, [doc]);
  const highQuantityLineIds = useMemo(() => {
    if (!doc) return new Set<string>();
    return new Set(doc.lines.filter((line) => Number(line.quantity ?? 0) >= 100).map((line) => line.id));
  }, [doc]);
  const linesWithoutBin = useMemo(() => {
    if (!doc) return 0;
    return doc.lines.filter((line) => !line.fromBinCode && !line.fromBinName && !line.fromBinId).length;
  }, [doc]);
  const duplicateProductsCount = duplicateProductIds.size;
  const highQuantityCount = highQuantityLineIds.size;
  const warningReviewIssuesCount = duplicateProductsCount + highQuantityCount;
  const blockingReviewIssuesCount = linesWithoutBin;
  const reviewIssuesCount = warningReviewIssuesCount + blockingReviewIssuesCount;
  const isReadyForConfirm = doc ? doc.lines.length > 0 && blockingReviewIssuesCount === 0 : false;
  const [lineFilter, setLineFilter] = useState<"all" | "duplicates" | "high" | "noBin">("all");
  const [lineSearchTerm, setLineSearchTerm] = useState("");
  const [lineQtyDrafts, setLineQtyDrafts] = useState<Record<string, string>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const filteredLines = useMemo(() => {
    if (!doc) return [];
    const query = lineSearchTerm.trim().toLowerCase();
    return doc.lines.filter((line) => {
      const matchesFilter =
        lineFilter === "duplicates"
          ? duplicateProductIds.has(line.productId)
          : lineFilter === "high"
            ? highQuantityLineIds.has(line.id)
            : lineFilter === "noBin"
              ? !line.fromBinCode && !line.fromBinName && !line.fromBinId
              : true;
      if (!matchesFilter) return false;
      if (!query) return true;
      const haystack = [
        line.productSku,
        line.productName,
        line.productBarcode,
        line.productDescription,
        line.fromBinCode,
        line.fromBinName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [doc, duplicateProductIds, highQuantityLineIds, lineFilter, lineSearchTerm]);

  const allowEditLines = doc ? canEditDocumentLines(doc.status, me?.role) : false;
  const allowConfirm = !!doc && canConfirmDocument(doc.status, me?.role);
  const allowCancel = !!doc && canCancelDocument(doc.status, me?.role);
  const confirmDisabledReason = !doc
    ? null
    : doc.status === 2
      ? "Ky dokument eshte anuluar."
      : doc.status === 1
        ? "Ky dokument eshte tashme i konfirmuar."
        : doc.lines.length === 0
          ? "Dokumenti nuk mund te konfirmohet pa produkte."
          : !allowConfirm
            ? "Ky dokument nuk mund te konfirmohet ne kete gjendje."
            : blockingReviewIssuesCount > 0
              ? "Para konfirmimit, rregullo produktet pa shporte."
              : null;
  const summaryStatusInfo = !doc
    ? null
    : doc.status === 2
      ? {
          border: "1px solid rgba(148, 163, 184, 0.24)",
          background: "rgba(148, 163, 184, 0.10)",
          message: "Dokumenti eshte anuluar dhe nuk mund te konfirmohet.",
        }
      : doc.status === 1
        ? {
            border: "1px solid rgba(96, 165, 250, 0.24)",
            background: "rgba(96, 165, 250, 0.10)",
            message: "Dokumenti eshte tashme i konfirmuar.",
          }
        : doc.lines.length === 0
          ? {
              border: "1px solid rgba(245, 158, 11, 0.24)",
              background: "rgba(245, 158, 11, 0.10)",
              message: "Dokumenti eshte ende bosh. Shto te pakten nje produkt para konfirmimit.",
            }
          : reviewIssuesCount === 0
            ? {
                border: "1px solid rgba(34, 197, 94, 0.24)",
                background: "rgba(34, 197, 94, 0.10)",
                message: "Dokumenti eshte gati per konfirmim.",
              }
            : blockingReviewIssuesCount === 0
              ? {
                  border: "1px solid rgba(245, 158, 11, 0.24)",
                  background: "rgba(245, 158, 11, 0.10)",
                  message: `Dokumenti mund te konfirmohet. Ka paralajmerime per kontroll: produkte ne disa rreshta ${duplicateProductsCount}, sasi e larte ${highQuantityCount}.`,
                }
            : {
                border: "1px solid rgba(245, 158, 11, 0.24)",
                background: "rgba(245, 158, 11, 0.10)",
                message: `Rregullo keto para konfirmimit: produkte pa shporte ${linesWithoutBin}. Paralajmerime: produkte ne disa rreshta ${duplicateProductsCount}, sasi e larte ${highQuantityCount}.`,
              };

  const [qtyInput, setQtyInput] = useState("1");

  const [productTerm, setProductTerm] = useState("");
  const [productHits, setProductHits] = useState<ProductHitDto[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductHitDto | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const productDropdownRef = useRef<HTMLDivElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const scanMode = true;
  const [scanFeedback, setScanFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const [binTerm, setBinTerm] = useState("");
  const [binHits, setBinHits] = useState<SuggestedBinDto[]>([]);
  const [selectedBin, setSelectedBin] = useState<SuggestedBinDto | null>(null);
  const [loadingBins, setLoadingBins] = useState(false);
  const [showBinDropdown, setShowBinDropdown] = useState(false);
  const [activeBinIndex, setActiveBinIndex] = useState(0);
  const binDropdownRef = useRef<HTMLDivElement | null>(null);
  const binInputRef = useRef<HTMLInputElement | null>(null);
  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingSuggestedBins, setLoadingSuggestedBins] = useState(false);
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const qty = qtyInput.trim() === "" ? 0 : parseWholeQty(qtyInput);
  const hasValidQty = Number.isInteger(qty) && qty > 0;
  const selectedAvailableQty = typeof selectedBin?.availableQty === "number" ? selectedBin.availableQty : null;
  const stockIssue = selectedBin && selectedAvailableQty !== null
    ? selectedAvailableQty <= 0
      ? "Nuk ka sasi te disponueshme per kete stok."
      : qty > selectedAvailableQty
        ? `Sasia nuk mjafton. Gjendja: ${formatQty(selectedAvailableQty)}.`
        : null
    : null;
  const canChooseBin = allowEditLines && !!selectedProduct;
  const canEnterQty = allowEditLines && !!selectedBin;
  const canSubmitLine = allowEditLines && !!selectedProduct && !!selectedBin && hasValidQty && !stockIssue;
  const lineSubmitHint = !allowEditLines
    ? "Dokumenti nuk mund te ndryshohet."
    : !selectedProduct
      ? "Zgjidh produktin."
      : !selectedBin
        ? "Zgjidh stokun."
        : !hasValidQty
          ? "Sasia duhet te jete numer i plote me i madh se 0."
          : stockIssue;

  useEffect(() => {
    if (!id) return;

    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    getOutbound(id, ac.signal)
      .then(setDoc)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    if (!scanFeedback) return;
    const t = window.setTimeout(() => setScanFeedback(null), 1600);
    return () => window.clearTimeout(t);
  }, [scanFeedback]);

  useEffect(() => {
    if (!actionNotice) return;
    const t = window.setTimeout(() => setActionNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [actionNotice]);

  useEffect(() => {
    if (!scanMode || !allowEditLines) return;
    const t = window.setTimeout(() => productInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [allowEditLines, scanMode]);

  useEffect(() => {
    if (!allowEditLines) return;
    void armOutboundScanAudio().catch(() => {
      // ignore audio arming errors
    });
  }, [allowEditLines]);

  useEffect(() => {
    if (!successMessage || !allowEditLines) return;
    const t = window.setTimeout(() => {
      productInputRef.current?.focus();
      productInputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [allowEditLines, successMessage]);

  useScannerCapture({
    enabled: scanMode && allowEditLines,
    onScan: async (value) => {
      await handleScannerSubmit(value);
    },
  });

  useEffect(() => {
    const term = productTerm.trim();

    if (term.length < 2) {
      setProductHits([]);
      setActiveProductIndex(0);
      return;
    }

    const ac = new AbortController();
    setLoadingProducts(true);

    const t = setTimeout(async () => {
      try {
        const res = await searchProducts(term, ac.signal);
        setProductHits((res ?? []).filter((p) => p.isActive));
        setActiveProductIndex(0);
        setShowProductDropdown(true);
      } catch {
        // ignore abort/network errors
      } finally {
        setLoadingProducts(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [productTerm]);

  useEffect(() => {
    const term = binTerm.trim();

    if (!selectedProduct) {
      setBinHits([]);
      setActiveBinIndex(0);
      return;
    }

    if (selectedBin && term === formatStockSelectionLabel(selectedBin)) {
      return;
    }

    if (term.length < 2) {
      setBinHits([]);
      setActiveBinIndex(0);
      return;
    }

    const ac = new AbortController();
    setLoadingBins(true);

    const t = setTimeout(async () => {
      try {
        const res = await getSuggestedBins(selectedProduct.id, ac.signal, term, true);
        setBinHits(res ?? []);
        setActiveBinIndex(0);
        setShowBinDropdown(true);
      } catch {
        // ignore abort/network errors
      } finally {
        setLoadingBins(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [binTerm, selectedBin, selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) {
      setLoadingSuggestedBins(false);
      setSuggestionNote(null);
      return;
    }

    const ac = new AbortController();
    setLoadingSuggestedBins(true);
    const rememberedBin = getLastBinForProduct(selectedProduct.id);

    getSuggestedBins(selectedProduct.id, ac.signal, undefined, true)
      .then((res) => {
        const suggestions = mergeSuggestedBins(
          rememberedBin ? { ...rememberedBin, reason: "Shporta e fundit e perdorur ne kete sesion" } : null,
          res ?? []
        );
        setBinHits(suggestions);
        if (!selectedBin && !binTerm.trim() && suggestions.length > 0) {
          const first = suggestions[0];
          setSelectedBin(first);
          setBinTerm(formatStockSelectionLabel(first));
          setSuggestionNote(first.reason ?? "Stok i sugjeruar automatikisht");
          window.setTimeout(() => {
            qtyInputRef.current?.focus();
            qtyInputRef.current?.select();
          }, 20);
        } else if (suggestions.length === 0) {
          setSuggestionNote(null);
        }
      })
      .catch(() => {
        setSuggestionNote(null);
      })
      .finally(() => setLoadingSuggestedBins(false));

    return () => ac.abort();
  }, [selectedProduct]);

  useEffect(() => {
    if (!showProductDropdown) return;
    productDropdownRef.current?.querySelector<HTMLElement>(`[data-product-index="${activeProductIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeProductIndex, showProductDropdown]);

  useEffect(() => {
    if (!showBinDropdown) return;
    binDropdownRef.current?.querySelector<HTMLElement>(`[data-bin-index="${activeBinIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeBinIndex, showBinDropdown]);

  async function refresh() {
    if (!id) return;
    const fresh = await getOutbound(id);
    setDoc(fresh);
  }

  function showScanFeedback(tone: "success" | "error", message: string) {
    setScanFeedback({ tone, message });
    if (scanMode) playScanTone(tone);
  }

  function selectProduct(product: ProductHitDto) {
    setSelectedProduct(product);
    setProductTerm(`${product.sku} — ${product.name}`);
    setSelectedBin(null);
    setBinTerm("");
    setBinHits([]);
    setShowBinDropdown(false);
    setSuggestionNote(null);
    setQtyInput("1");
    setShowProductDropdown(false);
    setActiveProductIndex(0);
    window.setTimeout(() => {
      binInputRef.current?.focus();
      binInputRef.current?.select();
    }, 20);
  }

  function selectBin(bin: SuggestedBinDto) {
    setSelectedBin(bin);
    setBinTerm(formatStockSelectionLabel(bin));
    setShowBinDropdown(false);
    setActiveBinIndex(0);
    window.setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 20);
  }

  async function resolvePreferredBin(productId: string) {
    const remembered = getLastBinForProduct(productId);
    const suggestions = await getSuggestedBins(productId, undefined, undefined, true);
    if (suggestions.length > 0) {
      return {
        bin: suggestions[0] ?? null,
        suggestions: mergeSuggestedBins(
          remembered ? { ...remembered, reason: "Shporta e fundit e perdorur ne kete sesion" } : null,
          suggestions
        ),
      };
    }

    return { bin: null, suggestions: [] };
  }

  async function addResolvedLine(product: ProductHitDto, bin: SuggestedBinDto, quantity: number) {
    if (!id) return;
    const wasEmptyBeforeAdd = (doc?.lines.length ?? 0) === 0;

    await addOutboundLine(id, {
      productId: product.id,
      fromBinId: bin.id,
      lotNumber: bin.lotNumber ?? null,
      batchNumber: bin.batchNumber ?? null,
      expiryDate: bin.expiryDate ?? null,
      quantity,
    });

    writeLastBinForProduct(product.id, { ...bin, reason: "Shporta e fundit e perdorur ne kete sesion" });

    setProductTerm("");
    setSelectedProduct(null);
    setProductHits([]);
    setShowProductDropdown(false);
    setSuggestionNote(null);
    setBinTerm("");
    setSelectedBin(null);
    setBinHits([]);
    setShowBinDropdown(false);
    setQtyInput("1");

    await refresh();
    setActionNotice(
      wasEmptyBeforeAdd
        ? "Produkti u shtua. Vazhdoni me produktin tjeter ose konfirmoni dokumentin."
        : "Produkti u shtua me sukses."
    );

    if (scanMode) {
      showScanFeedback("success", `${product.sku} u shtua me sukses`);
      window.setTimeout(() => {
        productInputRef.current?.focus();
        productInputRef.current?.select();
      }, 20);
    }
  }

  async function handleScannerSubmit(rawTerm: string) {
    const term = rawTerm.trim();
    if (!term) return false;

    try {
      setErr(null);
      const results = (await searchProducts(term)).filter((p) => p.isActive);
      const exactMatches = results.filter((p) => isExactProductMatch(p, term));

      if (exactMatches.length !== 1) {
        if (results.length > 0) {
          setProductHits(results);
          setShowProductDropdown(true);
          setActiveProductIndex(0);
          showScanFeedback("error", "Produkti nuk u gjet me perputhje ekzakte nga barkodi");
        } else {
          showScanFeedback("error", "Produkti nuk u gjet nga barkodi");
        }
        return false;
      }

      const product = exactMatches[0];
      selectProduct(product);

      const preferred = await resolvePreferredBin(product.id);
      if (preferred.bin) {
        setSelectedBin(preferred.bin);
        setBinTerm(formatStockSelectionLabel(preferred.bin));
        setSuggestionNote(preferred.bin.reason ?? "Stok i sugjeruar automatikisht");
      }

      showScanFeedback("success", `${product.sku} u lexua. Verifiko stokun FEFO dhe sasine para shtimit.`);
      window.setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 20);

      return true;
    } catch (e) {
      setErr(errorMessage(e));
      return false;
    }
  }

  async function onAddLine() {
    if (!id) return;
    setErr(null);

    if (!selectedProduct) {
      setErr("Zgjidh nje produkt nga lista.");
      return;
    }

    if (!selectedBin) {
      setErr("Zgjidh nje stok nga lista.");
      return;
    }

    if (!hasValidQty) {
      setErr("Sasia duhet te jete numer i plote me i madh se 0.");
      return;
    }

    if (stockIssue) {
      setErr(stockIssue);
      return;
    }

    try {
      await addResolvedLine(selectedProduct, selectedBin, qty);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function onDeleteLine(lineId: string) {
    if (!id) return;
    setErr(null);

    try {
      await deleteOutboundLine(id, lineId);
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function onAdjustLineQuantity(lineId: string, delta: number) {
    if (!id || delta === 0) return;
    if (!Number.isInteger(delta)) {
      setErr("Ndryshimi i sasise duhet te jete numer i plote.");
      return;
    }
    setErr(null);
    setSavingLineId(lineId);

    try {
      await adjustOutboundLineQuantity(id, lineId, { delta });
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSavingLineId(null);
    }
  }

  async function onSaveLineQuantity(lineId: string, currentQty: number) {
    const raw = lineQtyDrafts[lineId];
    if (!raw) return;

    const nextQty = parseWholeQty(raw);
    if (!Number.isInteger(nextQty) || nextQty <= 0) {
      setErr("Shkruaj nje sasi te plote me te madhe se 0.");
      return;
    }

    const delta = nextQty - currentQty;
    if (delta === 0) return;

    await onAdjustLineQuantity(lineId, delta);
    setLineQtyDrafts((prev) => {
      const copy = { ...prev };
      delete copy[lineId];
      return copy;
    });
  }

  async function onConfirm() {
    if (!id) return;
    setErr(null);

    try {
      await confirmOutbound(id);
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function onCancel() {
    if (!id) return;
    setErr(null);

    try {
      await cancelOutbound(id);
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function onExportPdf() {
    if (!doc || !id) return;
    setErr(null);

    await downloadFile(outboundPdfUrl(id), `${doc.documentNo}_${statusLabel(doc.status)}.pdf`);
  }

  async function onExportExcel() {
    if (!doc || !id) return;
    setErr(null);

    await downloadFile(outboundExcelUrl(id), `${doc.documentNo}_${statusLabel(doc.status)}.xlsx`);
  }

  async function onPriceTierChange(lineId: string, currentTier: OutboundPriceTier, nextTier: OutboundPriceTier) {
    if (!doc || !id) return;
    if (currentTier === nextTier) return;

    setErr(null);
    setSavingPriceTierLineId(lineId);
    try {
      await setOutboundLinePriceTier(id, lineId, nextTier);
      setDoc((current) =>
        current
          ? {
              ...current,
              lines: current.lines.map((line) =>
                line.id === lineId ? { ...line, priceTier: nextTier } : line
              ),
            }
          : current
      );
      setActionNotice(`Cmimi i produktit u ndryshua ne ${priceTierLabel(nextTier)}.`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSavingPriceTierLineId(null);
    }
  }

  if (loading) return <div>{UI.common.loading}</div>;
  if (err && !doc) return <div style={{ color: "tomato" }}>{err}</div>;
  if (!doc) return <div>{UI.common.notFound}</div>;

  const canRegisterPaymentFromDocument = doc.status === 1 && !!doc.customerId && Number(doc.balance ?? 0) > 0;
  const registerPaymentUrl = (() => {
    const qs = new URLSearchParams();
    qs.set("partnerType", "customer");
    if (doc.customerId) qs.set("partnerId", doc.customerId);
    qs.set("documentId", doc.id);
    qs.set("documentNo", doc.documentNo);
    qs.set("amount", String(Math.max(0, Number(doc.balance ?? 0))));
    qs.set("reference", doc.documentNo);
    qs.set("note", `Pagese per dokumentin dalës ${doc.documentNo}`);
    return `/finance?${qs.toString()}`;
  })();

  return (
    <div>
      <PageIntro
        title={`${UI.document.outboundDocumentTitle} • ${doc.documentNo}`}
        subtitle={
          <>
            {UI.document.status}: <b>{statusLabel(doc.status)}</b>
            {doc.customerName ? <> • Klienti: <b>{doc.customerCode ? `${doc.customerCode} - ` : ""}{doc.customerName}</b></> : null}
            {doc.reference ? <> • {UI.document.reference}: <b>{doc.reference}</b></> : null}
            {doc.note ? <> • {UI.document.note}: <b>{doc.note}</b></> : null}
          </>
        }
        actions={
          <>
            <ActionButton tone="neutral" onClick={() => nav(from ?? "/outbound")} style={toolbarBtnStyle}>
              <BackIcon />
              Prapa
            </ActionButton>
            <ActionButton tone="neutral" onClick={() => nav(`/outbound/${doc.id}/pick-list`)} style={toolbarBtnStyle}>
              <PickListIcon />
              Lista e pergatitjes
            </ActionButton>
            <ActionButton tone="pdf" onClick={onExportPdf} style={toolbarBtnStyle}>
              <PdfIcon />
              {UI.common.exportPdf}
            </ActionButton>
            <ActionButton tone="excel" onClick={onExportExcel} style={toolbarBtnStyle}>
              <ExcelIcon />
              {UI.common.exportExcel}
            </ActionButton>
            <ActionButton
              tone="primary"
              disabled={!canRegisterPaymentFromDocument}
              title={
                canRegisterPaymentFromDocument
                  ? "Regjistro pagese per kete dokument"
                  : "Pagesa mund te regjistrohet vetem per dokument te konfirmuar, me klient dhe balance te hapur."
              }
              onClick={() => nav(registerPaymentUrl)}
              style={toolbarBtnStyle}
            >
              <PaymentIcon />
              Regjistro pagese
            </ActionButton>
            <ActionButton
              tone="success"
              disabled={!allowConfirm || !isReadyForConfirm}
              title={confirmDisabledReason ?? undefined}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                boxShadow: allowConfirm && isReadyForConfirm ? "0 10px 24px color-mix(in srgb, var(--success) 22%, transparent)" : "none",
              }}
              onClick={async () => {
                if (!window.confirm(UI.confirm.confirmDocument)) return;
                await onConfirm();
              }}
            >
              <ConfirmIcon />
              {UI.document.confirm}
            </ActionButton>
            <ActionButton
              tone="danger"
              disabled={!allowCancel}
              style={{
                ...toolbarBtnStyle,
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                boxShadow: allowCancel ? "0 10px 24px color-mix(in srgb, var(--danger) 18%, transparent)" : "none",
              }}
              onClick={async () => {
                if (!window.confirm(UI.confirm.cancelDocument)) return;
                await onCancel();
              }}
            >
              <CancelIcon />
              {UI.document.cancel}
            </ActionButton>
          </>
        }
      />

      {successMessage ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(34, 197, 94, 0.28)",
            background: "rgba(34, 197, 94, 0.12)",
            color: "var(--text)",
            fontWeight: 700,
          }}
        >
          <div>{successMessage}</div>
          <button
            type="button"
            onClick={() => nav("/documents/new?type=outbound")}
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(34, 197, 94, 0.30)",
              background: "rgba(255, 255, 255, 0.88)",
              color: "#14532d",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Krijo nje dokument tjeter
          </button>
        </div>
      ) : null}

      {err ? <div style={{ color: "tomato", marginTop: 12 }}>{err}</div> : null}

      {actionNotice ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(34, 197, 94, 0.24)",
            background: "rgba(34, 197, 94, 0.10)",
            color: "var(--text)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {actionNotice}
        </div>
      ) : null}

      {confirmDisabledReason ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(245, 158, 11, 0.24)",
            background: "rgba(245, 158, 11, 0.10)",
            color: "var(--text)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {confirmDisabledReason}
        </div>
      ) : null}

      <SurfaceCard
        style={{
          marginTop: 16,
          border: "1px solid rgba(59, 130, 246, 0.26)",
          background: "linear-gradient(180deg, rgba(59, 130, 246, 0.08), var(--panel))",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Hapi 1: {UI.document.addProductToDocument}</div>
        <div style={{ color: "var(--muted)", marginBottom: 14, fontSize: 14 }}>
          Kerko produktin, zgjidh shporten dhe shkruaj sasine. Pastaj kliko butonin per ta shtuar ne dokument.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <div style={{ position: "relative" }}>
              <FieldLabel>Kerko produktin (SKU / Emer / Barcode)</FieldLabel>

              <input
                ref={productInputRef}
                data-smd-scanner-input="product"
                disabled={!allowEditLines}
                value={productTerm}
                onChange={(e) => {
                  setProductTerm(e.target.value);
                  setSelectedProduct(null);
                  setActiveProductIndex(0);
                }}
                onFocus={() => {
                  if (productHits.length) setShowProductDropdown(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowProductDropdown(false), 150);
                }}
                onKeyDown={async (e) => {
                  const visibleHits = productHits.slice(0, 8);
                  if (showProductDropdown && visibleHits.length > 0 && e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveProductIndex((prev) => Math.min(prev + 1, visibleHits.length - 1));
                    return;
                  }
                  if (showProductDropdown && visibleHits.length > 0 && e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveProductIndex((prev) => Math.max(prev - 1, 0));
                    return;
                  }
                  if (showProductDropdown && visibleHits.length > 0 && e.key === "Escape") {
                    e.preventDefault();
                    setShowProductDropdown(false);
                    return;
                  }
                  if (showProductDropdown && visibleHits.length > 0 && e.key === "Enter" && !selectedProduct) {
                    e.preventDefault();
                    selectProduct(visibleHits[activeProductIndex] ?? visibleHits[0]);
                    return;
                  }
                  if (e.key === "Enter" || (e.key === "Tab" && scanMode && productTerm.trim().length >= 4)) {
                    e.preventDefault();
                    if (scanMode) {
                      const handled = await handleScannerSubmit(productTerm);
                      if (handled) return;
                    }
                    void onAddLine();
                  }
                }}
                placeholder="p.sh. SKU-0015 ose Frutex ose 223456..."
                style={{
                  padding: 10,
                  borderRadius: 10,
                  width: 320,
                  border: scanFeedback?.tone === "success" ? "1px solid rgba(34, 197, 94, 0.45)" : scanFeedback?.tone === "error" ? "1px solid rgba(239, 68, 68, 0.48)" : undefined,
                  boxShadow: scanFeedback?.tone === "success" ? "0 0 0 3px rgba(34, 197, 94, 0.14)" : scanFeedback?.tone === "error" ? "0 0 0 3px rgba(239, 68, 68, 0.14)" : undefined,
                }}
              />

              {scanMode && scanFeedback ? (
                <div style={{ marginTop: 8, width: 320, padding: "8px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: scanFeedback.tone === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)", border: scanFeedback.tone === "success" ? "1px solid rgba(34, 197, 94, 0.24)" : "1px solid rgba(239, 68, 68, 0.24)", color: "var(--text)" }}>
                  {scanFeedback.message}
                </div>
              ) : null}

              {allowEditLines && showProductDropdown && (productHits.length > 0 || loadingProducts) && (
                <div
                  ref={productDropdownRef}
                  style={{
                    position: "absolute",
                    top: 62,
                    left: 0,
                    width: 320,
                    zIndex: 50,
                    borderRadius: 12,
                    background: "var(--panel-strong)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow)",
                    overflow: "hidden",
                    maxHeight: 360,
                    overflowY: "auto",
                  }}
                >
                  {loadingProducts ? (
                    <div style={{ padding: 10, opacity: 0.8, fontSize: 13 }}>Duke kerkuar...</div>
                  ) : null}

                  {!loadingProducts &&
                    productHits.slice(0, 8).map((p, index) => {
                      const existingLine = doc.lines.find((line) => line.productId === p.id);
                      const isActive = index === activeProductIndex;
                      const query = productTerm.trim().toLowerCase();
                      const matchType = p.sku?.toLowerCase().includes(query)
                        ? "SKU match"
                        : p.barcode?.toLowerCase().includes(query)
                          ? "Barcode match"
                          : "Emri match";

                      return (
                      <div
                        key={p.id}
                        data-product-index={index}
                        onMouseEnter={() => setActiveProductIndex(index)}
                        onMouseDown={() => selectProduct(p)}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          background: isActive ? "rgba(96, 165, 250, 0.14)" : "transparent",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {renderHighlighted(p.sku, productTerm)} <span style={{ opacity: 0.8, fontWeight: 600 }}>— {renderHighlighted(p.name, productTerm)}</span>
                          </div>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", opacity: 0.85, whiteSpace: "nowrap" }}>
                            {matchType}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          {p.barcode ? <>Barkodi: {renderHighlighted(p.barcode, productTerm)}</> : "—"}
                          {p.unitOfMeasure ? ` • ${p.unitOfMeasure}` : ""}
                        </div>
                        {formatProductPrices(p) ? (
                          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                            {formatProductPrices(p)}
                          </div>
                        ) : null}
                        {existingLine ? (
                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(245, 158, 11, 0.14)", border: "1px solid rgba(245, 158, 11, 0.24)", color: "inherit" }}>
                              Ekziston ne dokument
                            </span>
                            <span style={{ fontSize: 11, opacity: 0.75 }}>
                              Sasia aktuale: {formatQty(existingLine.quantity)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )})}

                  {!loadingProducts && productHits.length === 0 ? (
                    <div style={{ padding: 10, opacity: 0.8, fontSize: 13 }}>Nuk u gjet asnje produkt.</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ position: "relative" }}>
              {allowEditLines && selectedProduct ? (
                <div style={{ marginBottom: 8, display: "grid", gap: 8, width: 320 }}>
                  {loadingSuggestedBins ? <div style={{ fontSize: 12, opacity: 0.75 }}>Duke gjetur stokun me te pershtatshem...</div> : null}

                  {selectedBin && suggestionNote ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "rgba(96, 165, 250, 0.10)",
                        border: "1px solid rgba(96, 165, 250, 0.22)",
                        color: "var(--text)",
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 4 }}>Stoku i sugjeruar FEFO</div>
                      <div style={{ fontWeight: 800 }}>
                        {selectedBin.code} — {selectedBin.name}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                        {suggestionNote}
                        {(() => {
                          const availableQty = (selectedBin as SuggestedBinDto | null)?.availableQty;
                          return typeof availableQty === "number" && availableQty > 0
                            ? ` • Gjendja: ${formatQty(availableQty)}`
                            : "";
                        })()}
                      </div>
                      {("lotNumber" in selectedBin || "batchNumber" in selectedBin || "expiryDate" in selectedBin) ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          {(selectedBin as SuggestedBinDto).lotNumber ? (
                            <span style={metaChipStyle}>Seria: {(selectedBin as SuggestedBinDto).lotNumber}</span>
                          ) : null}
                          {(selectedBin as SuggestedBinDto).batchNumber ? (
                            <span style={metaChipStyle}>Grupi: {(selectedBin as SuggestedBinDto).batchNumber}</span>
                          ) : null}
                          {(selectedBin as SuggestedBinDto).expiryDate ? (
                            <span style={(selectedBin as SuggestedBinDto).isExpired ? metaChipExpiredStyle : metaChipExpiryStyle}>
                              Skadon: {formatDateOnly((selectedBin as SuggestedBinDto).expiryDate)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {selectedProduct && selectedBin ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "rgba(34, 197, 94, 0.10)",
                            border: "1px solid rgba(34, 197, 94, 0.22)",
                            color: "var(--text)",
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 5 }}>Stoku i zgjedhur</div>
                          <div style={{ fontWeight: 800 }}>
                            {selectedProduct.sku} — {selectedProduct.name}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                            Nga shporta: <b>{selectedBin.code}</b> — {selectedBin.name}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            {selectedProduct.barcode ? <span style={metaChipStyle}>Barcode: {selectedProduct.barcode}</span> : null}
                            {"availableQty" in selectedBin && typeof (selectedBin as SuggestedBinDto).availableQty === "number" ? (
                              <span style={metaChipStyle}>Gjendja: {formatQty((selectedBin as SuggestedBinDto).availableQty)}</span>
                            ) : null}
                            {(selectedBin as SuggestedBinDto).lotNumber ? (
                              <span style={metaChipStyle}>Seria: {(selectedBin as SuggestedBinDto).lotNumber}</span>
                            ) : (
                              <span style={mutedMetaChipStyle}>Pa seri</span>
                            )}
                            {(selectedBin as SuggestedBinDto).batchNumber ? (
                              <span style={metaChipStyle}>Grupi: {(selectedBin as SuggestedBinDto).batchNumber}</span>
                            ) : (
                              <span style={mutedMetaChipStyle}>Pa grup</span>
                            )}
                            {(selectedBin as SuggestedBinDto).expiryDate ? (
                              <span style={(selectedBin as SuggestedBinDto).isExpired ? metaChipExpiredStyle : metaChipExpiryStyle}>
                                Skadon: {formatDateOnly((selectedBin as SuggestedBinDto).expiryDate)}
                              </span>
                            ) : (
                              <span style={mutedMetaChipStyle}>Pa skadence</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        disabled={!allowEditLines}
                        onClick={() => {
                          setShowBinDropdown(true);
                          window.setTimeout(() => {
                            binInputRef.current?.focus();
                            binInputRef.current?.select();
                          }, 20);
                        }}
                        style={{
                          marginTop: 8,
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "var(--panel-soft)",
                          color: "var(--text)",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Ndrysho stokun
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <FieldLabel>Hapi 2: Zgjidh stokun</FieldLabel>

              <input
                ref={binInputRef}
                disabled={!canChooseBin}
                value={binTerm}
                onChange={(e) => {
                  setBinTerm(e.target.value);
                  setSelectedBin(null);
                  setActiveBinIndex(0);
                  if (e.target.value.trim().length >= 2) setShowBinDropdown(true);
                }}
                onFocus={() => {
                  if (binHits.length) setShowBinDropdown(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowBinDropdown(false), 150);
                }}
                onKeyDown={(e) => {
                  const visibleHits = binHits.slice(0, 10);
                  if (showBinDropdown && visibleHits.length > 0 && e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveBinIndex((prev) => Math.min(prev + 1, visibleHits.length - 1));
                    return;
                  }
                  if (showBinDropdown && visibleHits.length > 0 && e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveBinIndex((prev) => Math.max(prev - 1, 0));
                    return;
                  }
                  if (showBinDropdown && visibleHits.length > 0 && e.key === "Escape") {
                    e.preventDefault();
                    setShowBinDropdown(false);
                    return;
                  }
                  if (showBinDropdown && visibleHits.length > 0 && e.key === "Enter") {
                    e.preventDefault();
                    selectBin(visibleHits[activeBinIndex] ?? visibleHits[0]);
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onAddLine();
                  }
                }}
                placeholder={selectedProduct ? "Kerko shporte, seri ose grup" : "Zgjidh fillimisht produktin"}
                style={{ padding: 10, borderRadius: 10, width: 320, opacity: canChooseBin ? 1 : 0.65 }}
              />

              {allowEditLines && showBinDropdown && (binHits.length > 0 || loadingBins) && (
                <div
                  ref={binDropdownRef}
                  style={{
                    position: "absolute",
                    top: 62,
                    left: 0,
                    width: 320,
                    zIndex: 50,
                    borderRadius: 12,
                    background: "var(--panel-strong)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow)",
                    overflow: "hidden",
                    maxHeight: 360,
                    overflowY: "auto",
                  }}
                >
                  {loadingBins ? (
                    <div style={{ padding: 10, opacity: 0.8, fontSize: 13 }}>Duke kerkuar...</div>
                  ) : null}

                  {!loadingBins &&
                    binHits.slice(0, 10).map((b, index) => {
                      const isActive = index === activeBinIndex;
                      const sub = `${b.warehouseName} • ${b.zoneName} • ${b.rackName}`;
                      const query = binTerm.trim().toLowerCase();
                      const matchType = b.code?.toLowerCase().includes(query)
                        ? "Kodi"
                        : b.lotNumber?.toLowerCase().includes(query)
                          ? "Seria"
                          : b.batchNumber?.toLowerCase().includes(query)
                            ? "Grupi"
                            : "Stok";

                      return (
                        <div
                          key={`${b.id}-${b.lotNumber ?? ""}-${b.batchNumber ?? ""}-${b.expiryDate ?? ""}`}
                          data-bin-index={index}
                          onMouseEnter={() => setActiveBinIndex(index)}
                          onMouseDown={() => selectBin(b)}
                          style={{
                            padding: "10px 12px",
                            cursor: "pointer",
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                            background: isActive ? "rgba(96, 165, 250, 0.14)" : "transparent",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>
                              {renderHighlighted(b.code, binTerm)} <span style={{ opacity: 0.8, fontWeight: 600 }}>— {renderHighlighted(b.name, binTerm)}</span>
                            </div>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", opacity: 0.85, whiteSpace: "nowrap" }}>
                              {matchType}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{renderHighlighted(sub, binTerm)}</div>
                          <div style={{ marginTop: 7, display: "flex", gap: 7, flexWrap: "wrap" }}>
                            <span style={metaChipStyle}>Gjendja: {formatQty(b.availableQty)}</span>
                            {b.lotNumber ? <span style={metaChipStyle}>Seria: {renderHighlighted(b.lotNumber, binTerm)}</span> : <span style={mutedMetaChipStyle}>Pa seri</span>}
                            {b.batchNumber ? <span style={metaChipStyle}>Grupi: {renderHighlighted(b.batchNumber, binTerm)}</span> : <span style={mutedMetaChipStyle}>Pa grup</span>}
                            {b.expiryDate ? (
                              <span style={b.isExpired ? metaChipExpiredStyle : metaChipExpiryStyle}>
                                Skadon: {formatDateOnly(b.expiryDate)}
                              </span>
                            ) : (
                              <span style={mutedMetaChipStyle}>Pa skadence</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {!loadingBins && binHits.length === 0 ? (
                    <div style={{ padding: 10, opacity: 0.8, fontSize: 13 }}>Nuk u gjet stok i disponueshem.</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>{`Hapi 3: ${UI.document.quantity}`}</FieldLabel>
            <input
              ref={qtyInputRef}
              disabled={!canEnterQty}
              type="text"
              inputMode="numeric"
              value={qtyInput}
              onChange={(e) => setQtyInput(normalizeQtyInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onAddLine();
                }
              }}
              style={{ padding: 10, borderRadius: 10, width: 120, opacity: canEnterQty ? 1 : 0.65 }}
            />
          </div>

          <ActionButton
            tone="primary"
            disabled={!canSubmitLine}
            title={lineSubmitHint ?? undefined}
            onClick={() => void onAddLine()}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              fontWeight: 800,
              boxShadow: canSubmitLine
                ? "0 12px 28px color-mix(in srgb, var(--accent) 24%, transparent)"
                : "none",
            }}
          >
            <AddIcon />
            {UI.document.addProduct}
           </ActionButton>
            <div
                style={{
                    minWidth: 220,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px dashed rgba(34, 197, 94, 0.26)",
                    background: "rgba(34, 197, 94, 0.08)",
                }}
            >
                <FieldLabel>Scan mode aktiv</FieldLabel>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Nese po punon me skaner dore, mund te fillosh menjehere pa aktivizim shtese.
                </div>
            </div>
        </div>

        {allowEditLines && selectedBin && stockIssue ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(245, 158, 11, 0.26)",
              background: "rgba(245, 158, 11, 0.10)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {stockIssue}
          </div>
        ) : null}

        {doc.lines.length === 0 && allowEditLines ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              border: "1px dashed rgba(59, 130, 246, 0.34)",
              background: "rgba(59, 130, 246, 0.08)",
              color: "var(--text)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Si te vazhdosh</div>
            <div style={{ fontSize: 14, color: "var(--muted-strong)" }}>
              1. Kerko produktin. 2. Zgjidh stokun me seri/grup/skadence. 3. Shkruaj sasine. 4. Kliko butonin per ta shtuar ne dokument.
            </div>
          </div>
        ) : null}

        {!allowEditLines ? (
          <div style={{ marginTop: 10, opacity: 0.75 }}>{UI.document.cannotEdit}</div>
        ) : null}
      </SurfaceCard>

      {doc.lines.length === 0 ? (
        <SurfaceCard
          style={{
            marginTop: 16,
            border: "1px dashed rgba(148, 163, 184, 0.28)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            Pasi te shtoni produktin e pare, ketu do te shfaqen produktet dhe konfirmimi i dokumentit.
          </div>
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            Tani per tani mjafton te ndjekesh hapat e siperm dhe te shtosh produktin e pare ne dokument.
          </div>
        </SurfaceCard>
      ) : null}

      <div style={{ marginTop: 16, display: doc.lines.length === 0 ? "none" : undefined }}>
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            border: isReadyForConfirm
              ? warningReviewIssuesCount > 0
                ? "1px solid rgba(245, 158, 11, 0.28)"
                : "1px solid rgba(34, 197, 94, 0.28)"
              : "1px solid rgba(245, 158, 11, 0.28)",
            background: isReadyForConfirm
              ? warningReviewIssuesCount > 0
                ? "rgba(245, 158, 11, 0.12)"
                : "rgba(34, 197, 94, 0.12)"
              : "rgba(245, 158, 11, 0.12)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            {isReadyForConfirm
              ? warningReviewIssuesCount > 0
                ? "Hapi 3: Dokumenti mund te konfirmohet"
                : "Hapi 3: Dokumenti eshte gati per konfirmim"
              : "Hapi 3: Dokumenti ka sinjale bllokuese"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.82, marginTop: 4 }}>
            {isReadyForConfirm
              ? warningReviewIssuesCount > 0
                ? `Ka ${warningReviewIssuesCount} paralajmerime per kontroll, por nuk e bllokojne konfirmimin.`
                : `Ka ${doc.lines.length} produkte, sasi totale ${formatQty(totalQuantity)} dhe asnje paralajmerim aktiv.`
              : `Ka ${blockingReviewIssuesCount} sinjale qe duhet te rregullohen para konfirmimit.`}
          </div>
        </div>
      </div>

      <SurfaceCard style={{ marginTop: 16, display: doc.lines.length === 0 ? "none" : undefined }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Hapi 2: Produktet qe keni shtuar ne dokument ({doc.lines.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {[
            { key: "all", label: "Te gjitha produktet", count: doc.lines.length },
            { key: "duplicates", label: "Produkte ne disa rreshta", count: duplicateProductsCount },
            { key: "high", label: "Sasi te medha", count: highQuantityCount },
            { key: "noBin", label: "Produkte pa shporte", count: linesWithoutBin },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setLineFilter(filter.key as typeof lineFilter)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: lineFilter === filter.key ? "1px solid rgba(96, 165, 250, 0.36)" : "1px solid var(--border)",
                background: lineFilter === filter.key ? "rgba(96, 165, 250, 0.14)" : "var(--panel-soft)",
                color: "inherit",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>
        <input
          value={lineSearchTerm}
          onChange={(e) => setLineSearchTerm(e.target.value)}
          placeholder="Kerko produkte sipas SKU, produktit, barkodit ose shportes"
          style={{
            width: "100%",
            maxWidth: 520,
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
          }}
        />

        {filteredLines.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Nuk ka asnje produkt.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredLines.map((l) => (
              <div
                key={l.id}
                style={{ padding: 12, borderRadius: 12, background: "var(--panel-soft)" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--panel-strong)",
                    border: "1px solid var(--border)",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 320, flex: "1 1 320px" }}>
                    <div style={{ fontWeight: 800 }}>
                      {l.productName ?? l.productId}
                      {l.productSku ? (
                        <span
                          style={{
                            background: "var(--panel)",
                            color: "var(--text)",
                            padding: "2px 8px",
                            borderRadius: 8,
                            fontSize: 12,
                            marginLeft: 6,
                          }}
                        >
                          {l.productSku}
                        </span>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      {duplicateProductIds.has(l.productId) ? (
                        <span style={warningChipStyle}>
                          Produkt ne disa rreshta
                        </span>
                      ) : null}
                      {!l.fromBinCode && !l.fromBinName && !l.fromBinId ? (
                        <span style={warningChipStyle}>
                          Pa shporte
                        </span>
                      ) : null}
                      {highQuantityLineIds.has(l.id) ? (
                        <span style={warningChipStyle}>
                          Sasi e larte
                        </span>
                      ) : null}
                    </div>

                    {l.productBarcode || l.productDescription ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 14,
                          flexWrap: "wrap",
                          marginTop: 8,
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        {l.productBarcode ? (
                          <span>
                            Barcode: <b style={{ color: "var(--text)" }}>{l.productBarcode}</b>
                          </span>
                        ) : null}
                        {l.productDescription ? (
                          <span>
                            Pershkrim: <b style={{ color: "var(--text)" }}>{l.productDescription}</b>
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: "flex",
                        gap: 14,
                        flexWrap: "wrap",
                        marginTop: 8,
                        fontSize: 13,
                        color: "var(--muted)",
                      }}
                    >
                      <span>
                        Shporta:{" "}
                        <b style={{ color: "var(--text)" }}>
                          {l.fromBinCode ?? l.fromBinName ?? l.fromBinId ?? "—"}
                        </b>
                      </span>
                      <span>
                        Sasia: <b style={{ color: "var(--text)" }}>{savingLineId === l.id ? "..." : formatQty(l.quantity)}</b>
                      </span>
                      {doc.status === 0 && Number(l.reservedQuantity ?? 0) > 0 ? (
                        <span>
                          Rezervuar: <b style={{ color: "#bbf7d0" }}>{formatQty(l.reservedQuantity)}</b>
                        </span>
                      ) : null}
                    </div>

                    {(l.lotNumber || l.batchNumber || l.expiryDate) ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {l.lotNumber ? <span style={metaChipStyle}>Seria: {l.lotNumber}</span> : null}
                        {l.batchNumber ? <span style={metaChipStyle}>Grupi: {l.batchNumber}</span> : null}
                        {l.expiryDate ? (
                          <span style={new Date(l.expiryDate).getTime() < Date.now() ? metaChipExpiredStyle : metaChipExpiryStyle}>
                            Skadon: {formatDateOnly(l.expiryDate)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <span style={priceChipStyle}>Blerje: {formatMoney(l.purchasePrice)}</span>
                      <button
                        type="button"
                        disabled={doc.status !== 0 || savingPriceTierLineId === l.id}
                        onClick={() => void onPriceTierChange(l.id, l.priceTier, 0)}
                        title="Perdor cmimin e pakices per kete outbound"
                        style={selectablePriceChipStyle(priceChipRetailStyle, l.priceTier === 0, doc.status !== 0 || savingPriceTierLineId === l.id)}
                      >
                        Pakice: {formatMoney(l.retailPrice)}
                      </button>
                      <button
                        type="button"
                        disabled={doc.status !== 0 || savingPriceTierLineId === l.id}
                        onClick={() => void onPriceTierChange(l.id, l.priceTier, 1)}
                        title="Perdor cmimin e shumices per kete outbound"
                        style={selectablePriceChipStyle(priceChipWholesaleStyle, l.priceTier === 1, doc.status !== 0 || savingPriceTierLineId === l.id)}
                      >
                        Shumice: {formatMoney(l.wholesalePrice)}
                      </button>
                      <button
                        type="button"
                        disabled={doc.status !== 0 || savingPriceTierLineId === l.id}
                        onClick={() => void onPriceTierChange(l.id, l.priceTier, 2)}
                        title="Perdor cmimin VIP per kete outbound"
                        style={selectablePriceChipStyle(priceChipVipStyle, l.priceTier === 2, doc.status !== 0 || savingPriceTierLineId === l.id)}
                      >
                        VIP: {formatMoney(l.vipPrice)}
                      </button>
                      <span style={totalChipStyleByTier()}>Totali: {formatMoney(Number(l.quantity ?? 0) * outboundUnitPrice(l, l.priceTier))}</span>
                    </div>
                  </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {(() => {
                          const draftValue = lineQtyDrafts[l.id];
                          const currentWholeQty = Math.trunc(Number(l.quantity ?? 0));
                          const parsedDraft = draftValue === undefined || draftValue === "" ? currentWholeQty : parseWholeQty(draftValue);
                          const isDirty = Number.isInteger(parsedDraft) && parsedDraft !== currentWholeQty;

                          return (
                              <>
                            {isDirty ? (
                        <button
                          type="button"
                          disabled={!allowEditLines || savingLineId === l.id}
                          onClick={() => void onSaveLineQuantity(l.id, Math.trunc(Number(l.quantity ?? 0)))}
                          style={saveQtyBtnStyle}
                        >
                          Ruaj
                        </button>
                      ) : null}
                      <ActionButton
                        tone="danger"
                        type="button"
                        disabled={!allowEditLines || savingLineId === l.id}
                        onClick={() => void onAdjustLineQuantity(l.id, -1)}
                        style={qtyAdjustBtnStyle}
                      >
                        -1
                      </ActionButton>
                      <input
                        disabled={!allowEditLines || savingLineId === l.id}
                        type="text"
                        inputMode="numeric"
                        value={lineQtyDrafts[l.id] ?? wholeQtyInputValue(l.quantity)}
                        onChange={(e) =>
                          setLineQtyDrafts((prev) => ({
                            ...prev,
                            [l.id]: normalizeQtyInput(e.target.value),
                          }))
                        }
                        onBlur={() => {
                          if (isDirty) {
                            void onSaveLineQuantity(l.id, Math.trunc(Number(l.quantity ?? 0)));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void onSaveLineQuantity(l.id, Math.trunc(Number(l.quantity ?? 0)));
                          }
                        }}
                        style={qtyInputStyle}
                      />
                      <ActionButton
                        tone="success"
                        type="button"
                        disabled={!allowEditLines || savingLineId === l.id}
                        onClick={() => void onAdjustLineQuantity(l.id, 1)}
                        style={qtyAdjustBtnStyle}
                      >
                        +1
                      </ActionButton>
                      
                            </>
                          );
                        })()}
                      </div>

                    <ActionButton
                      tone="dangerStrong"
                      disabled={!allowEditLines}
                      onClick={async () => {
                        if (!window.confirm(UI.deleteLine)) return;
                        await onDeleteLine(l.id);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                      }}
                    >
                      <DeleteIcon />
                      Fshi
                    </ActionButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Permbledhje e shkurter</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Produkte</div>
            <div style={summaryValueStyle}>{doc.lines.length}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Sasia totale</div>
            <div style={summaryValueStyle}>{formatQty(totalQuantity)}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Shporta te perdorura</div>
            <div style={summaryValueStyle}>{usedBins.length}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Vlera e dokumentit</div>
            <div style={summaryValueStyle}>{formatMoney(documentTotalBySelectedTier)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>Bazuar ne cmimet e zgjedhura per secilin produkt</div>
          </div>
          <div style={paymentSummaryCardStyle(summaryCardStyle, paymentVisualTone)}>
            <div style={summaryLabelStyle}>Statusi i pageses</div>
            <div style={paymentStatusChipStyle(paymentVisualTone)}>{doc.paymentStatus}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              Te paguara: {formatMoney(doc.paidTotal)} • Mbeten: {formatMoney(doc.balance)}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel-soft)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Historia e pagesave</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Pagesat e lidhura direkt me kete dokument.
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {doc.paymentHistory?.length ?? 0} pagesa
            </div>
          </div>

          {doc.paymentHistory?.length ? (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {doc.paymentHistory.map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background: "rgba(255,255,255,0.03)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>{formatMoney(payment.amount)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatDateOnly(payment.paymentDate)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted-strong)" }}>
                    {payment.reference ? <span>Referenca: <b>{payment.reference}</b></span> : null}
                    {payment.note ? <span>Shenim: <b>{payment.note}</b></span> : null}
                    {!payment.reference && !payment.note ? <span>Pa reference ose shenim.</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted-strong)" }}>
              Ende nuk ka pagesa te lidhura me kete dokument.
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel-soft)",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 6 }}>Shportat nga ku do te dale malli</div>
          <div style={{ fontSize: 14 }}>
            {usedBins.length > 0
              ? `${usedBins.slice(0, 3).join(", ")}${usedBins.length > 3 ? ` dhe ${usedBins.length - 3} te tjera` : ""}`
              : "Ende nuk ka shporta te zgjedhura."}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: summaryStatusInfo?.border ?? "1px solid var(--border)",
            background: summaryStatusInfo?.background ?? "var(--panel-soft)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Kontroll i shpejte para konfirmimit</div>
          <div style={{ fontSize: 14 }}>
            {summaryStatusInfo?.message}
          </div>
        </div>
      </SurfaceCard>

    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

type ActionButtonTone = "neutral" | "primary" | "success" | "danger" | "dangerStrong" | "pdf" | "excel";

const actionButtonTheme: Record<ActionButtonTone, { base: React.CSSProperties; hover: React.CSSProperties }> = {
  neutral: {
    base: { border: "1px solid var(--border)", background: "var(--panel-soft)", color: "var(--text)" },
    hover: { background: "color-mix(in srgb, var(--panel-soft) 70%, white 30%)", border: "1px solid rgba(148, 163, 184, 0.35)" },
  },
  primary: {
    base: { border: "1px solid color-mix(in srgb, var(--accent) 58%, var(--border))", background: "color-mix(in srgb, var(--accent) 24%, var(--panel-soft))", color: "var(--accent-strong)" },
    hover: { background: "color-mix(in srgb, var(--accent) 34%, var(--panel-soft))", border: "1px solid color-mix(in srgb, var(--accent) 72%, var(--border))" },
  },
  success: {
    base: { border: "1px solid color-mix(in srgb, var(--success) 58%, var(--border))", background: "color-mix(in srgb, var(--success) 24%, var(--panel-soft))", color: "var(--success)" },
    hover: { background: "color-mix(in srgb, var(--success) 34%, var(--panel-soft))", border: "1px solid color-mix(in srgb, var(--success) 72%, var(--border))" },
  },
  danger: {
    base: { border: "1px solid color-mix(in srgb, var(--danger) 58%, var(--border))", background: "color-mix(in srgb, var(--danger) 24%, var(--panel-soft))", color: "var(--danger)" },
    hover: { background: "color-mix(in srgb, var(--danger) 34%, var(--panel-soft))", border: "1px solid color-mix(in srgb, var(--danger) 72%, var(--border))" },
  },
  dangerStrong: {
    base: { border: "1px solid color-mix(in srgb, var(--danger) 72%, black)", background: "var(--danger)", color: "#fff7f7" },
    hover: { background: "color-mix(in srgb, var(--danger) 84%, white)", border: "1px solid color-mix(in srgb, var(--danger) 62%, black)" },
  },
  pdf: {
    base: { border: "1px solid color-mix(in srgb, var(--danger) 32%, var(--border))", background: "color-mix(in srgb, var(--danger) 12%, var(--panel-soft))", color: "var(--danger)" },
    hover: { background: "color-mix(in srgb, var(--danger) 20%, var(--panel-soft))", border: "1px solid color-mix(in srgb, var(--danger) 46%, var(--border))" },
  },
  excel: {
    base: { border: "1px solid color-mix(in srgb, var(--success) 32%, var(--border))", background: "color-mix(in srgb, var(--success) 12%, var(--panel-soft))", color: "var(--success)" },
    hover: { background: "color-mix(in srgb, var(--success) 20%, var(--panel-soft))", border: "1px solid color-mix(in srgb, var(--success) 46%, var(--border))" },
  },
};

function ActionButton({
  tone = "neutral",
  style,
  disabled,
  children,
  ...props
}: {
  tone?: ActionButtonTone;
  style?: React.CSSProperties;
  disabled?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hovered, setHovered] = useState(false);
  const theme = actionButtonTheme[tone];

  return (
    <button
      {...props}
      disabled={disabled}
      onMouseEnter={(e) => {
        setHovered(true);
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        props.onMouseLeave?.(e);
      }}
      style={{
        ...theme.base,
        ...(hovered && !disabled ? theme.hover : null),
        opacity: disabled ? 0.72 : 1,
        filter: disabled ? "saturate(0.8)" : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 1.5H9.5L12.5 4.5V13.5C12.5 14.05 12.05 14.5 11.5 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V2.5C3.5 1.95 3.95 1.5 4.5 1.5H4Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.25 8.25H10.75" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.25 10.5H9.25" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.5 3.5L2.5 8L6.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8H13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PickListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.25 4.5H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.25 8H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.25 11.5H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2.75 4.5L3.35 5.1L4.45 3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.75 8L3.35 8.6L4.45 7.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.75 11.5L3.35 12.1L4.45 10.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfirmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 8H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 4.5H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 2.75H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5 4.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 4.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 4.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 4.5V12.5C4.5 13.05 4.95 13.5 5.5 13.5H10.5C11.05 13.5 11.5 13.05 11.5 12.5V4.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ExcelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6H14" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 2V14" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 6V14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.8 6.5H13.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 9.8H7.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const summaryCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  marginBottom: 6,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1,
};

const warningChipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(245, 158, 11, 0.14)",
  border: "1px solid rgba(245, 158, 11, 0.24)",
  color: "inherit",
  fontWeight: 700,
};

const qtyAdjustBtnStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  fontWeight: 700,
  minWidth: 40,
  justifyContent: "center",
};

const saveQtyBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(96, 165, 250, 0.28)",
  background: "rgba(96, 165, 250, 0.12)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
};

const priceChipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 999,
  appearance: "none",
  background: "rgba(148, 163, 184, 0.12)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  color: "var(--text)",
  fontFamily: "inherit",
  lineHeight: 1.2,
};

const metaChipStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(96, 165, 250, 0.10)",
  border: "1px solid rgba(96, 165, 250, 0.18)",
};

const mutedMetaChipStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(148, 163, 184, 0.08)",
  border: "1px dashed rgba(148, 163, 184, 0.22)",
  color: "var(--muted)",
};

const metaChipExpiryStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(251, 191, 36, 0.10)",
  border: "1px solid rgba(251, 191, 36, 0.18)",
};

const metaChipExpiredStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.22)",
};

const priceChipRetailStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(96, 165, 250, 0.12)",
  border: "1px solid rgba(96, 165, 250, 0.18)",
};

const priceChipWholesaleStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(34, 197, 94, 0.12)",
  border: "1px solid rgba(34, 197, 94, 0.18)",
};

const priceChipVipStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(251, 191, 36, 0.12)",
  border: "1px solid rgba(251, 191, 36, 0.18)",
};

const lineTotalChipStyle: React.CSSProperties = {
  ...priceChipStyle,
  background: "rgba(168, 85, 247, 0.12)",
  border: "1px solid rgba(168, 85, 247, 0.18)",
};

const qtyInputStyle: React.CSSProperties = {
  width: 84,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--text)",
  fontWeight: 700,
  textAlign: "center",
};
