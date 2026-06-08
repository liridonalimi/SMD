import { http } from "./http";
import type { AuditLogDto, AuditActionsResponse } from "../types/audit";

export type AuditListParams = {
  q?: string;          // search free text
  action?: string;     // filter action
  page?: number;
  pageSize?: number;
  sort?: string;       // createdAt_desc
};

//new
function normalizeSort(sort?: string) {
    return (sort ?? "createdat_desc").trim().toLowerCase().replaceAll(" ", "");
}

function toQuery(params: AuditListParams) {
    const qs = new URLSearchParams();

    //new
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(params.pageSize ?? 20));

    if (params.q) qs.set("q", params.q);
    if (params.action) qs.set("action", params.action);

    //new
    qs.set("sort", normalizeSort(params.sort));

    return qs.toString();
}

// Nese API jep paged response
export type PagedAuditResponse = {
  items: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
};

export function listAuditLogs(params: AuditListParams, signal?: AbortSignal) {
  const qs = toQuery(params);
  return http<PagedAuditResponse>(`/api/audit-logs?${qs}`, { signal });
}

export function listAuditActions(signal?: AbortSignal) {
  return http<AuditActionsResponse>(`/api/audit-logs/actions`, { signal });
}

