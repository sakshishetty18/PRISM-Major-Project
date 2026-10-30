"use client";

import React from "react";
import { riskLevelForNode, type GraphNode, type RiskLevel } from "./types";

interface NodeInspectorProps {
  node: GraphNode;
  onClose: () => void;
  onAccountSelect: (id: string | number) => void;
}

function riskColor(score: number): string {
  if (score >= 0.75) return "#ef4444";
  if (score >= 0.35) return "#eab308";
  return "#22c55e";
}

function riskLevelColor(level: RiskLevel): string {
  if (level === "HIGH") return "#ef4444";
  if (level === "MEDIUM") return "#eab308";
  return "#22c55e";
}

function roleColor(role: string | undefined): string {
  switch (role) {
    case "HUB":    return "#ef4444";
    case "BRIDGE": return "#f97316";
    case "MULE":   return "#94a3b8";
    default:       return "#22c55e";
  }
}

function fmt(val: string | number | undefined | null, decimals = 2): string {
  const n = Number(val);
  if (val === null || val === undefined || val === "" || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function Row({ label, value, valueColor }: {
  label: string; value: React.ReactNode; valueColor?: string;
}) {
  return (
    <div className="flex justify-between items-center py-2"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-xs font-medium text-white opacity-70">{label}</span>
      <span className="text-xs font-mono font-bold" style={{ color: valueColor ?? "#fff" }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-[11px] font-mono uppercase tracking-widest mb-2 font-semibold"
        style={{ color: "rgba(255,255,255,0.35)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function RiskGauge({ score, level }: { score: number | undefined; level: RiskLevel }) {
  const r = 50, cx = 60, cy = 60;
  const arcLen = Math.PI * r;
  const offset = score === undefined ? arcLen : arcLen - arcLen * Math.max(0, Math.min(1, score));
  const color  = riskLevelColor(level);
  const d      = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg width={120} height={72} viewBox="0 0 120 72">
      <path d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${arcLen} ${arcLen}`} strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={24} fontWeight="bold"
        fontFamily="monospace" fill={color}>{score === undefined ? "—" : `${(score * 100).toFixed(0)}%`}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={9}
        fontFamily="monospace" fill="rgba(255,255,255,0.4)" letterSpacing={1.5}>RISK SCORE</text>
    </svg>
  );
}

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
    </div>
  );
}

export function NodeInspector({ node, onClose, onAccountSelect }: NodeInspectorProps) {
  const hasModelDetails = node.sourceType === "curated-demo" || node.sourceType === "live-gnn";
  const anomalyScore = node.anomalyScore;
  const riskLevel = riskLevelForNode({ riskLevel: node.riskLevel, anomalyScore });
  const groundTruthLabel = node.is_fraud_labeled;
  const role = node.role;
  const inDeg = Number(node.inDegree ?? 0);
  const outDeg = Number(node.outDegree ?? 0);
  const maxDeg     = Math.max(inDeg, outDeg, 1);
  const pagerank = Number(node.pagerank ?? 0);
  const acctAge = Number(node.accountAgeDays ?? 0);
  const meanBalanceFeature = Number(node.meanBalanceFeature ?? 0);
  const txCount = Number(node.txCount ?? node.volume ?? 0);
  const totalIn = Number(node.incomingAmount ?? 0);
  const totalOut = Number(node.outgoingAmount ?? 0);

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col overflow-y-auto"
      style={{ background: "rgba(8,10,18,0.97)", borderLeft: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(14px)" }}>

      {/* Header */}
      <div className="px-4 py-4 flex items-start justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest mb-1 font-semibold"
            style={{ color: "rgba(255,255,255,0.4)" }}>Node Inspector</div>
          <div className="text-base font-bold text-white font-mono">Account #{String(node.id)}</div>
          <div className="text-[10px] mt-1 text-slate-400">
            {node.sourceType === "curated-demo" ? "Curated sample of real dataset accounts" : "Live GNN sample account"}
          </div>
        </div>
        <button onClick={onClose}
          className="text-white opacity-40 hover:opacity-90 transition text-xl leading-none mt-1">✕</button>
      </div>

      {/* Gauge + badges */}
      <div className="flex flex-col items-center py-5 gap-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <RiskGauge score={anomalyScore} level={riskLevel} />
        <div className="flex gap-2 flex-wrap justify-center">
          <div className="px-3 py-1 rounded-full text-xs font-mono font-bold"
            style={{
              background: `${riskLevelColor(riskLevel)}22`,
              border: `1px solid ${riskLevelColor(riskLevel)}77`,
              color: riskLevelColor(riskLevel),
            }}>
            {riskLevel === "SAFE" ? "LOW RISK (GNN)" :
              riskLevel === "MEDIUM" ? "MEDIUM RISK" :
                riskLevel === "HIGH" ? "HIGH RISK" : "UNCLASSIFIED"}
          </div>
          {role && <div className="px-3 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider"
            style={{
              background: `${roleColor(role)}1a`,
              border: `1px solid ${roleColor(role)}55`,
              color: roleColor(role),
            }}>
            {role}
          </div>}
          {groundTruthLabel !== undefined && (
            <div className="w-full text-center text-[10px] text-slate-400">
              Dataset label: {groundTruthLabel ? "Fraud-labeled" : "Not fraud-labeled"} (separate from model risk; not proof of safe behavior)
            </div>
          )}
        </div>
      </div>

      {/* Account overview */}
      {hasModelDetails && (
        <Section title="Account Overview">
          <Row label="Account Age"
            value={`${fmt(acctAge, 0)} days`}
            valueColor={acctAge < 30 ? "#f97316" : "#fff"} />
          <Row label="Mean balance feature" value={fmt(meanBalanceFeature)} />
          <Row label="Transactions in source data" value={fmt(txCount, 0)} />
          <Row label="PageRank" value={pagerank.toFixed(6)} valueColor="#60a5fa" />
        </Section>
      )}

      {/* Transaction flow */}
      {hasModelDetails && (
        <Section title="Transaction Flow">
          <Row label="Incoming amount total" value={fmt(totalIn)} valueColor="#22c55e" />
          <Row label="Outgoing amount total" value={fmt(totalOut)} valueColor="#ef4444" />
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Amounts are dataset values. No transaction timestamps are available.
          </p>
        </Section>
      )}

      {/* Graph topology */}
      <Section title="Graph Topology">
        {hasModelDetails && (
          <>
            <div className="mb-1">
              <Row label="In-Degree" value={fmt(inDeg, 0)} valueColor={inDeg > 50 ? "#ef4444" : "#fff"} />
              <StatBar value={inDeg} max={maxDeg} color="#60a5fa" />
            </div>
            <div className="mb-1">
              <Row label="Out-Degree" value={fmt(outDeg, 0)} valueColor={outDeg > 50 ? "#ef4444" : "#fff"} />
              <StatBar value={outDeg} max={maxDeg} color="#f97316" />
            </div>
          </>
        )}
        <Row label="PageRank" value={pagerank.toFixed(4)} valueColor="#60a5fa" />
        {node.volume !== undefined && <Row label="Transaction count" value={node.volume} />}
        {node.clusterId !== undefined && <Row label="Cluster ID" value={String(node.clusterId)} />}
        {node.clusterFraudRate !== undefined && (
          <Row label="Cluster Fraud Rate"
            value={`${((node.clusterFraudRate ?? 0) * 100).toFixed(1)}%`}
            valueColor={riskColor(node.clusterFraudRate ?? 0)} />
        )}
        {node.ringIds && node.ringIds.length > 0 && (
          <Row label="Ring IDs" value={node.ringIds.join(", ")} valueColor="#facc15" />
        )}
      </Section>

      <Section title={`Visible relationships (${node.connectedAccounts?.length ?? 0})`}>
        {node.connectedAccounts?.length ? (
          <div className="space-y-2">
            {node.connectedAccounts.map((account) => (
              <button
                key={`${account.direction}-${String(account.id)}`}
                type="button"
                onClick={() => onAccountSelect(account.id)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs transition hover:bg-white/5"
                aria-label={`Select ${account.direction} relationship account ${String(account.id)}`}
              >
                <span>
                  <span className="block font-mono text-slate-300">
                    {account.direction === "outgoing" ? "Outgoing →" : "Incoming ←"} Account #{String(account.id)}
                  </span>
                  <span className="mt-1 block text-[10px] text-slate-500">
                    {account.amount === undefined ? "Select connected account" : `Amount ${fmt(account.amount)} · select account`}
                    {account.isFraudEdge === undefined ? "" : ` · edge label ${account.isFraudEdge ? "1" : "0"}`}
                  </span>
                </span>
                <span className="shrink-0 font-semibold" style={{ color: riskLevelColor(account.riskLevel) }}>
                  {account.riskLevel === "SAFE" ? "LOW RISK (GNN)" :
                    account.riskLevel === "MEDIUM" ? "MEDIUM RISK" :
                      account.riskLevel === "HIGH" ? "HIGH RISK" : "UNCLASSIFIED"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No visible linked accounts under the current filters.</p>
        )}
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Direction and source amount come from the transaction record. The list is limited to visible relationships.
        </p>
      </Section>

      {/* Risk signals */}
      {hasModelDetails && (
        <Section title="Risk Signals">
          <Row label="Anomaly Score"
            value={anomalyScore === undefined ? "Unavailable" : `${(anomalyScore * 100).toFixed(2)}%`}
            valueColor={riskLevelColor(riskLevel)} />
          <Row label="GNN category thresholds"
            value={node.riskThreshold === undefined || node.highRiskThreshold === undefined
              ? "Unavailable"
              : `Medium ≥ ${(node.riskThreshold * 100).toFixed(0)}% · High ≥ ${(node.highRiskThreshold * 100).toFixed(0)}%`}
            valueColor="#cbd5e1" />
        </Section>
      )}

      
    </aside>
  );
}

export default NodeInspector;