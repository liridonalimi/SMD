import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { getWarehouseNetworkOverview } from "../../services/warehouseNetwork";
import { listBins, listRacks, listZones, type LookupDto } from "../../services/lookups";
import type {
  WarehouseNetworkLink,
  WarehouseNetworkNode,
  WarehouseRouteRecommendation,
  WarehouseSuggestedSource,
} from "../../types/warehouseNetwork";

const MAP_W = 1200;
const MAP_H = 560;

function fmt(v: number) {
  const safe = Number.isFinite(v) ? v : 0;
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 2 }).format(safe);
}

function riskColor(score: number) {
  const safe = Number.isFinite(score) ? score : 0;
  if (safe >= 70) return "#ff8b8b";
  if (safe >= 35) return "#ffd47a";
  return "#6ee7c8";
}

function buildGeoPositions(nodes: WarehouseNetworkNode[]) {
  const geoNodes = nodes.filter((n) => n.latitude != null && n.longitude != null);
  if (geoNodes.length === 0) return new Map<string, { x: number; y: number }>();

  const minLat = Math.min(...geoNodes.map((n) => n.latitude as number));
  const maxLat = Math.max(...geoNodes.map((n) => n.latitude as number));
  const minLon = Math.min(...geoNodes.map((n) => n.longitude as number));
  const maxLon = Math.max(...geoNodes.map((n) => n.longitude as number));
  const latRange = Math.max(0.0001, maxLat - minLat);
  const lonRange = Math.max(0.0001, maxLon - minLon);
  const padX = 80;
  const padY = 70;

  const out = new Map<string, { x: number; y: number }>();

  for (const n of nodes) {
    if (n.latitude == null || n.longitude == null) continue;
    const nx = (n.longitude - minLon) / lonRange;
    const ny = 1 - (n.latitude - minLat) / latRange;
    out.set(n.id, {
      x: padX + nx * (MAP_W - padX * 2),
      y: padY + ny * (MAP_H - padY * 2),
    });
  }

  return out;
}

function buildCityCenters(nodes: WarehouseNetworkNode[], geo: Map<string, { x: number; y: number }>) {
  const agg = new Map<string, { city: string; x: number; y: number; c: number }>();
  for (const n of nodes) {
    const p = geo.get(n.id);
    if (!p) continue;
    const city = (n.city ?? "Pa qytet").trim();
    const k = city.toLowerCase();
    const cur = agg.get(k);
    if (cur) {
      cur.x += p.x;
      cur.y += p.y;
      cur.c += 1;
    } else {
      agg.set(k, { city, x: p.x, y: p.y, c: 1 });
    }
  }
  const out = new Map<string, { city: string; x: number; y: number }>();
  agg.forEach((v, k) => out.set(k, { city: v.city, x: v.x / v.c, y: v.y / v.c }));
  return out;
}

function jitterFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = (Math.abs(h) % 360) * (Math.PI / 180);
  const r = 16 + (Math.abs(h) % 22);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export default function WarehouseNetworkPage() {
  const [searchParams] = useSearchParams();
  const cyContainerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const pulseRef = useRef<number | null>(null);

  const [days, setDays] = useState(30);
  const [nodes, setNodes] = useState<WarehouseNetworkNode[]>([]);
  const [links, setLinks] = useState<WarehouseNetworkLink[]>([]);
  const [recommendations, setRecommendations] = useState<WarehouseRouteRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [visibleStatus, setVisibleStatus] = useState<"ALL" | WarehouseSuggestedSource["status"]>("ALL");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: WarehouseNetworkNode; suggestionCount: number } | null>(null);
  const [clusterMode, setClusterMode] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"inventory" | "links" | "suggestions" | "structure">("inventory");
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [zonesForWarehouse, setZonesForWarehouse] = useState<LookupDto[]>([]);
  const [racksByZone, setRacksByZone] = useState<Record<string, LookupDto[]>>({});
  const [binsByRack, setBinsByRack] = useState<Record<string, LookupDto[]>>({});
  const [selectedStructureNodeId, setSelectedStructureNodeId] = useState<string | null>(null);
  const deepLinkWarehouseId = searchParams.get("warehouseId");
  const deepLinkDrawer = searchParams.get("drawer");
  const deepLinkTab = searchParams.get("tab");

  const structureDeepLink = (warehouseId: string) =>
    `/warehouse-network?warehouseId=${encodeURIComponent(warehouseId)}&drawer=1&tab=structure`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getWarehouseNetworkOverview(days);
      setNodes(res.warehouses);
      setLinks(res.links);
      setRecommendations(res.recommendations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nuk u lexuan te dhenat e rrjetit te depove.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [days]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const recommendationByTarget = useMemo(
    () => new Map(recommendations.map((r) => [r.targetWarehouseId, r])),
    [recommendations]
  );

  useEffect(() => {
    if (!deepLinkWarehouseId || nodes.length === 0) return;
    if (!nodeById.has(deepLinkWarehouseId)) return;

    setSelectedWarehouseId(deepLinkWarehouseId);
    if (deepLinkDrawer === "1") setIsDetailDrawerOpen(true);
    if (deepLinkTab === "inventory" || deepLinkTab === "links" || deepLinkTab === "suggestions" || deepLinkTab === "structure") {
      setDetailTab(deepLinkTab);
    }
  }, [deepLinkWarehouseId, deepLinkDrawer, deepLinkTab, nodeById, nodes.length]);

  const baseNetworkLinks = useMemo(() => {
    const pairMap = new Map<string, { source: string; target: string }>();
    const addPair = (a: string, b: string) => {
      if (!a || !b || a === b) return;
      const [left, right] = a < b ? [a, b] : [b, a];
      const key = `${left}|${right}`;
      if (!pairMap.has(key)) pairMap.set(key, { source: left, target: right });
    };

    links.forEach((l) => addPair(l.fromWarehouseId, l.toWarehouseId));
    recommendations.forEach((r) => {
      r.suggestedSources.forEach((s) => addPair(s.sourceWarehouseId, r.targetWarehouseId));
    });

    const pairs = Array.from(pairMap.values());
    return pairs.filter((p) =>
      selectedWarehouseId ? p.source === selectedWarehouseId || p.target === selectedWarehouseId : true
    );
  }, [links, recommendations, selectedWarehouseId]);

  const activeOverlayLinks = useMemo(() => {
    const transfer = links
      .filter((l) =>
        selectedWarehouseId ? l.fromWarehouseId === selectedWarehouseId || l.toWarehouseId === selectedWarehouseId : true
      )
      .map((l) => ({
        id: `transfer:${l.fromWarehouseId}->${l.toWarehouseId}`,
        source: l.fromWarehouseId,
        target: l.toWarehouseId,
        width: Math.max(1.8, Math.min(12, 1 + l.quantityTotal / 120)),
        edgeType: "transfer" as const,
        animated: 1,
      }));

    const suggested = recommendations.flatMap((r) =>
      r.suggestedSources
        .filter((s) => (visibleStatus === "ALL" ? true : s.status === visibleStatus))
        .map((s, idx) => ({
          id: `suggested:${s.sourceWarehouseId}->${r.targetWarehouseId}:${s.status}:${idx}`,
          source: s.sourceWarehouseId,
          target: r.targetWarehouseId,
          width: Math.max(1.6, Math.min(8, 1 + s.availableStock / 250)),
          edgeType:
            s.status === "OK"
              ? ("suggested_ok" as const)
              : s.status === "BLOCKED_CUTOFF"
                ? ("suggested_cutoff" as const)
                : ("suggested_capacity" as const),
          animated: 1,
        }))
    );

    const filteredSuggested = suggested.filter((l) =>
      selectedWarehouseId ? l.source === selectedWarehouseId || l.target === selectedWarehouseId : true
    );

    return [...transfer, ...filteredSuggested].slice(0, 180);
  }, [links, recommendations, selectedWarehouseId, visibleStatus]);

  const geoPositions = useMemo(() => buildGeoPositions(nodes), [nodes]);
  const cityCenters = useMemo(() => buildCityCenters(nodes, geoPositions), [nodes, geoPositions]);

  const riskScoreOf = (n: WarehouseNetworkNode) => {
    const raw = Number(n.riskScore);
    if (Number.isFinite(raw)) return raw;
    const low = Math.min((n.lowStockRows || 0) * 12, 60);
    const cap = Math.min((Number(n.capacityPercent) || 0) * 0.4, 40);
    return Math.min(100, low + cap);
  };

  const graphElements = useMemo(() => {
    const elements: ElementDefinition[] = [];

    for (const n of nodes) {
      const pos = geoPositions.get(n.id);
      const riskScore = riskScoreOf(n);
      elements.push({
        data: {
          id: n.id,
          label: n.code,
          city: n.city ?? "Pa qytet",
          riskScore,
          totalAvailable: n.totalAvailable,
          lowStockRows: n.lowStockRows,
          capacityPercent: n.capacityPercent ?? 0,
          color: riskColor(riskScore),
          type: "warehouse",
        },
        position: pos,
      });
    }

    cityCenters.forEach((c, k) => {
      elements.push({
        data: {
          id: `city-label:${k}`,
          label: c.city,
          type: "city-label",
        },
        position: { x: c.x + 18, y: c.y - 20 },
      });
    });

    for (const l of baseNetworkLinks) {
      elements.push({
        data: {
          id: `base:${l.source}->${l.target}`,
          source: l.source,
          target: l.target,
          width: 1.5,
          type: "base",
          animated: 0,
        },
      });
    }

    for (const l of activeOverlayLinks) {
      elements.push({
        data: {
          id: l.id,
          source: l.source,
          target: l.target,
          width: l.width,
          type: l.edgeType,
          animated: l.animated,
        },
      });
    }

    return elements;
  }, [nodes, baseNetworkLinks, activeOverlayLinks, geoPositions, cityCenters]);

  useEffect(() => {
    if (!cyContainerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const cy = cytoscape({
      container: cyContainerRef.current,
      elements: graphElements,
      layout: {
        name: "preset",
        fit: true,
        padding: 40,
      },
      style: [
        {
          selector: 'node[type="warehouse"]',
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            color: "#e8f0ff",
            "font-size": 13,
            "text-valign": "bottom",
            "text-margin-y": 10,
            width: "mapData(riskScore, 0, 100, 22, 36)",
            height: "mapData(riskScore, 0, 100, 22, 36)",
            "border-color": "#ffffff",
            "border-width": 0.7,
          },
        },
        {
          selector: 'node[type="city-label"]',
          style: {
            label: "data(label)",
            "background-opacity": 0,
            color: "#9fd3ff",
            "font-size": 11,
            "text-valign": "center",
            "text-halign": "left",
            width: 2,
            height: 2,
            events: "no",
          },
        },
        {
          selector: 'edge[type="base"]',
          style: {
            width: "data(width)",
            "line-color": "rgba(125,226,255,0.34)",
            "target-arrow-color": "rgba(125,226,255,0.62)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.9,
            "line-style": "solid",
            opacity: 0.56,
          },
        },
        {
          selector: 'edge[type="transfer"]',
          style: {
            width: "data(width)",
            "line-color": "rgba(125,226,255,0.72)",
            "target-arrow-color": "rgba(125,226,255,0.95)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "line-style": "solid",
            "arrow-scale": 1.05,
            opacity: 0.9,
          },
        },
        {
          selector: 'edge[type="suggested_ok"]',
          style: {
            width: "data(width)",
            "line-color": "rgba(255,214,122,0.72)",
            "target-arrow-color": "rgba(255,214,122,0.95)",
            "target-arrow-shape": "triangle",
            "line-style": "dashed",
            "line-dash-pattern": [6, 5],
            opacity: 0.92,
          },
        },
        {
          selector: 'edge[type="suggested_cutoff"]',
          style: {
            width: "data(width)",
            "line-color": "rgba(255,182,120,0.7)",
            "target-arrow-color": "rgba(255,182,120,0.94)",
            "target-arrow-shape": "triangle",
            "line-style": "dotted",
            "line-dash-pattern": [2, 6],
            opacity: 0.9,
          },
        },
        {
          selector: 'edge[type="suggested_capacity"]',
          style: {
            width: "data(width)",
            "line-color": "rgba(255,139,139,0.72)",
            "target-arrow-color": "rgba(255,139,139,0.94)",
            "target-arrow-shape": "triangle",
            "line-style": "dotted",
            "line-dash-pattern": [2, 7],
            opacity: 0.9,
          },
        },
        {
          selector: ".faded",
          style: {
            opacity: 0.18,
          },
        },
        {
          selector: ".focused",
          style: {
            "border-width": 3,
            "border-color": "#ffffff",
          },
        },
      ],
      wheelSensitivity: 0.22,
      textureOnViewport: true,
      motionBlur: true,
    });

    const cityCenterByKey = cityCenters;
    const basePositions = geoPositions;
    const applyClusterByZoom = () => {
      const zoom = cy.zoom();
      const shouldCluster = zoom < 0.72;
      setClusterMode(shouldCluster);

      cy.nodes('node[type="city-label"]').style("display", shouldCluster ? "element" : "none");

      cy.nodes('node[type="warehouse"]').forEach((n) => {
        const id = String(n.id());
        const w = nodeById.get(id);
        if (!w) return;
        const cityKey = (w.city ?? "Pa qytet").trim().toLowerCase();
        const center = cityCenterByKey.get(cityKey);
        const base = basePositions.get(id);
        if (!center || !base) return;
        if (shouldCluster) {
          const j = jitterFromId(id);
          n.animate({ position: { x: center.x + j.x, y: center.y + j.y } }, { duration: 220 });
        } else {
          n.animate({ position: { x: base.x, y: base.y } }, { duration: 220 });
        }
      });
    };

    cy.on("tap", 'node[type="warehouse"]', (evt) => {
      const id = String(evt.target.id());
      setSelectedWarehouseId((prev) => (prev === id ? null : id));
    });

    let lastTap = 0;
    cy.on("tap", 'node[type="warehouse"]', (evt) => {
      const now = Date.now();
      const id = String(evt.target.id());
      if (now - lastTap < 320) {
        const n = cy.getElementById(id);
        cy.animate({ fit: { eles: n.closedNeighborhood(), padding: 80 }, duration: 300 });
      }
      lastTap = now;
    });

    cy.on("mouseover", 'node[type="warehouse"]', (evt) => {
      const id = String(evt.target.id());
      const n = nodeById.get(id);
      if (!n) return;
      const rec = recommendationByTarget.get(id);
      const p = evt.renderedPosition || { x: 0, y: 0 };
      setTooltip({
        x: p.x + (cyContainerRef.current?.getBoundingClientRect().left ?? 0),
        y: p.y + (cyContainerRef.current?.getBoundingClientRect().top ?? 0),
        node: n,
        suggestionCount: rec ? rec.suggestedSources.length : 0,
      });
    });

    cy.on("mouseout", 'node[type="warehouse"]', () => setTooltip(null));
    cy.on("zoom", applyClusterByZoom);
    applyClusterByZoom();

    pulseRef.current = window.setInterval(() => {
      const edges = cy.edges('[animated = 1]');
      edges.forEach((e, i) => {
        const op = 0.45 + ((Date.now() / 500 + i) % 1) * 0.4;
        e.style("opacity", op.toFixed(2));
      });
    }, 220);

    cyRef.current = cy;
    return () => {
      if (pulseRef.current) window.clearInterval(pulseRef.current);
      pulseRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphElements, nodeById, recommendationByTarget, cityCenters, geoPositions]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes('node[type="warehouse"]').removeClass("focused faded");
    cy.edges().removeClass("faded");

    if (!selectedWarehouseId) return;

    const focus = cy.getElementById(selectedWarehouseId);
    if (!focus.nonempty()) return;
    focus.addClass("focused");

    const keep = focus.closedNeighborhood().union(focus);
    cy.elements().difference(keep).addClass("faded");
  }, [selectedWarehouseId, graphElements]);

  const totals = useMemo(() => {
    const active = nodes.filter((x) => x.isActive).length;
    const lowRisk = nodes.filter((x) => x.lowStockRows > 0).length;
    const qty = nodes.reduce((a, b) => a + b.totalAvailable, 0);
    return { active, lowRisk, qty };
  }, [nodes]);

  const selectedWarehouse = useMemo(
    () => (selectedWarehouseId ? nodeById.get(selectedWarehouseId) ?? null : null),
    [selectedWarehouseId, nodeById]
  );

  const selectedWarehouseStats = useMemo(() => {
    if (!selectedWarehouseId) return null;
    const outboundTransfers = links.filter((x) => x.fromWarehouseId === selectedWarehouseId);
    const inboundTransfers = links.filter((x) => x.toWarehouseId === selectedWarehouseId);
    const outboundQty = outboundTransfers.reduce((sum, item) => sum + item.quantityTotal, 0);
    const inboundQty = inboundTransfers.reduce((sum, item) => sum + item.quantityTotal, 0);
    const targetRecommendation = recommendations.find((x) => x.targetWarehouseId === selectedWarehouseId) ?? null;
    const sourceForCount = recommendations.reduce(
      (sum, item) => sum + item.suggestedSources.filter((s) => s.sourceWarehouseId === selectedWarehouseId).length,
      0
    );

    const neighborIds = new Set<string>();
    for (const link of baseNetworkLinks) {
      if (link.source === selectedWarehouseId) neighborIds.add(link.target);
      if (link.target === selectedWarehouseId) neighborIds.add(link.source);
    }
    const neighbors = Array.from(neighborIds)
      .map((id) => nodeById.get(id))
      .filter((x): x is WarehouseNetworkNode => Boolean(x))
      .slice(0, 8);

    return {
      outboundTransfers: outboundTransfers.length,
      inboundTransfers: inboundTransfers.length,
      outboundQty,
      inboundQty,
      targetRecommendation,
      sourceForCount,
      neighbors,
    };
  }, [selectedWarehouseId, links, recommendations, baseNetworkLinks, nodeById]);

  const structureSummary = useMemo(() => {
    const zoneCount = zonesForWarehouse.length;
    const rackCount = Object.values(racksByZone).reduce((sum, items) => sum + items.length, 0);
    const binCount = Object.values(binsByRack).reduce((sum, items) => sum + items.length, 0);
    return { zoneCount, rackCount, binCount };
  }, [zonesForWarehouse, racksByZone, binsByRack]);

  const structureGraph = useMemo(
    () => buildStructureGraph(zonesForWarehouse, racksByZone, binsByRack),
    [zonesForWarehouse, racksByZone, binsByRack]
  );

  const structureHighlight = useMemo(() => {
    if (!selectedStructureNodeId) {
      return { hasSelection: false, activeNodes: new Set<string>(), activeEdges: new Set<string>() };
    }

    const zoneRackIds = new Map<string, string[]>();
    const rackBinIds = new Map<string, string[]>();
    const rackZoneById = new Map<string, string>();
    const binRackById = new Map<string, string>();

    for (const zone of zonesForWarehouse) {
      const rackIds = (racksByZone[zone.id] ?? []).map((r) => r.id);
      zoneRackIds.set(zone.id, rackIds);
      for (const rack of racksByZone[zone.id] ?? []) {
        rackZoneById.set(rack.id, zone.id);
      }
    }
    for (const rackId of Object.keys(binsByRack)) {
      const binIds = (binsByRack[rackId] ?? []).map((b) => b.id);
      rackBinIds.set(rackId, binIds);
      for (const bin of binsByRack[rackId] ?? []) {
        binRackById.set(bin.id, rackId);
      }
    }

    const activeNodes = new Set<string>();
    const activeEdges = new Set<string>();
    const [kind, rawId] = selectedStructureNodeId.split(":");
    if (!rawId) return { hasSelection: false, activeNodes: new Set<string>(), activeEdges: new Set<string>() };

    if (kind === "zone") {
      activeNodes.add(`zone:${rawId}`);
      for (const rackId of zoneRackIds.get(rawId) ?? []) {
        activeNodes.add(`rack:${rackId}`);
        activeEdges.add(`zone:${rawId}|rack:${rackId}`);
        for (const binId of rackBinIds.get(rackId) ?? []) {
          activeNodes.add(`bin:${binId}`);
          activeEdges.add(`rack:${rackId}|bin:${binId}`);
        }
      }
    } else if (kind === "rack") {
      const zoneId = rackZoneById.get(rawId);
      if (zoneId) {
        activeNodes.add(`zone:${zoneId}`);
        activeEdges.add(`zone:${zoneId}|rack:${rawId}`);
      }
      activeNodes.add(`rack:${rawId}`);
      for (const binId of rackBinIds.get(rawId) ?? []) {
        activeNodes.add(`bin:${binId}`);
        activeEdges.add(`rack:${rawId}|bin:${binId}`);
      }
    } else if (kind === "bin") {
      const rackId = binRackById.get(rawId);
      if (rackId) {
        activeNodes.add(`rack:${rackId}`);
        activeEdges.add(`rack:${rackId}|bin:${rawId}`);
        const zoneId = rackZoneById.get(rackId);
        if (zoneId) {
          activeNodes.add(`zone:${zoneId}`);
          activeEdges.add(`zone:${zoneId}|rack:${rackId}`);
        }
      }
      activeNodes.add(`bin:${rawId}`);
    }

    return { hasSelection: true, activeNodes, activeEdges };
  }, [selectedStructureNodeId, zonesForWarehouse, racksByZone, binsByRack]);

  const structureListView = useMemo(() => {
    const [kind, rawId] = (selectedStructureNodeId ?? "").split(":");
    if (!rawId) {
      return {
        zones: zonesForWarehouse,
        modeLabel: null as string | null,
      };
    }

    if (kind === "zone") {
      const zone = zonesForWarehouse.find((z) => z.id === rawId);
      return {
        zones: zone ? [zone] : [],
        modeLabel: zone ? `Filtruar sipas zones: ${zone.code}` : "Filtrim zone",
      };
    }

    if (kind === "rack") {
      let ownerZone: LookupDto | undefined;
      for (const zone of zonesForWarehouse) {
        if ((racksByZone[zone.id] ?? []).some((r) => r.id === rawId)) {
          ownerZone = zone;
          break;
        }
      }
      return {
        zones: ownerZone ? [ownerZone] : [],
        modeLabel: ownerZone ? `Filtruar sipas raftit ne zone: ${ownerZone.code}` : "Filtrim rafti",
      };
    }

    if (kind === "bin") {
      let ownerZone: LookupDto | undefined;
      for (const zone of zonesForWarehouse) {
        const racks = racksByZone[zone.id] ?? [];
        const rackHasBin = racks.some((r) => (binsByRack[r.id] ?? []).some((b) => b.id === rawId));
        if (rackHasBin) {
          ownerZone = zone;
          break;
        }
      }
      return {
        zones: ownerZone ? [ownerZone] : [],
        modeLabel: ownerZone ? `Filtruar sipas shportes ne zone: ${ownerZone.code}` : "Filtrim shporte",
      };
    }

    return {
      zones: zonesForWarehouse,
      modeLabel: null as string | null,
    };
  }, [selectedStructureNodeId, zonesForWarehouse, racksByZone, binsByRack]);

  useEffect(() => {
    setSelectedStructureNodeId(null);
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!isDetailDrawerOpen || detailTab !== "structure" || !selectedWarehouseId) return;
    const ac = new AbortController();
    setStructureLoading(true);
    setStructureError(null);

    (async () => {
      try {
        const zones = await listZones(selectedWarehouseId, ac.signal);
        if (ac.signal.aborted) return;
        setZonesForWarehouse(zones);

        const racksEntries = await Promise.all(
          zones.map(async (z) => [z.id, await listRacks(z.id, ac.signal)] as const)
        );
        if (ac.signal.aborted) return;
        const nextRacksByZone: Record<string, LookupDto[]> = {};
        for (const [zoneId, racks] of racksEntries) nextRacksByZone[zoneId] = racks;
        setRacksByZone(nextRacksByZone);

        const allRacks = racksEntries.flatMap((x) => x[1]);
        const binsEntries = await Promise.all(
          allRacks.map(async (r) => [r.id, await listBins(r.id, ac.signal)] as const)
        );
        if (ac.signal.aborted) return;
        const nextBinsByRack: Record<string, LookupDto[]> = {};
        for (const [rackId, bins] of binsEntries) nextBinsByRack[rackId] = bins;
        setBinsByRack(nextBinsByRack);
      } catch (e) {
        if (!ac.signal.aborted) {
          setStructureError(e instanceof Error ? e.message : "Nuk u lexua struktura e depos.");
          setZonesForWarehouse([]);
          setRacksByZone({});
          setBinsByRack({});
        }
      } finally {
        if (!ac.signal.aborted) setStructureLoading(false);
      }
    })();

    return () => ac.abort();
  }, [isDetailDrawerOpen, detailTab, selectedWarehouseId]);

  function exportGraphPng() {
    const cy = cyRef.current;
    if (!cy) return;
    const png = cy.png({ full: true, scale: 2, bg: "#0a1326" });
    const a = document.createElement("a");
    a.href = png;
    a.download = `rrjeti-depove-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function exportGraphPdf() {
    const cy = cyRef.current;
    if (!cy) return;
    const jpeg = cy.jpg({ full: true, scale: 2, bg: "#0a1326", quality: 0.92 });
    const base64 = jpeg.split(",")[1] ?? "";
    const jpegBytes = base64ToBytes(base64);
    const pdfBytes = buildPdfFromJpeg(jpegBytes, 1400, 800, `Rrjeti i Depove - ${days} dite`);
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rrjeti-depove-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
        <h1 style={{ marginTop: 0 }}>Rrjeti i Depove</h1>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          Motor profesional i grafit me auto-layout, grupim sipas qytetit dhe performance te mire per rrjete te medha.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Periudha:
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 dite</option>
              <option value={30}>30 dite</option>
              <option value={90}>90 dite</option>
            </select>
          </label>
          <select value={visibleStatus} onChange={(e) => setVisibleStatus(e.target.value as "ALL" | WarehouseSuggestedSource["status"])}>
            <option value="ALL">Te gjitha lidhjet</option>
            <option value="OK">Vetem Ne rregull</option>
            <option value="BLOCKED_CUTOFF">Vetem Bllokuar nga cutoff</option>
            <option value="BLOCKED_CAPACITY">Vetem Bllokuar nga kapaciteti</option>
          </select>
          <button onClick={load}>Rifresko</button>
          <button onClick={() => setSelectedWarehouseId(null)}>Hiq fokusin</button>
          <button onClick={exportGraphPng}>Eksporto PNG</button>
          <button onClick={exportGraphPdf}>Eksporto PDF</button>
        </div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <Kpi label="Depo aktive" value={totals.active} />
          <Kpi label="Depo me alarm stok" value={totals.lowRisk} />
          <Kpi label="Stok i disponueshem" value={fmt(totals.qty)} />
          <Kpi label="Lidhje transferi" value={links.length} />
          <Kpi label="Lidhje ne graf" value={baseNetworkLinks.length} />
          <Kpi label="Lidhje aktive" value={activeOverlayLinks.length} />
          <Kpi label="Sugjerime burimi" value={recommendations.length} />
        </div>
      </section>

      {selectedWarehouse && selectedWarehouseStats ? (
        <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
          <h2 style={{ marginTop: 0 }}>Pamja e depos se zgjedhur</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {selectedWarehouse.code} - {selectedWarehouse.name}
              </div>
              <div style={{ color: "var(--muted)", marginTop: 4 }}>
                {selectedWarehouse.city ?? "Pa qytet"} • {selectedWarehouse.address ?? "Pa adrese"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
              <Kpi label="Ne dispozicion" value={fmt(selectedWarehouse.totalAvailable)} />
              <Kpi label="Ne depo (On-hand)" value={fmt(selectedWarehouse.totalOnHand)} />
              <Kpi label="E rezervuar" value={fmt(selectedWarehouse.totalReserved)} />
              <Kpi label="Rreshta low-stock" value={selectedWarehouse.lowStockRows} />
              <Kpi label="Ngarkesa sot" value={selectedWarehouse.capacityPercent == null ? "-" : `${fmt(selectedWarehouse.capacityPercent)}%`} />
              <Kpi label="Risk score" value={fmt(riskScoreOf(selectedWarehouse))} />
              <Kpi label="Transfer dalje" value={selectedWarehouseStats.outboundTransfers} />
              <Kpi label="Transfer hyrje" value={selectedWarehouseStats.inboundTransfers} />
              <Kpi label="Sasi dalje" value={fmt(selectedWarehouseStats.outboundQty)} />
              <Kpi label="Sasi hyrje" value={fmt(selectedWarehouseStats.inboundQty)} />
              <Kpi label="Lidhje direkte" value={selectedWarehouseStats.neighbors.length} />
              <Kpi label="Burim per depo tjera" value={selectedWarehouseStats.sourceForCount} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button onClick={() => setSelectedWarehouseId(selectedWarehouse.id)}>Fokuso ne graf</button>
              <button onClick={() => setSelectedWarehouseId(null)}>Hiq fokusin</button>
              <button onClick={() => setIsDetailDrawerOpen(true)}>Hap pamjen e plote</button>
              <Link to={structureDeepLink(selectedWarehouse.id)} style={actionLinkStyle}>Hap strukturen e kesaj depoje</Link>
              <Link to={`/inventory?warehouseId=${encodeURIComponent(selectedWarehouse.id)}`} style={actionLinkStyle}>Shiko inventarin e kesaj depoje</Link>
              <Link to="/stock-movements" style={actionLinkStyle}>Hap levizjet e stokut</Link>
              <Link to="/warehouse-tasks" style={actionLinkStyle}>Hap veprimet e depos</Link>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Depot e lidhura direkt</div>
              {selectedWarehouseStats.neighbors.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>Nuk ka lidhje direkte ne periudhen e zgjedhur.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedWarehouseStats.neighbors.map((n) => (
                    <button key={n.id} onClick={() => setSelectedWarehouseId(n.id)}>
                      {n.code} - {n.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Burimet e sugjeruara per kete depo</div>
              {!selectedWarehouseStats.targetRecommendation || selectedWarehouseStats.targetRecommendation.suggestedSources.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>Nuk ka sugjerime aktive per kete depo.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <Th>Burimi</Th>
                        <Th>Distanca (km)</Th>
                        <Th>Stok i lire</Th>
                        <Th>Ngarkesa burim</Th>
                        <Th>Statusi</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWarehouseStats.targetRecommendation.suggestedSources.map((s, idx) => (
                        <tr key={`${s.sourceWarehouseId}-${idx}`} style={{ borderTop: "1px solid var(--border)" }}>
                          <Td>{s.sourceWarehouseCode} - {s.sourceWarehouseName}</Td>
                          <Td>{s.distanceKm == null ? "-" : fmt(s.distanceKm)}</Td>
                          <Td>{fmt(s.availableStock)}</Td>
                          <Td>{s.capacityPercent == null ? "-" : `${fmt(s.capacityPercent)}%`}</Td>
                          <Td><StatusBadge status={s.status} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
        <h2 style={{ marginTop: 0 }}>Pamja e depove te shperndara</h2>
        {loading ? <div>Duke ngarkuar...</div> : null}
        {error ? <div style={{ color: "#ffb4b4" }}>{error}</div> : null}
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel-soft)", minHeight: 520, position: "relative", overflow: "hidden" }}>
          <div ref={cyContainerRef} style={{ width: "100%", height: 520 }} />
          {tooltip ? (
            <div style={{ position: "fixed", left: tooltip.x + 12, top: tooltip.y + 12, background: "rgba(7,16,32,0.98)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", fontSize: 12, pointerEvents: "none", zIndex: 60, minWidth: 220 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{tooltip.node.code} - {tooltip.node.name}</div>
              <div style={{ color: "var(--muted)" }}>{tooltip.node.city ?? "Qyteti: -"}</div>
              <div style={{ marginTop: 6 }}>Ne dispozicion: <b>{fmt(tooltip.node.totalAvailable)}</b></div>
              <div>Alarm stok: <b>{tooltip.node.lowStockRows}</b></div>
              <div>Sugjerime burimi: <b>{tooltip.suggestionCount}</b></div>
              <div>Ngarkesa sot: <b>{tooltip.node.capacityPercent == null ? "-" : `${fmt(tooltip.node.capacityPercent)}%`}</b></div>
              <div>Risk score: <b>{fmt(riskScoreOf(tooltip.node))}</b></div>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
          Lidhjet baze paraqiten gjithmone pa shigjeta dhe pa animacion. Vetem lidhjet aktive (transfer/sugjerime/alarme) paraqiten me shigjeta dhe animacion. {clusterMode ? "Zoom-out: cluster sipas qytetit aktiv." : "Zoom-in: shpndarje sipas koordinatave reale."}
        </div>
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
        <h2 style={{ marginTop: 0 }}>Sugjerime te burimit per rimbushje</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Depo ne nevoje</Th><Th>Burimi i sugjeruar</Th><Th>Distanca (km)</Th><Th>Stok i lire</Th><Th>Ngarkesa burim</Th><Th>Statusi</Th>
              </tr>
            </thead>
            <tbody>
              {recommendations.flatMap((r) => {
                if (r.suggestedSources.length === 0) {
                  return (
                    <tr key={`${r.targetWarehouseId}-none`} style={{ borderTop: "1px solid var(--border)" }}>
                      <Td>{r.targetWarehouseCode} - {r.targetWarehouseName}</Td>
                      <Td colSpan={5}>Nuk ka burim te pershtatshem per momentin.</Td>
                    </tr>
                  );
                }
                return r.suggestedSources.map((s, idx) => (
                  <tr key={`${r.targetWarehouseId}-${s.sourceWarehouseId}-${idx}`} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td>{r.targetWarehouseCode} - {r.targetWarehouseName}</Td>
                    <Td>{s.sourceWarehouseCode} - {s.sourceWarehouseName}</Td>
                    <Td>{s.distanceKm == null ? "-" : fmt(s.distanceKm)}</Td>
                    <Td>{fmt(s.availableStock)}</Td>
                    <Td>{s.capacityPercent == null ? "-" : `${fmt(s.capacityPercent)}%`}</Td>
                    <Td><StatusBadge status={s.status} /></Td>
                  </tr>
                ));
              })}
              {recommendations.length === 0 ? (
                <tr><Td colSpan={6}>Nuk ka sugjerime per momentin.</Td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedWarehouse && selectedWarehouseStats && isDetailDrawerOpen ? (
        <>
          <div
            onClick={() => setIsDetailDrawerOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(2,8,20,0.58)", zIndex: 80 }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: "min(620px, 100vw)",
              height: "100vh",
              background: "var(--panel)",
              borderLeft: "1px solid var(--border)",
              zIndex: 81,
              overflowY: "auto",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 22 }}>Depo: {selectedWarehouse.code}</div>
                <div style={{ color: "var(--muted)", marginTop: 4 }}>{selectedWarehouse.name}</div>
              </div>
              <button onClick={() => setIsDetailDrawerOpen(false)}>Mbyll</button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setDetailTab("inventory")} style={detailTab === "inventory" ? activeTabStyle : undefined}>Inventar</button>
              <button onClick={() => setDetailTab("links")} style={detailTab === "links" ? activeTabStyle : undefined}>Lidhje</button>
              <button onClick={() => setDetailTab("suggestions")} style={detailTab === "suggestions" ? activeTabStyle : undefined}>Sugjerime</button>
              <button onClick={() => setDetailTab("structure")} style={detailTab === "structure" ? activeTabStyle : undefined}>Struktura</button>
            </div>

            {detailTab === "inventory" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <Kpi label="Ne dispozicion" value={fmt(selectedWarehouse.totalAvailable)} />
                <Kpi label="Ne depo (On-hand)" value={fmt(selectedWarehouse.totalOnHand)} />
                <Kpi label="E rezervuar" value={fmt(selectedWarehouse.totalReserved)} />
                <Kpi label="Rreshta low-stock" value={selectedWarehouse.lowStockRows} />
                <Kpi label="Ngarkesa sot" value={selectedWarehouse.capacityPercent == null ? "-" : `${fmt(selectedWarehouse.capacityPercent)}%`} />
                <Kpi label="Risk score" value={fmt(riskScoreOf(selectedWarehouse))} />
                <Link to={structureDeepLink(selectedWarehouse.id)} style={actionLinkStyle}>Hap strukturen si pamje e dedikuar</Link>
                <Link to={`/inventory?warehouseId=${encodeURIComponent(selectedWarehouse.id)}`} style={actionLinkStyle}>Hap inventarin e filtruar</Link>
              </div>
            ) : null}

            {detailTab === "links" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <Kpi label="Transfer dalje" value={selectedWarehouseStats.outboundTransfers} />
                <Kpi label="Transfer hyrje" value={selectedWarehouseStats.inboundTransfers} />
                <Kpi label="Sasi dalje" value={fmt(selectedWarehouseStats.outboundQty)} />
                <Kpi label="Sasi hyrje" value={fmt(selectedWarehouseStats.inboundQty)} />
                <Kpi label="Lidhje direkte" value={selectedWarehouseStats.neighbors.length} />
                <div style={{ fontWeight: 700 }}>Depot e lidhura</div>
                {selectedWarehouseStats.neighbors.length === 0 ? (
                  <div style={{ color: "var(--muted)" }}>Nuk ka depo te lidhura ne periudhen aktuale.</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {selectedWarehouseStats.neighbors.map((n) => (
                      <button key={n.id} onClick={() => { setSelectedWarehouseId(n.id); setDetailTab("inventory"); }}>
                        {n.code} - {n.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {detailTab === "suggestions" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <Kpi label="Burim per depo tjera" value={selectedWarehouseStats.sourceForCount} />
                {!selectedWarehouseStats.targetRecommendation || selectedWarehouseStats.targetRecommendation.suggestedSources.length === 0 ? (
                  <div style={{ color: "var(--muted)" }}>Nuk ka sugjerime aktive per kete depo.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <Th>Burimi</Th><Th>Distanca</Th><Th>Stok</Th><Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWarehouseStats.targetRecommendation.suggestedSources.map((s, idx) => (
                          <tr key={`${s.sourceWarehouseId}-drawer-${idx}`} style={{ borderTop: "1px solid var(--border)" }}>
                            <Td>{s.sourceWarehouseCode} - {s.sourceWarehouseName}</Td>
                            <Td>{s.distanceKm == null ? "-" : `${fmt(s.distanceKm)} km`}</Td>
                            <Td>{fmt(s.availableStock)}</Td>
                            <Td><StatusBadge status={s.status} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {detailTab === "structure" ? (
              <div style={{ display: "grid", gap: 10 }}>
                {structureLoading ? <div>Duke ngarkuar strukturen e depos...</div> : null}
                {structureError ? <div style={{ color: "#ffb4b4" }}>{structureError}</div> : null}
                {!structureLoading && !structureError ? (
                  <>
                    {structureGraph.nodes.length > 0 ? (
                      <div
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          background: "var(--panel-soft)",
                          padding: 10,
                          overflow: "auto",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Grafi i struktures se depos</div>
                        {structureHighlight.hasSelection ? (
                          <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>Filtri aktiv: {selectedStructureNodeId}</span>
                            <button type="button" onClick={() => setSelectedStructureNodeId(null)}>Hiq filtrin</button>
                          </div>
                        ) : (
                          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--muted)" }}>
                            Kliko nje Zone/Raft/Shporte per te theksuar degen perkatese.
                          </div>
                        )}
                        <div
                          style={{
                            position: "relative",
                            width: structureGraph.width,
                            height: structureGraph.height,
                            minWidth: "100%",
                          }}
                        >
                          <svg
                            width={structureGraph.width}
                            height={structureGraph.height}
                            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
                          >
                            {structureGraph.edges.map((edge, idx) => (
                              (() => {
                                const edgeKey = `${edge.from}|${edge.to}`;
                                const edgeIsActive = !structureHighlight.hasSelection || structureHighlight.activeEdges.has(edgeKey);
                                return (
                              <line
                                key={`${edge.from}-${edge.to}-${idx}`}
                                x1={edge.x1}
                                y1={edge.y1}
                                x2={edge.x2}
                                y2={edge.y2}
                                stroke={edgeIsActive ? "rgba(125,226,255,0.78)" : "rgba(125,226,255,0.12)"}
                                strokeWidth={edgeIsActive ? "2.3" : "1.1"}
                              />
                                );
                              })()
                            ))}
                          </svg>

                          {structureGraph.nodes.map((node) => (
                            (() => {
                              const nodeIsActive = !structureHighlight.hasSelection || structureHighlight.activeNodes.has(node.id);
                              const nodeIsSelected = selectedStructureNodeId === node.id;
                              return (
                            <div
                              key={node.id}
                              onClick={() => setSelectedStructureNodeId((prev) => (prev === node.id ? null : node.id))}
                              style={{
                                position: "absolute",
                                left: node.x,
                                top: node.y,
                                transform: "translate(-50%, -50%)",
                                border: nodeIsSelected ? "1px solid rgba(255,255,255,0.85)" : "1px solid var(--border)",
                                borderRadius: 10,
                                padding: "6px 8px",
                                fontSize: 12,
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                                opacity: nodeIsActive ? 1 : 0.24,
                                boxShadow: nodeIsSelected ? "0 0 0 1px rgba(125,226,255,0.5), 0 8px 22px rgba(0,0,0,0.28)" : "none",
                                background:
                                  node.kind === "zone"
                                    ? nodeIsActive ? "rgba(110,231,200,0.24)" : "rgba(110,231,200,0.08)"
                                    : node.kind === "rack"
                                      ? nodeIsActive ? "rgba(125,226,255,0.22)" : "rgba(125,226,255,0.08)"
                                      : nodeIsActive ? "rgba(255,214,122,0.24)" : "rgba(255,214,122,0.08)",
                              }}
                              title={node.label}
                            >
                              {node.label}
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                      <Kpi label="Zona" value={structureSummary.zoneCount} />
                      <Kpi label="Rafte" value={structureSummary.rackCount} />
                      <Kpi label="Shporta" value={structureSummary.binCount} />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {structureListView.modeLabel ? (
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {structureListView.modeLabel}
                        </div>
                      ) : null}
                      {structureListView.zones.length === 0 ? (
                        <div style={{ color: "var(--muted)" }}>Kjo depo nuk ka zona te konfiguruara ende.</div>
                      ) : (
                        structureListView.zones.map((zone) => {
                          const allRacks = racksByZone[zone.id] ?? [];
                          const [kind, rawId] = (selectedStructureNodeId ?? "").split(":");
                          const racks =
                            kind === "rack"
                              ? allRacks.filter((r) => r.id === rawId)
                              : kind === "bin"
                                ? allRacks.filter((r) => (binsByRack[r.id] ?? []).some((b) => b.id === rawId))
                                : allRacks;
                          const binsInZone = racks.reduce((sum, r) => sum + (binsByRack[r.id]?.length ?? 0), 0);
                          return (
                            <div key={zone.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--panel-soft)" }}>
                              <div style={{ fontWeight: 700 }}>{zone.code} - {zone.name}</div>
                              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                                Rafte: {racks.length} • Shporta: {binsInZone}
                              </div>
                              {racks.length === 0 ? (
                                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>Nuk ka rafte ne kete zone.</div>
                              ) : (
                                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                                  {racks.map((rack) => (
                                    <div key={rack.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 6, display: "grid", gap: 6 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                        <span>{rack.code} - {rack.name}</span>
                                        <span style={{ color: "var(--muted)" }}>
                                          Shporta:{" "}
                                          {kind === "bin"
                                            ? (binsByRack[rack.id] ?? []).filter((b) => b.id === rawId).length
                                            : binsByRack[rack.id]?.length ?? 0}
                                        </span>
                                      </div>
                                      {(kind === "bin"
                                        ? (binsByRack[rack.id] ?? []).filter((b) => b.id === rawId).length
                                        : binsByRack[rack.id]?.length ?? 0) === 0 ? (
                                        <div style={{ color: "var(--muted)", fontSize: 12 }}>Nuk ka shporta ne kete raft.</div>
                                      ) : (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                          {(kind === "bin"
                                            ? (binsByRack[rack.id] ?? []).filter((b) => b.id === rawId)
                                            : binsByRack[rack.id] ?? []).map((bin) => (
                                            <span
                                              key={bin.id}
                                              style={{
                                                border: "1px solid var(--border)",
                                                borderRadius: 999,
                                                padding: "3px 8px",
                                                fontSize: 12,
                                                background: "rgba(125,226,255,0.08)",
                                              }}
                                            >
                                              {bin.code} - {bin.name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </aside>
        </>
      ) : null}

    </div>
  );
}

const actionLinkStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "var(--text)",
  textDecoration: "none",
  background: "var(--panel-soft)",
  fontSize: 14,
  fontWeight: 600,
};

const activeTabStyle: CSSProperties = {
  borderColor: "rgba(125,226,255,0.6)",
  boxShadow: "0 0 0 1px rgba(125,226,255,0.35) inset",
};

function StatusBadge({ status }: { status: WarehouseSuggestedSource["status"] }) {
  const map: Record<WarehouseSuggestedSource["status"], { label: string; bg: string; border: string; color: string }> = {
    OK: { label: "Ne rregull", bg: "rgba(110,231,200,0.14)", border: "rgba(110,231,200,0.38)", color: "#b7ffe9" },
    BLOCKED_CUTOFF: { label: "Bllokuar nga cutoff", bg: "rgba(255,210,130,0.14)", border: "rgba(255,210,130,0.38)", color: "#ffe2a8" },
    BLOCKED_CAPACITY: { label: "Bllokuar nga kapaciteti", bg: "rgba(255,155,122,0.14)", border: "rgba(255,155,122,0.38)", color: "#ffc5b2" },
  };
  const cfg = map[status];
  return <span style={{ border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color, borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>{cfg.label}</span>;
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--panel-soft)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "var(--muted)" }}>{children}</th>;
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ padding: 10, verticalAlign: "top" }}>{children}</td>;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function asciiBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

type StructureGraphNode = {
  id: string;
  kind: "zone" | "rack" | "bin";
  label: string;
  x: number;
  y: number;
};

type StructureGraphEdge = {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function buildStructureGraph(
  zones: LookupDto[],
  racksByZoneInput: Record<string, LookupDto[]>,
  binsByRackInput: Record<string, LookupDto[]>
) {
  const colX = { zone: 120, rack: 390, bin: 690 };
  const rowGap = 40;
  const marginY = 26;

  const nodes: StructureGraphNode[] = [];
  const edges: StructureGraphEdge[] = [];
  const pos = new Map<string, { x: number; y: number }>();

  let zIndex = 0;
  let rIndex = 0;
  let bIndex = 0;

  for (const zone of zones) {
    const zoneY = marginY + zIndex * rowGap;
    zIndex += 1;
    const zoneNodeId = `zone:${zone.id}`;
    pos.set(zoneNodeId, { x: colX.zone, y: zoneY });
    nodes.push({
      id: zoneNodeId,
      kind: "zone",
      label: `${zone.code}`,
      x: colX.zone,
      y: zoneY,
    });

    const racks = racksByZoneInput[zone.id] ?? [];
    for (const rack of racks) {
      const rackY = marginY + rIndex * rowGap;
      rIndex += 1;
      const rackNodeId = `rack:${rack.id}`;
      pos.set(rackNodeId, { x: colX.rack, y: rackY });
      nodes.push({
        id: rackNodeId,
        kind: "rack",
        label: `${rack.code}`,
        x: colX.rack,
        y: rackY,
      });

      const zonePos = pos.get(zoneNodeId);
      if (zonePos) {
        edges.push({
          from: zoneNodeId,
          to: rackNodeId,
          x1: zonePos.x + 40,
          y1: zonePos.y,
          x2: colX.rack - 44,
          y2: rackY,
        });
      }

      const bins = binsByRackInput[rack.id] ?? [];
      const binsForGraph = bins.slice(0, 16);
      for (const bin of binsForGraph) {
        const binY = marginY + bIndex * rowGap;
        bIndex += 1;
        const binNodeId = `bin:${bin.id}`;
        pos.set(binNodeId, { x: colX.bin, y: binY });
        nodes.push({
          id: binNodeId,
          kind: "bin",
          label: `${bin.code}`,
          x: colX.bin,
          y: binY,
        });

        edges.push({
          from: rackNodeId,
          to: binNodeId,
          x1: colX.rack + 44,
          y1: rackY,
          x2: colX.bin - 48,
          y2: binY,
        });
      }
    }
  }

  const maxRows = Math.max(zIndex, rIndex, bIndex, 1);
  return {
    nodes,
    edges,
    width: 820,
    height: Math.max(240, marginY * 2 + maxRows * rowGap),
  };
}

function buildPdfFromJpeg(jpegBytes: Uint8Array, imgW: number, imgH: number, title: string): Uint8Array {
  const pageW = 842;
  const pageH = 595;
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - 28;
  const scale = Math.min(maxW / imgW, maxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = (pageW - drawW) / 2;
  const drawY = margin;
  const content = `BT /F1 12 Tf ${margin} ${pageH - 18} Td (${title.replace(/[()]/g, "")}) Tj ET\nq\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const contentBytes = asciiBytes(content);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const push = (u: Uint8Array) => {
    chunks.push(u);
    pos += u.length;
  };
  const pushTxt = (s: string) => push(asciiBytes(s));
  pushTxt("%PDF-1.4\n");
  offsets[1] = pos; pushTxt("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = pos; pushTxt("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = pos; pushTxt(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  offsets[4] = pos; pushTxt(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  pushTxt("\nendstream\nendobj\n");
  offsets[5] = pos; pushTxt(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  push(contentBytes);
  pushTxt("endstream\nendobj\n");
  offsets[6] = pos; pushTxt("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  const xrefStart = pos;
  pushTxt("xref\n0 7\n0000000000 65535 f \n");
  for (let i = 1; i <= 6; i++) pushTxt(`${offsets[i].toString().padStart(10, "0")} 00000 n \n`);
  pushTxt(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
