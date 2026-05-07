import type { DocumentStatus } from "./documents";

export type ListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: DocumentStatus;
  from?: string;
  to?: string;
  emptyOnly?: boolean;
  attentionOnly?: boolean;
  paymentStatus?: string;
  sort?: string;
};
