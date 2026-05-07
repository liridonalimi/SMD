import { http } from "./http";
import type { PartnerLookupDto, PartnerRecordDto, UpsertPartnerDto } from "../types/partners";
import type { ImportResult } from "../types/import";

export function listCustomers(q?: string, signal?: AbortSignal) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return http<PartnerRecordDto[]>(`/api/customers${qs}`, { signal });
}

export function listCustomersLookup(q?: string, signal?: AbortSignal) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return http<PartnerLookupDto[]>(`/api/customers/lookup${qs}`, { signal });
}

export function createCustomer(body: UpsertPartnerDto, signal?: AbortSignal) {
  return http<{ id: string }>("/api/customers", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function updateCustomer(id: string, body: UpsertPartnerDto, signal?: AbortSignal) {
  return http(`/api/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    signal,
  });
}

export function listSuppliers(q?: string, signal?: AbortSignal) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return http<PartnerRecordDto[]>(`/api/suppliers${qs}`, { signal });
}

export function listSuppliersLookup(q?: string, signal?: AbortSignal) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return http<PartnerLookupDto[]>(`/api/suppliers/lookup${qs}`, { signal });
}

export function createSupplier(body: UpsertPartnerDto, signal?: AbortSignal) {
  return http<{ id: string }>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function updateSupplier(id: string, body: UpsertPartnerDto, signal?: AbortSignal) {
  return http(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    signal,
  });
}

export function importCustomers(file: File, updateExisting: boolean, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  return http<ImportResult>(`/api/import/customers?updateExisting=${updateExisting}`, {
    method: "POST",
    body,
    signal,
  });
}

export function importSuppliers(file: File, updateExisting: boolean, signal?: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  return http<ImportResult>(`/api/import/suppliers?updateExisting=${updateExisting}`, {
    method: "POST",
    body,
    signal,
  });
}
