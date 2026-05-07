// src/shared/listQuery.ts
import type { ListParams } from "../types/list";

export function normalizeSort(sort?: string) {
    return (sort ?? "createdat_desc").trim().toLowerCase().replaceAll(" ", "");
}

export function toListQuery(params: ListParams) {
    const qs = new URLSearchParams();

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;

    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));

    if (params.q) qs.set("q", params.q);

    if (params.status !== undefined) qs.set("status", String(params.status));
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.emptyOnly) qs.set("emptyOnly", "true");
    if (params.attentionOnly) qs.set("attentionOnly", "true");
    if (params.paymentStatus) qs.set("paymentStatus", params.paymentStatus);

    qs.set("sort", normalizeSort(params.sort));

    return qs.toString();
}
