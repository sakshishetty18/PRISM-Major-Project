import type * as THREE from "three";

export type RiskLevel = "SAFE" | "MEDIUM" | "HIGH" | "UNCLASSIFIED";
export type GraphSource = "curated-demo" | "live-gnn";

export interface ConnectedAccount {
  id: string | number;
  riskLevel: RiskLevel;
  direction: "incoming" | "outgoing";
  amount?: number;
  isFraudEdge?: boolean;
}

export interface GraphNode {
  id: string | number;
  is_anomalous: boolean;
  is_fraud_labeled?: boolean;
  anomalyScore?: number;
  riskThreshold?: number;
  highRiskThreshold?: number;
  riskLevel?: RiskLevel;
  sourceType?: GraphSource;
  volume?: number;
  pagerank?: number;
  role?: "HUB" | "BRIDGE" | "MULE" | "NORMAL";
  clusterId?: number;
  clusterFraudRate?: number;
  ringIds?: number[];
  is_ring_member?: boolean;
  shapFactors?: { label: string; value: number }[];
  connectedAccounts?: ConnectedAccount[];
  accountAgeDays?: number;
  meanBalanceFeature?: number;
  txCount?: number;
  inDegree?: number;
  outDegree?: number;
  incomingAmount?: number;
  outgoingAmount?: number;
  communityFraudRate?: number;
  x?: number;
  y?: number;
  z?: number;
  __threeObj?: THREE.Object3D;
}

export interface GraphLink {
  source: string | number | GraphNode;
  target: string | number | GraphNode;
  weight?: number;
  amount?: number;
  isFraudEdge?: boolean;
}

export interface RawGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphCounts {
  totalNodes: number;
  totalEdges: number;
  safeNodes: number;
  mediumNodes: number;
  highNodes: number;
  unclassifiedNodes: number;
  rings: number;
}

export interface DatasetSummary {
  totalAccounts: number;
  totalTransactions: number;
  accountsWithRelationships: number;
  fraudLabeledAccounts: number;
  fraudLabeledPercentage: number;
  classifiedAccounts: number;
  lowRiskAccounts: number;
  mediumRiskAccounts: number;
  highRiskAccounts: number;
  unclassifiedAccounts: number;
  mediumThreshold: number;
  highThreshold: number;
  scoreField: string;
}

export function riskLevelFromScore(score: number | undefined): RiskLevel {
  if (score === undefined || !Number.isFinite(score)) return "UNCLASSIFIED";
  if (score >= 0.75) return "HIGH";
  if (score >= 0.35) return "MEDIUM";
  return "SAFE";
}

export function riskLevelForNode(node: Pick<GraphNode, "riskLevel" | "anomalyScore">): RiskLevel {
  return node.riskLevel ?? riskLevelFromScore(node.anomalyScore);
}
