import { describe, expect, it } from "vitest";
import { buildCuratedDemoNetwork } from "../app/components/graph/demoNetwork";
import { riskLevelFromScore } from "../app/components/graph/types";
import { applyStableLayout } from "../app/lib/bundleLayout";

function createSnapshot(low = 22, medium = 22, high = 22) {
  const nodes: Record<string, unknown>[] = [
    ...Array.from({ length: low }, (_, index) => ({
      id: `real-low-${String(index).padStart(2, "0")}`,
      gnn_score: 0.1 + (index % 10) / 100,
      risk_level: "LOW",
      is_fraud: index % 2,
      risk_threshold: 0.5,
      high_risk_threshold: 0.65,
      account_age_days: 120 + index,
      tx_count: 10 + index,
      balance_mean: 25.5 + index,
    })),
    ...Array.from({ length: medium }, (_, index) => ({
      id: `real-medium-${String(index).padStart(2, "0")}`,
      gnn_score: 0.5 + (index % 10) / 100,
      risk_level: "MEDIUM",
      is_fraud: 0,
      risk_threshold: 0.5,
      high_risk_threshold: 0.65,
    })),
    ...Array.from({ length: high }, (_, index) => ({
      id: `real-high-${String(index).padStart(2, "0")}`,
      gnn_score: 0.7 + (index % 10) / 100,
      risk_level: "HIGH",
      is_fraud: 1,
      risk_threshold: 0.5,
      high_risk_threshold: 0.65,
    })),
  ];

  const edges: Record<string, unknown>[] = [
      { source: "real-low-00", target: "real-medium-00", amount: 25.5, is_fraud_edge: 0 },
      { source: "real-medium-00", target: "real-high-00", amount: 50, is_fraud_edge: 1 },
      { source: "real-high-00", target: "outside-sample", amount: 99, is_fraud_edge: 0 },
  ];

  return {
    nodes,
    edges,
  };
}

describe("curated real-data Demo graph", () => {
  it("selects up to 20 real scored accounts from each existing GNN category", () => {
    const snapshot = createSnapshot();
    const graph = buildCuratedDemoNetwork(snapshot);
    const counts = graph.nodes.reduce(
      (result, node) => {
        result[node.riskLevel ?? "UNCLASSIFIED"] += 1;
        return result;
      },
      { SAFE: 0, MEDIUM: 0, HIGH: 0, UNCLASSIFIED: 0 },
    );

    expect(counts).toEqual({ SAFE: 20, MEDIUM: 20, HIGH: 20, UNCLASSIFIED: 0 });
    expect(graph.nodes).toHaveLength(60);
    expect(graph.nodes.every((node) => snapshot.nodes.some((record) => record.id === node.id))).toBe(true);
    expect(graph.nodes.every((node) => node.sourceType === "curated-demo")).toBe(true);

    const lowAccount = graph.nodes.find((node) => node.id === "real-low-00");
    const highAccount = graph.nodes.find((node) => node.id === "real-high-00");
    expect(lowAccount).toMatchObject({
      anomalyScore: 0.1,
      riskLevel: "SAFE",
      is_fraud_labeled: false,
      riskThreshold: 0.5,
      highRiskThreshold: 0.65,
      accountAgeDays: 120,
      txCount: 10,
      meanBalanceFeature: 25.5,
    });
    expect(highAccount).toMatchObject({
      anomalyScore: 0.7,
      riskLevel: "HIGH",
      is_fraud_labeled: true,
    });
  });

  it("keeps only source relationships between selected accounts and allows disconnected accounts", () => {
    const snapshot = createSnapshot();
    const graph = buildCuratedDemoNetwork(snapshot);
    const selectedIds = new Set(graph.nodes.map((node) => String(node.id)));

    expect(graph.links).toEqual([
      { source: "real-low-00", target: "real-medium-00", amount: 25.5, weight: 25.5, isFraudEdge: false },
      { source: "real-medium-00", target: "real-high-00", amount: 50, weight: 50, isFraudEdge: true },
    ]);
    expect(graph.links.every((link) =>
      selectedIds.has(String(link.source)) && selectedIds.has(String(link.target)),
    )).toBe(true);
    expect(new Set(graph.links.map((link) => `${link.source}->${link.target}`)).size).toBe(graph.links.length);
  });

  it("uses only available accounts when a GNN category has fewer candidates", () => {
    const graph = buildCuratedDemoNetwork(createSnapshot(2, 1, 3));

    expect(graph.nodes).toHaveLength(6);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "real-low-00",
      "real-low-01",
      "real-medium-00",
      "real-high-00",
      "real-high-01",
      "real-high-02",
    ]);
    expect(graph.links).toHaveLength(2);
  });

  it("does not invent a score or risk category for unscored source records", () => {
    const snapshot = createSnapshot(1, 1, 1);
    snapshot.nodes.push(
      { id: "real-unscored", risk_level: "LOW", is_fraud: 0 },
      { id: "real-missing-category", gnn_score: 0.2, is_fraud: 0 },
    );
    snapshot.edges.push(
      { source: "real-low-00", target: "real-unscored", amount: 5 },
      { source: "real-low-00", target: "real-missing-category", amount: 6 },
    );

    const graph = buildCuratedDemoNetwork(snapshot);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "real-low-00",
      "real-medium-00",
      "real-high-00",
    ]);
    expect(graph.links.map((link) => `${link.source}->${link.target}`)).toEqual([
      "real-low-00->real-medium-00",
      "real-medium-00->real-high-00",
    ]);
  });

  it("creates deterministic finite layout coordinates without changing source relationships", () => {
    const graph = buildCuratedDemoNetwork(createSnapshot());
    const firstLayout = applyStableLayout(graph);
    const secondLayout = applyStableLayout(graph);

    expect(firstLayout.nodes.map(({ x, y, z }) => [x, y, z])).toEqual(
      secondLayout.nodes.map(({ x, y, z }) => [x, y, z]),
    );
    expect(firstLayout.nodes.every((node) =>
      [node.x, node.y, node.z].every((coordinate) => Number.isFinite(coordinate)),
    )).toBe(true);
    expect(firstLayout.nodes).toHaveLength(60);
    expect(firstLayout.links).toHaveLength(graph.links.length);
  });

  it("assigns the documented account risk tiers at their boundaries", () => {
    expect(riskLevelFromScore(0.34)).toBe("SAFE");
    expect(riskLevelFromScore(0.35)).toBe("MEDIUM");
    expect(riskLevelFromScore(0.74)).toBe("MEDIUM");
    expect(riskLevelFromScore(0.75)).toBe("HIGH");
    expect(riskLevelFromScore(undefined)).toBe("UNCLASSIFIED");
  });
});
