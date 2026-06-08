import { useEffect, useRef } from "react";

type ScannerCaptureOptions = {
  enabled: boolean;
  onScan: (value: string) => void | Promise<void>;
  minLength?: number;
  maxInterKeyDelayMs?: number;
  suffixKeys?: string[];
};

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function useScannerCapture({
  enabled,
  onScan,
  minLength = 4,
  maxInterKeyDelayMs = 55,
  suffixKeys = ["Enter", "Tab"],
}: ScannerCaptureOptions) {
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = "";
      return;
    }

    function resetBuffer() {
      bufferRef.current = "";
      lastKeyAtRef.current = 0;
    }

    function isSuffixEvent(event: KeyboardEvent) {
      return suffixKeys.includes(event.key) || suffixKeys.includes(event.code);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : null;

      if (targetElement?.dataset.smdScannerInput === "product") {
        resetBuffer();
        return;
      }

      const now = window.performance.now();
      const elapsed = now - lastKeyAtRef.current;
      if (elapsed > maxInterKeyDelayMs) {
        bufferRef.current = "";
      }

      if (isSuffixEvent(event)) {
        const value = bufferRef.current.trim();
        resetBuffer();
        if (value.length >= minLength) {
          event.preventDefault();
          void onScanRef.current(value);
        }
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      bufferRef.current += event.key;
      lastKeyAtRef.current = now;

      // Scanner input is very fast. Prevent stray barcode characters from being typed
      // into quantity/date fields when the operator scans while focus is elsewhere.
      if (isEditableElement(target) && bufferRef.current.length >= 2 && elapsed <= maxInterKeyDelayMs) {
        event.preventDefault();
      }
    }

    function handlePaste(event: ClipboardEvent) {
      const pasted = event.clipboardData?.getData("text")?.trim() ?? "";
      if (pasted.length < minLength) return;

      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : null;
      if (targetElement?.dataset.smdScannerInput === "product") return;

      resetBuffer();
      event.preventDefault();
      void onScanRef.current(pasted);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("paste", handlePaste, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("paste", handlePaste, true);
    };
  }, [enabled, maxInterKeyDelayMs, minLength, suffixKeys]);
}
