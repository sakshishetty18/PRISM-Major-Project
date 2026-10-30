"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import * as THREE from "three";
import type { ForceGraphMethods } from "react-force-graph-3d";
import { buildCuratedDemoNetwork, type CuratedDemoSnapshot } from "./demoNetwork";
import { applyBundleLayout, applyStableLayout } from "../../lib/bundleLayout";
import {
  riskLevelForNode,
  riskLevelFromScore,
  type DatasetSummary,
  type GraphCounts,
  type GraphLink,
  type GraphNode,
  type GraphSource,
  type RawGraph,
  type RiskLevel,
} from "./types";

interface FocusData {
  neighborSet: Set<string | number>;
}

interface TourRing {
  ringId: number;
  label: string;
  shape: "STAR" | "CHAIN" | "CYCLE" | "DENSE";
  members: (string | number)[];
  description: string;
}

type SnapshotRecord = Record<string, unknown>;

interface NetworkSnapshot {
  nodes: SnapshotRecord[];
  edges?: SnapshotRecord[];
  links?: SnapshotRecord[];
  selection?: {
    available_edges?: number;
    edges_sampled?: boolean;
  };
  stats?: {
    total_nodes?: number;
    total_edges?: number;
    total_transactions?: number;
    fraud_nodes?: number;
    fraud_rate?: number;
    accounts_with_relationships?: number;
    risk_distribution?: SnapshotRecord;
  };
}

interface RingSnapshot {
  rings?: SnapshotRecord[];
  rings_detected?: number;
}

interface FraudGraph3DProps {
  onNodeSelect: (node: GraphNode | null) => void;
  selectedNode: GraphNode | null;
  graphSource: GraphSource;
  onGraphSourceChange: (source: GraphSource) => void;
  // filter state passed down from page
  riskThreshold: number;
  visibleRiskLevels: Record<RiskLevel, boolean>;
  showOnlyRings: boolean;
  searchId: string;
  searchVersion: number;
  onClearSearch: () => void;
  // lift stats up to sidebar
  onStatsUpdate?: (stats: GraphCounts) => void;
  onDatasetSummaryUpdate?: (summary: DatasetSummary | null) => void;
}

