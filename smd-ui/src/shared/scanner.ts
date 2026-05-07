export function normalizeScannerValue(value: string) {
    return value.replace(/[\r\n\t]+/g, "").trim();
}

export function isExactScanMatch(scannedValue: string, ...candidates: Array<string | null | undefined>) {
    const normalizedScan = normalizeScannerValue(scannedValue).toLowerCase();
    if (!normalizedScan) return false;

    return candidates.some((candidate) => normalizeScannerValue(candidate ?? "").toLowerCase() === normalizedScan);
}
