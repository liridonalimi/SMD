import { http } from "./http";
import type { WarehouseNetworkOverviewResponse } from "../types/warehouseNetwork";

export function getWarehouseNetworkOverview(days = 30) {
  const safeDays = Math.min(180, Math.max(1, Math.floor(days)));
  return http<WarehouseNetworkOverviewResponse>(`/api/warehouses/network-overview?days=${safeDays}`);
}

