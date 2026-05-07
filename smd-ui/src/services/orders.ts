import { http } from "./http";
import type { OrderListItem, PurchaseOrderDetails, SalesOrderDetails } from "../types/orders";

type CreatePurchaseOrder = {
  supplierId?: string | null;
  reference?: string | null;
  note?: string | null;
  expectedDate?: string | null;
};

type CreateSalesOrder = {
  customerId?: string | null;
  priceTier?: number | null;
  reference?: string | null;
  note?: string | null;
  requestedDate?: string | null;
};

export function listPurchaseOrders(q?: string, signal?: AbortSignal) {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return http<OrderListItem[]>(`/api/purchase-orders${qs}`, { signal });
}

export function getPurchaseOrder(id: string, signal?: AbortSignal) {
  return http<PurchaseOrderDetails>(`/api/purchase-orders/${id}`, { signal });
}

export function createPurchaseOrder(body: CreatePurchaseOrder) {
  return http<{ id: string; orderNo: string }>("/api/purchase-orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addPurchaseOrderLine(id: string, body: { productId: string; quantity: number; unitPrice: number }) {
  return http(`/api/purchase-orders/${id}/lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deletePurchaseOrderLine(id: string, lineId: string) {
  return http(`/api/purchase-orders/${id}/lines/${lineId}`, { method: "DELETE" });
}

export function confirmPurchaseOrder(id: string) {
  return http(`/api/purchase-orders/${id}/confirm`, { method: "POST" });
}

export function cancelPurchaseOrder(id: string) {
  return http(`/api/purchase-orders/${id}/cancel`, { method: "POST" });
}

export function createInboundFromPurchaseOrder(id: string) {
  return http<{ id: string; documentNo: string }>(`/api/purchase-orders/${id}/create-inbound`, { method: "POST" });
}

export function listSalesOrders(q?: string, signal?: AbortSignal) {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return http<OrderListItem[]>(`/api/sales-orders${qs}`, { signal });
}

export function getSalesOrder(id: string, signal?: AbortSignal) {
  return http<SalesOrderDetails>(`/api/sales-orders/${id}`, { signal });
}

export function createSalesOrder(body: CreateSalesOrder) {
  return http<{ id: string; orderNo: string }>("/api/sales-orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addSalesOrderLine(id: string, body: { inventoryId: string; quantity: number; priceTier?: number | null }) {
  return http(`/api/sales-orders/${id}/lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteSalesOrderLine(id: string, lineId: string) {
  return http(`/api/sales-orders/${id}/lines/${lineId}`, { method: "DELETE" });
}

export function confirmSalesOrder(id: string) {
  return http(`/api/sales-orders/${id}/confirm`, { method: "POST" });
}

export function cancelSalesOrder(id: string) {
  return http(`/api/sales-orders/${id}/cancel`, { method: "POST" });
}

export function createOutboundFromSalesOrder(id: string) {
  return http<{ id: string; documentNo: string }>(`/api/sales-orders/${id}/create-outbound`, { method: "POST" });
}