type SnapshotMode = "connected" | "risk-ranked" | "neighborhood";
const EMPTY_GRAPH: RawGraph = { nodes: [], links: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveId(ep: string | number | GraphNode): string | number {
  return typeof ep === "object" ? ep.id : ep;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  SAFE: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
  UNCLASSIFIED: "#94a3b8",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  SAFE: "SAFE",
  MEDIUM: "MEDIUM RISK",
  HIGH: "HIGH RISK",
  UNCLASSIFIED: "UNCLASSIFIED",
};

function riskColor(level: RiskLevel): THREE.Color {
  return new THREE.Color(RISK_COLORS[level]);
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

/** Keep account markers readable while modestly emphasizing central nodes. */
function nodeRadius(n: GraphNode): number {
  const pr = Math.min(1, Math.max(0, (n.pagerank ?? 0) * 1000));
  return 3.5 + pr * 1.5;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FraudGraph3D({
  onNodeSelect,
  selectedNode,
  graphSource,
  onGraphSourceChange,
  riskThreshold,
  visibleRiskLevels,
  showOnlyRings,
  searchId,
  searchVersion,
  onClearSearch,
  onStatsUpdate,
  onDatasetSummaryUpdate,
}: FraudGraph3DProps) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const ML_BASE = process.env.NEXT_PUBLIC_ML_URL ?? "http://localhost:8001";
  // ── Dynamic import of 3-D force graph (client-only) ──
  const [ForceGraph3D, setForceGraph3D] =
    useState<typeof import("react-force-graph-3d").default | null>(null);
  const [mounted, setMounted] = useState(false);

  // ── Data ──
  const [demoGraph, setDemoGraph] = useState<RawGraph | null>(null);
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [liveGraph, setLiveGraph] = useState<RawGraph | null>(null);
  const [liveDatasetStats, setLiveDatasetStats] = useState<DatasetSummary | null>(null);
  const [liveEdgeSummary, setLiveEdgeSummary] = useState<{ displayed: number; available: number; sampled: boolean } | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveRingCount, setLiveRingCount] = useState(0);

  // ── UI state ──
  const [activeNodeId, setActiveNodeId] = useState<string | number | null>(
    null
  );
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isBundled, setIsBundled] = useState(false);
  const [flowPaused, setFlowPaused] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState<SnapshotMode>("connected");
  const [snapshotLimit, setSnapshotLimit] = useState(400);
  const [neighborhoodCenter, setNeighborhoodCenter] = useState<string | null>(null);

  // ── Guided tour ──
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourRings, setTourRings] = useState<TourRing[]>([]);
  const tourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFitted = useRef(false);
  const rawGraph = graphSource === "curated-demo" ? demoGraph : liveGraph;

  // ── Mount / graph canvas sizing ──
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    import("react-force-graph-3d").then((mod) =>
      setForceGraph3D(() => mod.default)
    );
  }, []);

  useLayoutEffect(() => {
    if (!ForceGraph3D || !containerRef.current) return;

    const resize = () => {
      const { clientWidth, clientHeight } = containerRef.current!;
      setDimensions({ width: clientWidth, height: clientHeight });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    resize();
    return () => observer.disconnect();
  }, [ForceGraph3D]);

  useEffect(() => {
    if (!mounted || graphSource !== "curated-demo" || demoGraph) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadCuratedDemo() {
      setDemoLoading(true);
      setDemoError(null);
      try {
        const response = await fetch(`${ML_BASE}/network-snapshot?mode=connected&limit=1200`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Graph API returned HTTP ${response.status}`);
        const snapshot = await response.json() as CuratedDemoSnapshot;
        const graph = buildCuratedDemoNetwork(snapshot);
        if (graph.nodes.length === 0) {
          throw new Error("The bounded data scope contained no scored Low, Medium, or High accounts");
        }
        if (cancelled) return;
        setDemoGraph(graph);
        hasFitted.current = false;
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Curated demo graph load failed:", error);
        setDemoError(error instanceof Error ? error.message : "Curated real-data sample is unavailable.");
      } finally {
        if (!cancelled) setDemoLoading(false);
      }
    }

    void loadCuratedDemo();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ML_BASE, demoGraph, graphSource, mounted]);

  // ── Load bounded real-data scopes separately from the curated Demo sample ──
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadLiveData() {
      setLiveLoading(true);
      setLiveError(null);
      setLiveEdgeSummary(null);
      try {
        const query = new URLSearchParams({
          limit: String(snapshotLimit),
          mode: snapshotMode,
        });
        if (snapshotMode === "neighborhood" && neighborhoodCenter) {
          query.set("center_id", neighborhoodCenter);
        }
        const response = await fetch(`${ML_BASE}/network-snapshot?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Graph API returned HTTP ${response.status}`);

        const data = await response.json() as NetworkSnapshot;
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          throw new Error("Graph API response must contain node and edge lists");
        }

        const nodes: GraphNode[] = data.nodes.flatMap((record) => {
          const idValue = record.id ?? record.node_id;
          if (idValue === null || idValue === undefined) return [];
          const id = String(idValue);
          const rawScore = record.gnn_score;
          const score = rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))
            ? undefined
            : Math.max(0, Math.min(1, Number(rawScore)));
          const rawRiskLevel = typeof record.risk_level === "string" ? record.risk_level.toUpperCase() : "";
          const riskLevel = rawRiskLevel === "LOW" ? "SAFE" :
            rawRiskLevel === "MEDIUM" ? "MEDIUM" :
              rawRiskLevel === "HIGH" ? "HIGH" : undefined;
          const isFraudLabeled = readBoolean(record.is_fraud);
          const ringMembership = Number(record.ring_membership ?? 0);

          return [{
            id,
            is_anomalous: riskLevel === "HIGH",
            ...(isFraudLabeled === undefined ? {} : { is_fraud_labeled: isFraudLabeled }),
            ...(score === undefined ? {} : { anomalyScore: score }),
            riskThreshold: Number(record.risk_threshold ?? 0.5),
            highRiskThreshold: Number(record.high_risk_threshold ?? 0.65),
            riskLevel: riskLevel ?? (score === undefined ? "UNCLASSIFIED" : riskLevelFromScore(score)),
            sourceType: "live-gnn" as const,
            volume: Number(record.tx_count ?? 0),
            pagerank: Number(record.pagerank ?? 0),
            clusterId: Number.isFinite(Number(record.community_id)) ? Number(record.community_id) : undefined,
            clusterFraudRate: Number.isFinite(Number(record.community_fraud_rate))
              ? Number(record.community_fraud_rate)
              : undefined,
            is_ring_member: readBoolean(record.is_ring_member) ?? ringMembership > 0,
            accountAgeDays: Number(record.account_age_days ?? 0),
            meanBalanceFeature: Number(record.balance_mean ?? 0),
            txCount: Number(record.tx_count ?? 0),
            inDegree: Number(record.in_degree ?? 0),
            outDegree: Number(record.out_degree ?? 0),
            incomingAmount: Number(record.incoming_amount ?? 0),
            outgoingAmount: Number(record.outgoing_amount ?? 0),
          }];
        });

        const nodeIds = new Set(nodes.map((node) => String(node.id)));
        const links: GraphLink[] = data.edges.flatMap((record) => {
          const source = record.source;
          const target = record.target;
          if (source === null || source === undefined || target === null || target === undefined) return [];
          const sourceId = String(source);
          const targetId = String(target);
          if (sourceId === targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) return [];
          const amount = Number(record.amount);
          return [{
            source: sourceId,
            target: targetId,
            ...(Number.isFinite(amount) ? { amount, weight: amount } : {}),
            isFraudEdge: readBoolean(record.is_fraud_edge) ?? false,
          }];
        });

        if (cancelled) return;
        hasFitted.current = false;
        setLiveGraph({ nodes, links });
        setLiveEdgeSummary({
          displayed: links.length,
          available: Number(data.selection?.available_edges ?? data.edges.length),
          sampled: data.selection?.edges_sampled === true,
        });
        const distribution = data.stats?.risk_distribution ?? {};
        const totalAccounts = Number(data.stats?.total_nodes ?? nodes.length);
        const fraudLabeledAccounts = Number(data.stats?.fraud_nodes ?? 0);
        const summary: DatasetSummary = {
          totalAccounts,
          totalTransactions: Number(data.stats?.total_transactions ?? data.stats?.total_edges ?? 0),
          accountsWithRelationships: Number(data.stats?.accounts_with_relationships ?? 0),
          fraudLabeledAccounts,
          fraudLabeledPercentage: totalAccounts > 0 ? fraudLabeledAccounts / totalAccounts * 100 : 0,
          classifiedAccounts: Number(distribution.classified_accounts ?? 0),
          lowRiskAccounts: Number(distribution.low ?? 0),
          mediumRiskAccounts: Number(distribution.medium ?? 0),
          highRiskAccounts: Number(distribution.high ?? 0),
          unclassifiedAccounts: Number(distribution.unclassified ?? 0),
          mediumThreshold: Number(distribution.medium_threshold ?? 0.5),
          highThreshold: Number(distribution.high_threshold ?? 0.65),
          scoreField: String(distribution.score_field ?? "gnn_probability"),
        };
        setLiveDatasetStats(summary);
        onDatasetSummaryUpdate?.(summary);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Live graph load failed:", error);
        setLiveError(error instanceof Error ? error.message : "Live graph data is unavailable.");
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    }

    void loadLiveData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ML_BASE, mounted, neighborhoodCenter, onDatasetSummaryUpdate, snapshotLimit, snapshotMode]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadRings() {
      try {
        const response = await fetch(`${ML_BASE}/detect-rings?max_size=6&limit=20`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Ring API returned HTTP ${response.status}`);
        const ringData = await response.json() as RingSnapshot;
        if (cancelled || !Array.isArray(ringData.rings)) return;
        const rings: TourRing[] = ringData.rings.slice(0, 5).map((ring, index) => {
          const shapeValue = ring.shape;
          const shape = typeof shapeValue === "string" && ["STAR", "CHAIN", "CYCLE", "DENSE"].includes(shapeValue)
            ? shapeValue as TourRing["shape"]
            : "STAR";
          const ringId = Number(ring.ringId ?? index + 1);
          const members = ring.members ?? ring.nodes;
          return {
            ringId: Number.isFinite(ringId) ? ringId : index + 1,
            label: `${shape} Ring #${Number.isFinite(ringId) ? ringId : index + 1}`,
            shape,
            members: Array.isArray(members)
              ? members.filter((member): member is string | number => typeof member === "string" || typeof member === "number")
              : [],
            description: typeof ring.description === "string"
              ? ring.description
              : `Detected ${shape.toLowerCase()} structure in the live graph.`,
          };
        });
        setTourRings(rings);
        setLiveRingCount(Number(ringData.rings_detected ?? ringData.rings.length));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Live ring data load failed:", error);
        setTourRings([]);
        setLiveRingCount(0);
      }
    }

    void loadRings();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ML_BASE, mounted]);

  const currentGraph = useMemo(
    () => applyStableLayout(rawGraph ?? EMPTY_GRAPH),
    [rawGraph],
  );
  const layoutGraph = useMemo(
    () => isBundled ? applyBundleLayout(currentGraph) : currentGraph,
    [currentGraph, isBundled],
  );

  const datasetCounts = useMemo<GraphCounts>(() => {
    const counts = currentGraph.nodes.reduce(
      (result, node) => {
        result.totalNodes += 1;
        const riskLevel = riskLevelForNode(node);
        if (riskLevel === "SAFE") result.safeNodes += 1;
        else if (riskLevel === "MEDIUM") result.mediumNodes += 1;
        else if (riskLevel === "HIGH") result.highNodes += 1;
        else result.unclassifiedNodes += 1;
        if (node.is_ring_member || (node.ringIds?.length ?? 0) > 0) result.rings += 1;
        return result;
      },
      {
        totalNodes: 0,
        totalEdges: currentGraph.links.length,
        safeNodes: 0,
        mediumNodes: 0,
        highNodes: 0,
        unclassifiedNodes: 0,
        rings: 0,
      },
    );
    if (graphSource === "live-gnn") counts.rings = liveRingCount;
    return counts;
  }, [currentGraph, graphSource, liveRingCount]);

  useEffect(() => {
    onStatsUpdate?.(datasetCounts);
  }, [datasetCounts, onStatsUpdate]);

  useEffect(() => {
    onDatasetSummaryUpdate?.(liveDatasetStats);
  }, [liveDatasetStats, onDatasetSummaryUpdate]);

  useEffect(() => {
    setActiveNodeId(null);
    onNodeSelect(null);
    hasFitted.current = false;
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    setTourActive(false);
    setTourStep(0);
  }, [graphSource, onNodeSelect]);

  // ── Apply filters ──
  const visibleGraph = useMemo<RawGraph>(() => {
    let nodes = layoutGraph.nodes.filter((node) => visibleRiskLevels[riskLevelForNode(node)]);

    if (riskThreshold > 0) {
      nodes = nodes.filter((node) => (node.anomalyScore ?? 0) >= riskThreshold);
    }

    if (showOnlyRings) {
      nodes = nodes.filter(
        (node) => node.is_ring_member || (node.ringIds?.length ?? 0) > 0,
      );
    }

    const nodeIds = new Set(nodes.map((node) => String(node.id)));
    const links = layoutGraph.links.filter(
      (link) => nodeIds.has(String(resolveId(link.source))) && nodeIds.has(String(resolveId(link.target))),
    );

    return { nodes, links };
  }, [layoutGraph, riskThreshold, showOnlyRings, visibleRiskLevels]);

  useEffect(() => {
    if (!fgRef.current || dimensions.width === 0 || dimensions.height === 0) return;
    const chargeForce = fgRef.current?.d3Force("charge");
    const linkForce = fgRef.current?.d3Force("link");
    if (chargeForce && typeof chargeForce.strength === "function") {
      chargeForce.strength(isBundled ? -60 : -180);
    }
    if (linkForce && typeof linkForce.distance === "function") {
      linkForce.distance(isBundled ? 30 : 50);
      if (typeof linkForce.strength === "function") {
        linkForce.strength(isBundled ? 0.8 : 0.5);
      }
    }
  }, [ForceGraph3D, dimensions, isBundled, visibleGraph]);

  // ── Focus / neighbour set ──
  const focusData = useMemo<FocusData>(() => {
    if (!activeNodeId || !visibleGraph)
      return { neighborSet: new Set() };

    const neighborSet = new Set<string | number>([activeNodeId]);
    visibleGraph.links.forEach((link) => {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      if (s === activeNodeId) neighborSet.add(t);
      if (t === activeNodeId) neighborSet.add(s);
    });

    return { neighborSet };
  }, [activeNodeId, visibleGraph]);

  // ── Camera helpers ──
  const focusCameraOnNode = useCallback((node: GraphNode) => {
    if (!fgRef.current || node.x === undefined) return;
    const distance = 80;
    const mag = Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0) || 1;
    const ratio = 1 + distance / mag;
    const target = { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 };
    fgRef.current.cameraPosition(
      {
        x: target.x * ratio,
        y: target.y * ratio,
        z: target.z * ratio,
      },
      target,
      800
    );
  }, []);

  useEffect(() => {
    if (!fgRef.current || dimensions.width === 0 || dimensions.height === 0 || visibleGraph.nodes.length === 0) {
      return;
    }

    hasFitted.current = false;
    const fitTimer = window.setTimeout(() => {
      fgRef.current?.zoomToFit(800, 48);
      hasFitted.current = true;
    }, 500);
    return () => window.clearTimeout(fitTimer);
  }, [ForceGraph3D, dimensions, layoutGraph, visibleGraph]);

  // ── Guided Tour ──
  const advanceTour = useCallback(
    (step: number) => {
      if (step >= tourRings.length) {
        setTourActive(false);
        setTourStep(0);
        return;
      }

      setTourStep(step);
      const ring = tourRings[step];

      // Highlight ring members
      if (ring.members.length > 0) {
        const firstMember = ring.members[0];
        const node = currentGraph.nodes.find((n) => String(n.id) === String(firstMember));
        if (node) {
          setActiveNodeId(firstMember);
          setTimeout(() => focusCameraOnNode(node), 300);
        }
      }

      tourTimerRef.current = setTimeout(() => advanceTour(step + 1), 4500);
    },
    [tourRings, currentGraph, focusCameraOnNode]
  );

  const startTour = useCallback(() => {
    if (tourRings.length === 0) return;
    setTourActive(true);
    setTourStep(0);
    advanceTour(0);
  }, [advanceTour, tourRings]);

  const stopTour = useCallback(() => {
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    setTourActive(false);
    setTourStep(0);
    setActiveNodeId(null);
  }, []);

  useEffect(() => {
    return () => {
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    };
  }, []);

  const connectedAccountsForNode = useCallback((node: GraphNode) => {
    const connectedAccounts = new Map<string, {
      node: GraphNode;
      direction: "incoming" | "outgoing";
      amount?: number;
      isFraudEdge?: boolean;
    }>();
    const visibleNodes = new Map(visibleGraph.nodes.map((candidate) => [String(candidate.id), candidate]));
    visibleGraph.links.forEach((link) => {
      const sourceId = resolveId(link.source);
      const targetId = resolveId(link.target);
      if (String(sourceId) === String(node.id)) {
        const neighbor = visibleNodes.get(String(targetId));
        if (neighbor) {
          connectedAccounts.set(`${neighbor.id}:outgoing`, {
            node: neighbor,
            direction: "outgoing",
            amount: link.amount,
            isFraudEdge: link.isFraudEdge,
          });
        }
      } else if (String(targetId) === String(node.id)) {
        const neighbor = visibleNodes.get(String(sourceId));
        if (neighbor) {
          connectedAccounts.set(`${neighbor.id}:incoming`, {
            node: neighbor,
            direction: "incoming",
            amount: link.amount,
            isFraudEdge: link.isFraudEdge,
          });
        }
      }
    });

    return [...connectedAccounts.values()].map(({ node: neighbor, direction, amount, isFraudEdge }) => ({
      id: neighbor.id,
      riskLevel: riskLevelForNode(neighbor),
      direction,
      amount,
      isFraudEdge,
    }));
  }, [visibleGraph]);

  const selectNode = useCallback((node: GraphNode) => {
    onNodeSelect({
      ...node,
      connectedAccounts: connectedAccountsForNode(node),
    });
    setActiveNodeId(node.id);
    if (graphSource === "live-gnn" && snapshotMode === "neighborhood") {
      setNeighborhoodCenter(String(node.id));
    }
    focusCameraOnNode(node);
  }, [connectedAccountsForNode, focusCameraOnNode, graphSource, onNodeSelect, setNeighborhoodCenter, snapshotMode]);

  const selectedNodeId = selectedNode?.id;

  useEffect(() => {
    if (activeNodeId === null) return;
    const node = visibleGraph.nodes.find((candidate) => String(candidate.id) === String(activeNodeId));
    if (!node) {
      setActiveNodeId(null);
      onNodeSelect(null);
      return;
    }

    if (selectedNodeId !== undefined && String(selectedNodeId) === String(node.id)) {
      onNodeSelect({ ...node, connectedAccounts: connectedAccountsForNode(node) });
    }
  }, [activeNodeId, connectedAccountsForNode, onNodeSelect, selectedNodeId, visibleGraph.nodes]);

  useEffect(() => {
    const query = searchId.trim();
    if (!query) {
      if (searchVersion > 0) {
        setActiveNodeId(null);
        onNodeSelect(null);
      }
      return;
    }
    const node = currentGraph.nodes.find((candidate) => String(candidate.id) === query);
    if (!node) {
      if (graphSource === "live-gnn" && searchVersion > 0 && query !== neighborhoodCenter) {
        setNeighborhoodCenter(query);
        setSnapshotMode("neighborhood");
      }
      return;
    }
    if (!visibleGraph.nodes.some((candidate) => String(candidate.id) === query)) return;
    selectNode(node);
    window.setTimeout(() => focusCameraOnNode(node), 400);
  }, [currentGraph, focusCameraOnNode, graphSource, neighborhoodCenter, onNodeSelect, searchId, searchVersion, selectNode, visibleGraph.nodes]);

  // ── Node object builder ──
  const buildNodeObject = useCallback(
    (node: GraphNode): THREE.Group => {
      const isActive = node.id === activeNodeId || node.id === selectedNode?.id;
      const isNeighbor = focusData.neighborSet.has(node.id);
      const hasSearch = searchId.trim() !== "";
      const matchesSearch = String(node.id).includes(searchId.trim());

      const level = riskLevelForNode(node);
      const color = riskColor(level);
      const radius = nodeRadius(node);

      // Opacity logic
      let opacity = 1;
      if (activeNodeId) {
        opacity = isActive ? 1 : isNeighbor ? 0.75 : 0.08;
      } else if (hasSearch) {
        opacity = matchesSearch ? 1 : 0.1;
      }

      const group = new THREE.Group();

      // Medium-risk accounts use a distinct shape so risk is readable beyond color.
      const sphere = new THREE.Mesh(
        level === "MEDIUM"
          ? new THREE.OctahedronGeometry(radius * 1.15, 0)
          : new THREE.SphereGeometry(radius, 28, 28),
        new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity,
          roughness: 0.4,
          metalness: 0.2,
          emissive: color,
          emissiveIntensity: level === "HIGH" ? 0.22 : 0.08,
        })
      );
      group.add(sphere);

      if (level === "HIGH" && (isActive || !activeNodeId)) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.45, 0.28, 8, 32),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(RISK_COLORS.HIGH),
            transparent: true,
            opacity: opacity * 0.9,
          })
        );
        group.add(ring);
      } else if (level === "SAFE" && (isActive || !activeNodeId)) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.28, 0.12, 8, 24),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(RISK_COLORS.SAFE),
            transparent: true,
            opacity: opacity * 0.55,
          })
        );
        group.add(ring);
      }

      // Selection wireframe
      if (isActive) {
        const wire = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.35, 16, 16),
          new THREE.MeshBasicMaterial({
            color: "#60a5fa",
            wireframe: true,
            transparent: true,
            opacity: 0.6,
          })
        );
        group.add(wire);

        // Pulse ring for selected node
        const pulse = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 2, 0.15, 8, 32),
          new THREE.MeshBasicMaterial({
            color: "#3b82f6",
            transparent: true,
            opacity: 0.4,
          })
        );
        group.add(pulse);
      }

      // Tour highlight glow
      if (
        tourActive &&
        tourRings[tourStep]?.members.includes(node.id)
      ) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 2, 16, 16),
          new THREE.MeshBasicMaterial({
            color: "#facc15",
            transparent: true,
            opacity: 0.18,
          })
        );
        group.add(glow);
      }

      return group;
    },
    [activeNodeId, focusData, searchId, selectedNode?.id, tourActive, tourStep, tourRings]
  );

  // ── Link styling ──
  const getLinkColor = useCallback(
    (link: GraphLink): string => {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      if (!activeNodeId) return "rgba(203,213,225,0.62)";

      const connected = s === activeNodeId || t === activeNodeId;
      if (!connected) return "rgba(255,255,255,0.04)";
      return "#e2e8f0";
    },
    [activeNodeId]
  );

  const getLinkWidth = useCallback(
    (link: GraphLink): number => {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      if (!activeNodeId) return 1.2;
      return (s === activeNodeId || t === activeNodeId) ? 2 : 0.08;
    },
    [activeNodeId]
  );

  const getParticleColor = useCallback((link: GraphLink): string => {
    const sourceId = resolveId(link.source);
    const sourceNode = typeof link.source === "object"
      ? link.source
      : visibleGraph.nodes.find((node) => String(node.id) === String(sourceId));
    return sourceNode ? RISK_COLORS[riskLevelForNode(sourceNode)] : "#cbd5e1";
  }, [visibleGraph]);

  // ── Node label tooltip ──
  const getNodeLabel = useCallback((node: GraphNode): string => {
    const score = node.anomalyScore;
    const level = riskLevelForNode(node);
    const hex = RISK_COLORS[level];
    const accountId = escapeHtml(String(node.id));
    const levelLabel = level === "SAFE" ? "LOW RISK (GNN)" : RISK_LABELS[level];
    const sourceLabel = node.sourceType === "curated-demo" ? "Curated sample of real dataset accounts" : "Live GNN sample";

    return `
      <div style="
        background:rgba(8,10,18,0.97);
        padding:12px 16px;
        border-radius:10px;
        border:1px solid ${hex};
        font-size:12px;
        color:#e5e7eb;
        min-width:180px;
        box-shadow:0 0 20px ${hex}44;
      ">
        <div style="font-weight:700;font-size:13px;color:${hex};margin-bottom:6px;">
          Account ${accountId}
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <div>Risk category: <b style="color:${hex}">${levelLabel}</b></div>
          <div>Risk score: <b style="color:${hex}">${score === undefined ? "Unavailable" : `${(score * 100).toFixed(1)}%`}</b></div>
          <div>Structural role: <b>${node.role ?? "Not assigned"}</b></div>
          <div>PageRank: <b>${(node.pagerank ?? 0).toFixed(6)}</b></div>
          <div>Transactions: <b>${node.volume ?? 0}</b></div>
          <div style="color:#94a3b8;font-size:10px;">${sourceLabel}</div>
          ${
            node.is_ring_member || (node.ringIds?.length ?? 0) > 0
              ? `<div style="margin-top:4px;color:#facc15;font-size:11px;">Detected ring member</div>`
              : ""
          }
        </div>
      </div>
    `;
  }, []);

  // ── Handlers ──
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      selectNode(node);
    },
    [selectNode]
  );

  const handleResetView = useCallback(() => {
    setActiveNodeId(null);
    onNodeSelect(null);
    onClearSearch();
    stopTour();
    setSnapshotMode("connected");
    setNeighborhoodCenter(null);
    setFlowPaused(false);
    hasFitted.current = false;
    fgRef.current?.zoomToFit(800, 48);
  }, [onClearSearch, onNodeSelect, stopTour]);

  const handleZoomIn = useCallback(() => {
    if (!fgRef.current) return;
    const cam = fgRef.current.camera() as THREE.PerspectiveCamera;
    fgRef.current.cameraPosition({ z: cam.position.z * 0.8 }, undefined, 400);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!fgRef.current) return;
    const cam = fgRef.current.camera() as THREE.PerspectiveCamera;
    fgRef.current.cameraPosition({ z: cam.position.z * 1.2 }, undefined, 400);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  if (!mounted || !ForceGraph3D) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Initialising 3-D Engine…
        </div>
      </div>
    );
  }

  const currentTourRing = tourActive ? tourRings[tourStep] : null;
  const visibleRiskCounts = visibleGraph.nodes.reduce(
    (counts, node) => {
      counts[riskLevelForNode(node)] += 1;
      return counts;
    },
    { SAFE: 0, MEDIUM: 0, HIGH: 0, UNCLASSIFIED: 0 },
  );

  return (
    <div ref={containerRef} className="h-full w-full bg-black relative overflow-hidden">

      {/* ── Counts describe only the nodes and links currently drawn ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1">
        {[
          { label: "Visible accounts", value: visibleGraph.nodes.length.toLocaleString(), color: "#60a5fa" },
          { label: "Low GNN score", value: visibleRiskCounts.SAFE.toLocaleString(), color: RISK_COLORS.SAFE },
          { label: "Medium risk", value: visibleRiskCounts.MEDIUM.toLocaleString(), color: RISK_COLORS.MEDIUM },
          { label: "High risk", value: visibleRiskCounts.HIGH.toLocaleString(), color: RISK_COLORS.HIGH },
          { label: "Unclassified", value: visibleRiskCounts.UNCLASSIFIED.toLocaleString(), color: RISK_COLORS.UNCLASSIFIED },
          { label: "Visible edges", value: visibleGraph.links.length.toLocaleString(), color: "#cbd5e1" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="px-3 py-1.5 rounded-md text-center"
            style={{
              background: "rgba(10,12,22,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="text-xs font-mono" style={{ color }}>
              {value}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Data source selector ── */}
      <div
        className="absolute top-4 right-4 z-20 flex gap-1 rounded-lg p-1"
        style={{
          background: "rgba(10,12,22,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          type="button"
          aria-pressed={graphSource === "curated-demo"}
          onClick={() => onGraphSourceChange("curated-demo")}
          className="px-3 py-1.5 text-xs rounded-md transition-all"
          style={{
            background: graphSource === "curated-demo" ? "rgba(59,130,246,0.25)" : "transparent",
            color: graphSource === "curated-demo" ? "#93c5fd" : "#6b7280",
            border: graphSource === "curated-demo" ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
          }}
        >
          Demo
        </button>
        <button
          type="button"
          aria-pressed={graphSource === "live-gnn"}
          disabled={!liveGraph}
          onClick={() => onGraphSourceChange("live-gnn")}
          title={liveError ?? "View a bounded real-data graph scope"}
          className="px-3 py-1.5 text-xs rounded-md transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: graphSource === "live-gnn" ? "rgba(59,130,246,0.25)" : "transparent",
            color: graphSource === "live-gnn" ? "#93c5fd" : "#6b7280",
            border: graphSource === "live-gnn" ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
          }}
        >
          {liveLoading ? "Loading live…" : "Live GNN"}
        </button>
      </div>

      <div className="absolute top-[4.25rem] left-1/2 -translate-x-1/2 z-20 max-w-[90%] text-center text-[10px] leading-4 text-slate-300/80">
        {graphSource === "curated-demo" ? (
          <span>
            CURATED SAMPLE OF REAL DATASET ACCOUNTS · {demoGraph?.nodes.length ?? 0} accounts · {demoGraph?.links.length ?? 0} observed relationships · bounded source links only; accounts may be disconnected · flow motion is illustrative (no timestamps)
          </span>
        ) : (
          <>
            <span>
              LIVE REAL-DATA {snapshotMode === "connected" ? "CONNECTED REPRESENTATIVE SUBGRAPH" : snapshotMode === "risk-ranked" ? "RISK-RANKED SAMPLE" : `NEIGHBORHOOD · ${neighborhoodCenter ?? "select an account"}`}
              {" "}· GNN probability categories use the model threshold; fraud labels are separate · flow particles are illustrative (timestamps unavailable)
            </span>
            {liveEdgeSummary?.sampled && (
              <span className="block text-slate-400">
                Showing {liveEdgeSummary.displayed.toLocaleString()} of {liveEdgeSummary.available.toLocaleString()} actual relationships in this scope; remaining source links are omitted for readability.
              </span>
            )}
          </>
        )}
      </div>
      <div
        className="absolute top-[6.25rem] left-4 z-20 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
        style={{ background: "rgba(10,12,22,0.9)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <label className="text-[10px] text-slate-400" htmlFor="snapshot-mode">Live scope</label>
        <select
          id="snapshot-mode"
          aria-label="Live graph scope"
          value={snapshotMode}
          disabled={graphSource !== "live-gnn"}
          onChange={(event) => {
            const mode = event.target.value as SnapshotMode;
            if (mode === "neighborhood") {
              if (activeNodeId !== null) {
                setNeighborhoodCenter(String(activeNodeId));
                setSnapshotMode(mode);
              }
            } else {
              setNeighborhoodCenter(null);
              setSnapshotMode(mode);
            }
          }}
          className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-[10px] text-slate-200"
        >
          <option value="connected">Connected subgraph</option>
          <option value="risk-ranked">Risk-ranked sample</option>
          <option value="neighborhood" disabled={activeNodeId === null}>Selected neighborhood</option>
        </select>
        <label className="text-[10px] text-slate-400" htmlFor="snapshot-limit">Node limit</label>
        <select
          id="snapshot-limit"
          aria-label="Maximum accounts in live graph"
          value={snapshotLimit}
          disabled={graphSource !== "live-gnn"}
          onChange={(event) => setSnapshotLimit(Number(event.target.value))}
          className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-[10px] text-slate-200"
        >
          {[200, 400, 600, 800, 1000, 1200].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
        </select>
        {activeNodeId !== null && graphSource === "live-gnn" && snapshotMode !== "neighborhood" && (
          <button
            type="button"
            onClick={() => {
              setNeighborhoodCenter(String(activeNodeId));
              setSnapshotMode("neighborhood");
            }}
            className="rounded border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-200"
          >
            Explore selected account
          </button>
        )}
        {snapshotMode === "neighborhood" && (
          <button
            type="button"
            onClick={() => {
              setNeighborhoodCenter(null);
              setSnapshotMode("connected");
            }}
            className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300"
          >
            Reset scope
          </button>
        )}
      </div>
      {liveError && (
        <div role="status" className="absolute top-[7.5rem] left-1/2 -translate-x-1/2 z-20 rounded bg-black/80 px-3 py-1 text-[10px] text-amber-300">
          Live snapshot unavailable: {liveError}. The curated Demo sample remains separate.
        </div>
      )}
      {graphSource === "curated-demo" && (demoLoading || demoError) && (
        <div
          role={demoError ? "alert" : "status"}
          className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center text-sm text-slate-200"
          style={{ background: "rgba(5,8,20,0.82)" }}
        >
          {demoLoading ? "Loading curated real-account sample…" : `Curated Demo data unavailable: ${demoError}`}
        </div>
      )}

      {/* ── Guided Tour caption ── */}
      {tourActive && currentTourRing && (
        <div
          className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 max-w-md w-full"
          style={{
            background: "rgba(8,10,18,0.96)",
            border: "1px solid rgba(250,204,21,0.4)",
            borderRadius: "12px",
            padding: "16px 20px",
            backdropFilter: "blur(12px)",
            boxShadow: "0 0 30px rgba(250,204,21,0.15)",
          }}
        >
          {/* Progress dots */}
          <div className="flex gap-1.5 mb-3">
            {tourRings.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-all"
                style={{
                  background: i <= tourStep ? "#facc15" : "rgba(255,255,255,0.1)",
                }}
              />
            ))}
          </div>
          <div className="flex items-start gap-3">
            <div
              className="text-xs font-mono px-2 py-1 rounded flex-shrink-0"
              style={{
                background: "rgba(250,204,21,0.15)",
                color: "#facc15",
                border: "1px solid rgba(250,204,21,0.3)",
              }}
            >
              {currentTourRing.shape}
            </div>
            <div>
              <div className="text-sm font-semibold text-white mb-1">
                {currentTourRing.label}
              </div>
              <div className="text-xs text-gray-400 leading-relaxed">
                {currentTourRing.description}
              </div>
            </div>
          </div>
          <button
            onClick={stopTour}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition"
          >
            Stop tour ✕
          </button>
        </div>
      )}

      {/* ── Bottom controls ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        <button
          type="button"
          onClick={() => setFlowPaused((paused) => !paused)}
          aria-label={flowPaused ? "Resume illustrative transaction flow" : "Pause illustrative transaction flow"}
          title={graphSource === "live-gnn"
            ? "Particles follow real directed links; timing is illustrative because transaction timestamps are unavailable."
            : "Particles follow sampled real directed links; timing is illustrative because transaction timestamps are unavailable."}
          className="px-4 py-2 text-xs font-medium rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: "rgba(30,32,44,0.85)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#cbd5e1",
          }}
        >
          {flowPaused ? "▶ Resume flow" : "Ⅱ Pause flow"}
        </button>

        {/* Guided tour */}
        <button
          onClick={tourActive ? stopTour : startTour}
          disabled={!tourActive && tourRings.length === 0}
          className="px-4 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            background: tourActive
              ? "rgba(250,204,21,0.2)"
              : tourRings.length > 0 ? "rgba(250,204,21,0.1)" : "rgba(30,32,44,0.85)",
            border: "1px solid rgba(250,204,21,0.4)",
            color: tourRings.length > 0 ? "#facc15" : "#6b7280",
            cursor: tourRings.length > 0 ? "pointer" : "not-allowed",
          }}
        >
          {tourActive
            ? `⏹ Stop Tour (${tourStep + 1}/${tourRings.length})`
            : tourRings.length > 0
              ? "▶ Detective Tour"
              : graphSource === "curated-demo" ? "Live ring tour (switch source)" : "No detected rings"}
        </button>

        {/* Reset */}
        <button
          onClick={handleResetView}
          className="px-4 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            background: "rgba(30,32,44,0.85)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#9ca3af",
          }}
        >
          ↺ Reset View
        </button>

        {/* Bundle toggle */}
        <button
          onClick={() => {
            setIsBundled((v) => !v);
            hasFitted.current = false;
          }}
          className="px-4 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            background: isBundled
              ? "rgba(59,130,246,0.2)"
              : "rgba(30,32,44,0.85)",
            border: isBundled
              ? "1px solid rgba(59,130,246,0.5)"
              : "1px solid rgba(255,255,255,0.1)",
            color: isBundled ? "#60a5fa" : "#9ca3af",
          }}
        >
          ⬡ {isBundled ? "Bundled" : "Bundle Layout"}
        </button>
      </div>

      {/* ── Zoom controls ── */}
      <div className="absolute bottom-24 right-4 z-20 flex flex-col gap-2">
        {[
          { label: "+", fn: handleZoomIn },
          { label: "−", fn: handleZoomOut },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            className="w-9 h-9 rounded-full text-sm font-bold transition-all"
            style={{
              background: "rgba(10,12,22,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#9ca3af",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Risk legend ── */}
      <div
        className="absolute bottom-6 left-4 z-20 text-xs"
        style={{
          background: "rgba(10,12,22,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "10px",
          padding: "12px 14px",
        }}
      >
        <div className="text-gray-400 mb-2 font-mono text-[10px] uppercase tracking-wider">
          Account risk level
        </div>
        <div className="space-y-1.5">
          {[
            { level: "SAFE" as const, label: "LOW RISK (GNN)", count: visibleRiskCounts.SAFE },
            { level: "MEDIUM" as const, label: "MEDIUM RISK", count: visibleRiskCounts.MEDIUM },
            { level: "HIGH" as const, label: "HIGH RISK", count: visibleRiskCounts.HIGH },
            { level: "UNCLASSIFIED" as const, label: "UNCLASSIFIED", count: visibleRiskCounts.UNCLASSIFIED },
          ].map(({ level, label, count }) => (
            <div key={level} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" style={{ color: RISK_COLORS[level] }}>●</span>
                <span style={{ color: RISK_COLORS[level] }}>{label}</span>
              </span>
              <span className="font-mono text-gray-400">{count}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 max-w-48 text-[10px] leading-4 text-gray-500">
          A neighbor&apos;s risk is not inherited by this account.
        </p>
      </div>

      {Object.values(visibleRiskLevels).some((enabled) => !enabled) && (
        <div role="status" className="absolute bottom-24 left-4 z-20 max-w-52 rounded bg-black/80 px-2 py-1 text-[10px] leading-4 text-amber-200">
          Risk-level filters are active. Relationships to hidden accounts are hidden too.
        </div>
      )}

      {/* ── 3D Force Graph ── */}
      {dimensions.width > 0 && dimensions.height > 0 ? (
      <ForceGraph3D
        key={isBundled ? "bundled" : "free"}
        ref={fgRef}
        graphData={visibleGraph}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#050814"
        enableNodeDrag={false}
        linkWidth={getLinkWidth}
        linkColor={getLinkColor}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={0.82}
        linkDirectionalArrowColor={getLinkColor}
        linkDirectionalParticles={flowPaused ? 0 : 1}
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleSpeed={graphSource === "live-gnn" ? 0.0015 : 0.003}
        linkDirectionalParticleColor={getParticleColor}
        nodeLabel={getNodeLabel}
        nodeThreeObject={buildNodeObject}
        nodeThreeObjectExtend={false}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
          setActiveNodeId(null);
          onNodeSelect(null);
        }}
        d3AlphaDecay={isBundled ? 0.04 : 0.02}
        d3VelocityDecay={isBundled ? 0.6 : 0.28}
        onEngineStop={() => {
          if (!hasFitted.current) {
            fgRef.current?.zoomToFit(800, 48);
            hasFitted.current = true;
          }
        }}
      />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          Preparing graph viewport…
        </div>
      )}
      {visibleGraph.nodes.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none text-sm text-white/60">
          No graph records match the current filters.
        </div>
      )}
    </div>
  );
}