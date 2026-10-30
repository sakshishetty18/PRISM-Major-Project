import type { GraphLink, GraphNode, RawGraph, RiskLevel } from "./types";

type SnapshotRecord = Record<string, unknown>;

export interface CuratedDemoSnapshot {
  nodes: SnapshotRecord[];
  edges: SnapshotRecord[];
}

const DEMO_CATEGORY_LIMIT = 20;
const DEMO_RISK_LEVELS = ["SAFE", "MEDIUM", "HIGH"] as const;

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function readRiskLevel(value: unknown): RiskLevel | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.toUpperCase()) {
    case "LOW":
      return "SAFE";
    case "MEDIUM":
      return "MEDIUM";
    case "HIGH":
      return "HIGH";
    default:
      return undefined;
  }
}

function createAccount(record: SnapshotRecord): GraphNode | undefined {
  const id = record.id ?? record.node_id;
  const score = readNumber(record.gnn_score);
  const riskLevel = readRiskLevel(record.risk_level);
  if (id === null || id === undefined || score === undefined || riskLevel === undefined) return undefined;

  const fraudLabel = readBoolean(record.is_fraud);
  const ringMembership = readNumber(record.ring_membership) ?? 0;

  return {
    id: String(id),
    is_anomalous: riskLevel === "HIGH",
    ...(fraudLabel === undefined ? {} : { is_fraud_labeled: fraudLabel }),
    anomalyScore: Math.max(0, Math.min(1, score)),
    riskLevel,
    riskThreshold: readNumber(record.risk_threshold),
    highRiskThreshold: readNumber(record.high_risk_threshold),
    sourceType: "curated-demo",
    volume: readNumber(record.tx_count),
    pagerank: readNumber(record.pagerank),
    clusterId: readNumber(record.community_id),
    clusterFraudRate: readNumber(record.community_fraud_rate),
    is_ring_member: readBoolean(record.is_ring_member) ?? ringMembership > 0,
    accountAgeDays: readNumber(record.account_age_days),
    meanBalanceFeature: readNumber(record.balance_mean),
    txCount: readNumber(record.tx_count),
    inDegree: readNumber(record.in_degree),
    outDegree: readNumber(record.out_degree),
    incomingAmount: readNumber(record.incoming_amount),
    outgoingAmount: readNumber(record.outgoing_amount),
    communityFraudRate: readNumber(record.community_fraud_rate),
  };
}

function compareCandidates(left: GraphNode, right: GraphNode, degree: Map<string, number>): number {
  const degreeDifference = (degree.get(String(right.id)) ?? 0) - (degree.get(String(left.id)) ?? 0);
  if (degreeDifference !== 0) return degreeDifference;
  if (left.anomalyScore !== right.anomalyScore) {
    return (left.anomalyScore ?? 0) - (right.anomalyScore ?? 0);
  }
  return String(left.id).localeCompare(String(right.id));
}

function createAccountRelationship(record: SnapshotRecord, accountIds: Set<string>): GraphLink | undefined {
  const source = record.source;
  const target = record.target;
  if (source === null || source === undefined || target === null || target === undefined) return undefined;

  const sourceId = String(source);
  const targetId = String(target);
  if (sourceId === targetId || !accountIds.has(sourceId) || !accountIds.has(targetId)) return undefined;

  const amount = readNumber(record.amount);
  const isFraudEdge = readBoolean(record.is_fraud_edge);
  return {
    source: sourceId,
    target: targetId,
    ...(amount === undefined ? {} : { amount, weight: amount }),
    ...(isFraudEdge === undefined ? {} : { isFraudEdge }),
  };
}

export function buildCuratedDemoNetwork(snapshot: CuratedDemoSnapshot): RawGraph {
  if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    throw new Error("Curated demo snapshot must contain node and edge lists");
  }

  const sourceNodes = snapshot.nodes.flatMap((record) => {
    const node = createAccount(record);
    return node ? [node] : [];
  });
  const sourceNodeIds = new Set(sourceNodes.map((node) => String(node.id)));
  const degree = new Map<string, number>();
  const sourceEdges = snapshot.edges.flatMap((record) => {
    const edge = createAccountRelationship(record, sourceNodeIds);
    if (!edge) return [];
    const source = String(edge.source);
    const target = String(edge.target);
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
    return [edge];
  });

  const selectedNodes = DEMO_RISK_LEVELS.flatMap((riskLevel) =>
    sourceNodes
      .filter((node) => node.riskLevel === riskLevel)
      .sort((left, right) => compareCandidates(left, right, degree))
      .slice(0, DEMO_CATEGORY_LIMIT),
  );
  const selectedIds = new Set(selectedNodes.map((node) => String(node.id)));
  const selectedEdges = sourceEdges.filter((edge) =>
    selectedIds.has(String(edge.source)) && selectedIds.has(String(edge.target)),
  );

  return { nodes: selectedNodes, links: selectedEdges };
}
