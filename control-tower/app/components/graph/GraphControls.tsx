"use client";

import React from "react";
import type { DatasetSummary, RiskLevel } from "./types";

interface GraphControlsProps {
  // filter state (owned by parent page)
  riskThreshold: number;
  setRiskThreshold: (v: number) => void;
  visibleRiskLevels: Record<RiskLevel, boolean>;
  setVisibleRiskLevels: React.Dispatch<React.SetStateAction<Record<RiskLevel, boolean>>>;
  showOnlyRings: boolean;
  setShowOnlyRings: (v: boolean) => void;
  searchId: string;
  setSearchId: (v: string) => void;
  onSearch: () => void;
  onReset: () => void;
  // stats
  totalNodes: number;
  safeNodes: number;
  mediumNodes: number;
  highNodes: number;
  unclassifiedNodes: number;
  rings: number;
  datasetSummary: DatasetSummary | null;
}

export default function GraphControls({
  riskThreshold,
  setRiskThreshold,
  visibleRiskLevels,
  setVisibleRiskLevels,
  showOnlyRings,
  setShowOnlyRings,
  searchId,
  setSearchId,
  onSearch,
  onReset,
  totalNodes,
  safeNodes,
  mediumNodes,
  highNodes,
  unclassifiedNodes,
  rings,
  datasetSummary,
}: GraphControlsProps) {
  const lowRiskLabel = "LOW RISK (GNN)";
  const riskLevels: { level: RiskLevel; label: string; color: string; count: number }[] = [
    { level: "SAFE", label: lowRiskLabel, color: "#22c55e", count: safeNodes },
    { level: "MEDIUM", label: "MEDIUM RISK", color: "#eab308", count: mediumNodes },
    { level: "HIGH", label: "HIGH RISK", color: "#ef4444", count: highNodes },
    { level: "UNCLASSIFIED", label: "UNCLASSIFIED", color: "#94a3b8", count: unclassifiedNodes },
  ];

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col gap-0 overflow-y-auto"
      style={{
        background: "rgba(8,10,18,0.92)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="text-[10px] font-mono uppercase tracking-widest mb-1"
          style={{ color: "#4b5563" }}
        >
          PRISM
        </div>
        <div className="text-sm font-semibold text-white">
          Transaction Network
        </div>
        <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
          {totalNodes.toLocaleString()} accounts in current graph scope
        </div>
      </div>

      {datasetSummary && (
        <div className="px-4 py-4 space-y-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionLabel>Full source dataset · GNN scores</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Accounts", value: datasetSummary.totalAccounts.toLocaleString(), color: "#cbd5e1" },
              { label: "Transactions", value: datasetSummary.totalTransactions.toLocaleString(), color: "#cbd5e1" },
              {
                label: "Fraud-labeled",
                value: `${datasetSummary.fraudLabeledAccounts.toLocaleString()} (${datasetSummary.fraudLabeledPercentage.toFixed(2)}%)`,
                color: "#f87171",
              },
              { label: "With relationships", value: datasetSummary.accountsWithRelationships.toLocaleString(), color: "#93c5fd" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-md px-2.5 py-2" style={{ background: "rgba(255,255,255,0.035)" }}>
                <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-xs font-mono font-semibold" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] leading-4 text-slate-400">
            GNN score distribution (not ground-truth labels): Low {datasetSummary.lowRiskAccounts.toLocaleString()} ·
            Medium {datasetSummary.mediumRiskAccounts.toLocaleString()} ·
            High {datasetSummary.highRiskAccounts.toLocaleString()} ·
            Unclassified {datasetSummary.unclassifiedAccounts.toLocaleString()}.
            {" "}Thresholds: Medium ≥ {(datasetSummary.mediumThreshold * 100).toFixed(0)}%, High ≥ {(datasetSummary.highThreshold * 100).toFixed(0)}%.
          </div>
        </div>
      )}

      {/* Risk-tier counts for the selected graph dataset */}
      <div
        className="grid grid-cols-2 gap-px"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {riskLevels.map(({ label, count, color }) => (
          <div
            key={label}
            className="flex flex-col items-center py-3"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            <span className="text-sm font-mono font-bold" style={{ color }}>
              {count.toLocaleString()}
            </span>
            <span className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <SectionLabel>Search Account</SectionLabel>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Account ID…"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            className="flex-1 px-3 py-2 text-xs rounded-md text-white placeholder-gray-600 outline-none transition"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          />
          <button
            onClick={onSearch}
            className="px-3 py-2 text-xs rounded-md transition"
            style={{
              background: "rgba(59,130,246,0.2)",
              border: "1px solid rgba(59,130,246,0.4)",
              color: "#60a5fa",
            }}
          >
            ↵
          </button>
        </div>
      </div>

      {/* Risk threshold */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex justify-between items-center mb-2">
          <SectionLabel>Minimum Risk Score</SectionLabel>
          <span className="text-xs font-mono" style={{ color: "#ef4444" }}>
            {(riskThreshold * 100).toFixed(0)}%+
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={riskThreshold}
          onChange={(e) => setRiskThreshold(Number(e.target.value))}
          className="w-full accent-red-500"
          style={{ cursor: "pointer" }}
        />
        {/* Color bar */}
        <div className="flex mt-1.5 gap-px rounded-full overflow-hidden h-1.5">
          {Array.from({ length: 20 }).map((_, i) => {
            const pct = i / 19;
            const active = pct >= riskThreshold;
            return (
              <div
                key={i}
                className="flex-1 transition-opacity"
                style={{
                  background: `hsl(${120 - pct * 120}, 80%, 45%)`,
                  opacity: active ? 1 : 0.18,
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] mt-1" style={{ color: "#4b5563" }}>
          <span>Lower score</span>
          <span>Higher score</span>
        </div>
      </div>

      {/* Risk tier filters */}
      <div
        className="px-4 py-4 flex flex-col gap-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Show Risk Levels</SectionLabel>
          <button
            type="button"
            onClick={() => setVisibleRiskLevels({ SAFE: true, MEDIUM: true, HIGH: true, UNCLASSIFIED: true })}
            className="text-[10px] text-blue-300 hover:text-blue-200"
          >
            Show all
          </button>
        </div>

        {riskLevels.map(({ level, label, color, count }) => (
          <Toggle
            key={level}
            checked={visibleRiskLevels[level]}
            onChange={(checked) => setVisibleRiskLevels((current) => ({ ...current, [level]: checked }))}
            color={color}
            label={label}
            sublabel={`${count.toLocaleString()} accounts in this graph scope`}
          />
        ))}
        <Toggle
          checked={showOnlyRings}
          onChange={setShowOnlyRings}
          color="#facc15"
          label="Detected ring members only"
          sublabel={rings > 0 ? `${rings.toLocaleString()} live detected rings` : "Available in Live GNN mode"}
          disabled={rings === 0}
        />
        <p className="text-[10px] leading-4 text-gray-500">
          Hidden accounts also hide their links; remaining connections reflect only the visible subset.
        </p>
      </div>

      {/* Risk-level legend */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <SectionLabel>Risk Legend</SectionLabel>
        <div className="mt-2 space-y-2.5">
          {riskLevels.map(({ level, label, color }) => (
            <div key={level} className="flex items-start gap-2.5">
              <div
                className="mt-0.5 flex-shrink-0 w-3 h-3 rounded-full"
                style={{
                  background: `${color}33`,
                  border: `1.5px solid ${color}`,
                }}
              />
              <div>
                <div className="text-xs font-medium" style={{ color }}>
                  {label}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>
                  {level === "SAFE" ? "GNN score below the configured medium threshold; not a safe label" :
                    level === "MEDIUM" ? "Additional review" :
                      level === "HIGH" ? "High model score" : "No model score available"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reset */}
      <div className="px-4 pb-5 mt-auto">
        <button
          onClick={onReset}
          className="w-full py-2 text-xs rounded-lg transition"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#6b7280",
          }}
        >
          ↺ Reset All Filters
        </button>
      </div>
    </aside>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-mono uppercase tracking-widest"
      style={{ color: "#4b5563" }}
    >
      {children}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, color, label, sublabel, disabled = false }: ToggleProps) {
  return (
    <label className={`flex items-start gap-3 group ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      {/* Custom toggle */}
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
          disabled={disabled}
          aria-label={label}
        />
        <div
          className="w-8 h-4.5 rounded-full transition-all"
          style={{
            background: checked ? `${color}44` : "rgba(255,255,255,0.08)",
            border: checked ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.12)",
            width: 32,
            height: 18,
          }}
        >
          <div
            className="absolute top-0.5 rounded-full transition-all"
            style={{
              width: 14,
              height: 14,
              background: checked ? color : "#4b5563",
              transform: checked ? "translateX(15px)" : "translateX(2px)",
            }}
          />
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-300 group-hover:text-white transition">
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>
            {sublabel}
          </div>
        )}
      </div>
    </label>
  );
}