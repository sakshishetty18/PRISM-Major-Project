"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import GraphControls from "../components/graph/GraphControls";
import { NodeInspector } from "../components/graph/NodeInspector";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import type { DatasetSummary, GraphCounts, GraphNode, GraphSource, RiskLevel } from "../components/graph/types";

const FraudGraph3D = dynamic(
  () => import("../components/graph/FraudGraph3D"),
  { ssr: false }
);

export default function NetworkPage() {
  // ── Node selection ──
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [graphSource, setGraphSource] = useState<GraphSource>("curated-demo");

  // ── Filter state ──
  const [riskThreshold, setRiskThreshold] = useState<number>(0);
  const [visibleRiskLevels, setVisibleRiskLevels] = useState<Record<RiskLevel, boolean>>({
    SAFE: true,
    MEDIUM: true,
    HIGH: true,
    UNCLASSIFIED: true,
  });
  const [showOnlyRings, setShowOnlyRings] = useState<boolean>(false);
  const [searchId, setSearchId] = useState<string>("");
  const [searchTrigger, setSearchTrigger] = useState<string>("");
  const [searchVersion, setSearchVersion] = useState(0);

  // ── Stats lifted from graph ──
  const [stats, setStats] = useState<GraphCounts>({
    totalNodes: 0,
    totalEdges: 0,
    safeNodes: 0,
    mediumNodes: 0,
    highNodes: 0,
    unclassifiedNodes: 0,
    rings: 0,
  });
  const [datasetSummary, setDatasetSummary] = useState<DatasetSummary | null>(null);

  const handleSearch = useCallback(() => {
    setSearchTrigger(searchId.trim());
    setSearchVersion((version) => version + 1);
  }, [searchId]);

  const clearSearch = useCallback(() => {
    setSearchId("");
    setSearchTrigger("");
    setSearchVersion((version) => version + 1);
  }, []);

  const handleReset = useCallback(() => {
    setRiskThreshold(0);
    setVisibleRiskLevels({ SAFE: true, MEDIUM: true, HIGH: true, UNCLASSIFIED: true });
    setShowOnlyRings(false);
    clearSearch();
    setSelectedNode(null);
  }, [clearSearch]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black">
      <Navbar />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left sidebar */}
        <GraphControls
          riskThreshold={riskThreshold}
          setRiskThreshold={setRiskThreshold}
          visibleRiskLevels={visibleRiskLevels}
          setVisibleRiskLevels={setVisibleRiskLevels}
          showOnlyRings={showOnlyRings}
          setShowOnlyRings={setShowOnlyRings}
          searchId={searchId}
          setSearchId={setSearchId}
          onSearch={handleSearch}
          onReset={handleReset}
          totalNodes={stats.totalNodes}
          safeNodes={stats.safeNodes}
          mediumNodes={stats.mediumNodes}
          highNodes={stats.highNodes}
          unclassifiedNodes={stats.unclassifiedNodes}
          rings={stats.rings}
          datasetSummary={datasetSummary}
        />

        {/* 3D Graph canvas — fills remaining space */}
        <div className="flex-1 relative min-w-0 min-h-0">
          <FraudGraph3D
            onNodeSelect={setSelectedNode}
            selectedNode={selectedNode}
            graphSource={graphSource}
            onGraphSourceChange={(source) => {
              setGraphSource(source);
              setSelectedNode(null);
            }}
            riskThreshold={riskThreshold}
            visibleRiskLevels={visibleRiskLevels}
            showOnlyRings={showOnlyRings}
            searchId={searchTrigger}
            searchVersion={searchVersion}
            onClearSearch={clearSearch}
            onStatsUpdate={setStats}
            onDatasetSummaryUpdate={setDatasetSummary}
          />
        </div>

        {/* Right panel: node inspector */}
        {selectedNode && (
          <NodeInspector
            key={`${selectedNode.sourceType ?? "unknown"}-${selectedNode.id}`}
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onAccountSelect={(id) => {
              const account = selectedNode.connectedAccounts?.find((candidate) => String(candidate.id) === String(id));
              if (!account) return;
              setSearchId(String(id));
              setSearchTrigger(String(id));
              setSearchVersion((version) => version + 1);
              setSelectedNode(null);
            }}
          />
        )}
      </div>

      <Footer />
    </div>
  );
}