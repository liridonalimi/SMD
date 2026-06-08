import { http } from "./http";
import type { ProductHistoryDto, ProductRecordDto, UpsertProductDto } from "../types/products";
import type { ImportResult } from "../types/import";

export type ProductHitDto = {
    id: string;
    sku: string;
    name: string;
    barcode?: string | null;
    description?: string | null;
    unitOfMeasure?: string | null;
    minStockLevel?: number;
    purchasePrice?: number;
    retailPrice?: number;
    wholesalePrice?: number;
    vipPrice?: number;
    isActive: boolean;
};

export function searchProducts(q: string, signal?: AbortSignal) {
    return http<ProductHitDto[]>(
        `/api/products?q=${encodeURIComponent(q)}`,
        { signal }
    );
}

export function listProducts(q?: string, signal?: AbortSignal) {
    const suffix = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return http<ProductRecordDto[]>(`/api/products${suffix}`, { signal });
}

export function getProductHistory(id: string, signal?: AbortSignal) {
    return http<ProductHistoryDto>(`/api/products/${id}/history`, { signal });
}

export function createProduct(body: UpsertProductDto, signal?: AbortSignal) {
    return http<{ id: string }>("/api/products", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
    });
}

export function updateProduct(id: string, body: UpsertProductDto, signal?: AbortSignal) {
    return http<void>(`/api/products/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        signal,
    });
}

export function getNextProductBarcode(signal?: AbortSignal) {
    return http<{ barcode: string }>("/api/products/barcode/next", { signal });
}

export function productBarcodeLabelsPdfUrl(id: string, copies = 18) {
    return `/api/products/${id}/barcode-labels.pdf?copies=${copies}`;
}

export function productQrLabelsPdfUrl(id: string, copies = 18) {
    return `/api/products/${id}/qr-labels.pdf?copies=${copies}`;
}

export function importProducts(file: File, updateExisting: boolean, signal?: AbortSignal) {
    const body = new FormData();
    body.append("file", file);
    return http<ImportResult>(`/api/import/products?updateExisting=${updateExisting}`, {
        method: "POST",
        body,
        signal,
    });
}
