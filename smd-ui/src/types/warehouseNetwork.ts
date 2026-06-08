export type WarehouseNetworkNode = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  cutoffTime: string | null;
  dailyOrderCapacity: number | null;
  isActive: boolean;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockRows: number;
  capacityUsedToday: number;
  capacityPercent: number | null;
  riskScore: number;
};

export type WarehouseNetworkLink = {
  fromWarehouseId: string;
  toWarehouseId: string;
  transferCount: number;
  quantityTotal: number;
};

export type WarehouseNetworkOverviewResponse = {
  days: number;
  generatedAtUtc: string;
  warehouses: WarehouseNetworkNode[];
  links: WarehouseNetworkLink[];
  recommendations: WarehouseRouteRecommendation[];
};

export type WarehouseRouteRecommendation = {
  targetWarehouseId: string;
  targetWarehouseCode: string;
  targetWarehouseName: string;
  suggestedSources: WarehouseSuggestedSource[];
};

export type WarehouseSuggestedSource = {
  sourceWarehouseId: string;
  sourceWarehouseCode: string;
  sourceWarehouseName: string;
  distanceKm: number | null;
  availableStock: number;
  capacityPercent: number | null;
  status: "OK" | "BLOCKED_CUTOFF" | "BLOCKED_CAPACITY";
};
