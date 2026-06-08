export function normalizeScannerValue(value: string) {
    return value
        .replace(/[\r\n\t]+/g, ";")
        .replace(/^[\s;|,]+|[\s;|,]+$/g, "")
        .trim();
}

function cleanScanToken(value: string) {
    return value
        .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
        .trim();
}

function extractJsonStringValues(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];

    try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const values: string[] = [];
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string" && value.trim() !== "") {
                values.push(key.trim());
                values.push(value.trim());
            }
        }
        return values;
    } catch {
        return [];
    }
}

function extractKeyValuePairs(raw: string) {
    const pairs: Array<{ key: string; value: string }> = [];

    for (const part of raw.split(/[\n\r;|,]+/)) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;

        const equalIndex = trimmedPart.indexOf("=");
        const colonIndex = trimmedPart.indexOf(":");
        const splitIndex =
            equalIndex >= 0 && colonIndex >= 0 ? Math.min(equalIndex, colonIndex) : Math.max(equalIndex, colonIndex);

        if (splitIndex > 0 && splitIndex < trimmedPart.length - 1) {
            const key = cleanScanToken(trimmedPart.slice(0, splitIndex));
            const value = cleanScanToken(trimmedPart.slice(splitIndex + 1));
            if (key && value) pairs.push({ key, value });
        }
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === "string" && value.trim() !== "") {
                    pairs.push({ key: cleanScanToken(key), value: cleanScanToken(value) });
                }
            }
        } catch {
            // Ignore malformed JSON and continue with delimiter-based tokens.
        }
    }

    return pairs;
}

export function getScanFieldValue(value: string, ...fieldNames: string[]) {
    const pairs = extractKeyValuePairs(value);
    const preferred = new Set(fieldNames.map((fieldName) => fieldName.toLowerCase()));
    return pairs.find((pair) => preferred.has(pair.key.toLowerCase()))?.value ?? "";
}

export type ScanPayloadType = "product" | "bin" | "location" | "series" | "unknown";

export type ParsedScanPayload = {
    raw: string;
    normalized: string;
    type: ScanPayloadType;
    fields: Record<string, string>;
    lookupTerm: string;
};

export function parseScanPayload(value: string): ParsedScanPayload {
    const normalized = normalizeScannerValue(value);
    const fields: Record<string, string> = {};

    for (const pair of extractKeyValuePairs(value)) {
        fields[pair.key.toLowerCase()] = pair.value;
    }

    const explicitType = fields.type?.toLowerCase();
    const type: ScanPayloadType =
        explicitType === "product" || explicitType === "bin" || explicitType === "location" || explicitType === "series"
            ? explicitType
            : fields.bin
                ? "bin"
                : fields.sku || fields.barcode || fields.barkod
                    ? "product"
                    : fields.lot || fields.batch || fields.exp
                        ? "series"
                        : "unknown";

    return {
        raw: value,
        normalized,
        type,
        fields,
        lookupTerm: getPreferredScanLookupTerm(value),
    };
}

export function extractScanTokens(value: string) {
    const normalized = normalizeScannerValue(value);
    const raw = value.trim();
    if (!normalized && !raw) return [];

    const seen = new Set<string>();
    const tokens: string[] = [];
    const push = (raw: string) => {
        const token = cleanScanToken(normalizeScannerValue(raw));
        if (!token) return;
        const key = token.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        tokens.push(token);
    };

    push(normalized);

    for (const part of raw.split(/[\n\r;|,]+/)) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;

        push(trimmedPart);

        const equalIndex = trimmedPart.indexOf("=");
        const colonIndex = trimmedPart.indexOf(":");
        const splitIndex =
            equalIndex >= 0 && colonIndex >= 0 ? Math.min(equalIndex, colonIndex) : Math.max(equalIndex, colonIndex);

        if (splitIndex > 0 && splitIndex < trimmedPart.length - 1) {
            const key = trimmedPart.slice(0, splitIndex).trim();
            const valuePart = trimmedPart.slice(splitIndex + 1).trim();
            push(key);
            push(valuePart);
        }
    }

    for (const jsonValue of extractJsonStringValues(raw)) {
        push(jsonValue);
    }

    return tokens;
}

export function getPreferredScanLookupTerm(value: string) {
    const tokens = extractScanTokens(value);
    if (tokens.length === 0) return "";

    const pairs = extractKeyValuePairs(value);
    const preferredKeyOrder = ["barcode", "barkod", "sku", "bin", "code", "product", "id"];
    for (const preferredKey of preferredKeyOrder) {
        const match = pairs.find((pair) => pair.key.toLowerCase() === preferredKey);
        if (match?.value) return match.value;
    }

    const keyWords = new Set([
        "sku",
        "barcode",
        "barkod",
        "code",
        "bin",
        "rack",
        "zone",
        "wh",
        "warehouse",
        "type",
        "name",
        "ctx",
        "product",
        "id",
        "qr",
        "smd",
    ]);

    const scoreToken = (token: string) => {
        const lower = token.toLowerCase();
        if (keyWords.has(lower)) return -1000;
        if (/^\d{8,14}$/.test(token)) return 120 + token.length; // barcode-like
        if (/^[a-z0-9][a-z0-9\-_.\/]{0,}$/i.test(token)) return 100 + token.length; // sku/bin-like
        if (/^[\p{L}\p{N}\-_.\/ ]+$/u.test(token)) return 60 + token.length;
        return token.length;
    };

    return [...tokens].sort((a, b) => scoreToken(b) - scoreToken(a))[0] ?? tokens[0];
}

export function isExactScanMatch(scannedValue: string, ...candidates: Array<string | null | undefined>) {
    const scanTokens = extractScanTokens(scannedValue).map((x) => x.toLowerCase());
    if (scanTokens.length === 0) return false;

    return candidates.some((candidate) => {
        const normalizedCandidate = normalizeScannerValue(candidate ?? "").toLowerCase();
        if (!normalizedCandidate) return false;
        return scanTokens.includes(normalizedCandidate);
    });
}
