import { http } from "./http";
import type { DashboardSummary } from "../types/dashboard";

export function getDashboardSummary(signal?: AbortSignal) {
  return http<DashboardSummary>("/api/dashboard/summary", { signal });
}
