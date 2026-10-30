"use client";

import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Activity, ShieldAlert, RefreshCw, Zap, TrendingUp, Cpu, Gauge, Layers } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8082";

type LiveEvent = {
  time: string;
  message: string;
  accountId: string;
  severity: string;
};

type StatsResponse = {
  throughputTps: number | null;
  avgDetectionLatencyMs: number | null;
  muleAccountsBlocked: number;
  muleAccountsBlockedToday: number;
  systemScalabilityTxDay: number;
  detectionAccuracy: number | null;
  falsePositiveRate: number | null;
  targetVariance: number;
  accountsFrozenPct: number;
  flaggedForReviewPct: number;
  policeReferralsPct: number;
  valueInterceptedCrores: number;
  totalTransactions: number;
  maxScalabilityMDay: number;
  liveEvents: LiveEvent[];
};

function formatNumber(value: number | null | undefined, maximumFractionDigits = 2) {
  return value == null || !Number.isFinite(value)
    ? "Not measured"
    : value.toLocaleString("en-IN", { maximumFractionDigits });
}

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "Not measured"
    : `${(value * 100).toFixed(2)}%`;
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/stats`);
        if (!res.ok) throw new Error(`Stats API returned HTTP ${res.status}`);
        const data: StatsResponse = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        console.error("Error fetching stats:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load statistics.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-lg font-semibold animate-pulse">Loading statistics…</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-black text-white">
        <p role="alert" className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="flex items-center gap-2 rounded-xl bg-[#CAFF33] px-4 py-2 text-sm font-bold text-black"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="bg-black text-white min-h-screen flex flex-col">

      <Navbar />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-6 md:px-10 py-12">
        
        {/* TOP LEVEL METRICS (PRIMARY KPIs) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <StatCard 
            icon={<Zap className="text-[#CAFF33] w-5 h-5" />} 
            label="Observed Throughput" 
            value={formatNumber(stats.throughputTps, 3)} 
            unit={stats.throughputTps == null ? "" : "TPS"} 
            subValue={stats.throughputTps == null ? "Needs distinct transaction timestamps" : "Derived from recorded transactions"} 
          />
          <StatCard 
            icon={<Gauge className="text-[#CAFF33] w-5 h-5" />} 
            label="Avg Detection Latency" 
            value={formatNumber(stats.avgDetectionLatencyMs, 1)} 
            unit={stats.avgDetectionLatencyMs == null ? "" : "ms"} 
            subValue="Not instrumented in transaction records" 
          />
          <StatCard 
            icon={<ShieldAlert className="text-red-500 w-5 h-5" />} 
            label="Mule Accounts Blocked" 
            value={Number(stats.muleAccountsBlocked).toLocaleString()} 
            unit="Total" 
            subValue={`${stats.muleAccountsBlockedToday} today`}  
          />

          <StatCard 
            icon={<Layers className="text-blue-400 w-5 h-5" />} 
            label="Configured Capacity Target" 
            value={Number(stats.systemScalabilityTxDay).toLocaleString()} 
            unit="TX/Day" 
            subValue="Configured target; not load-tested" 
          />
        </div>

        {/* DETAILED SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-12 lg:gap-32 items-start">
          
          {/* Left Side: Performance & Analytics */}
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="text-2xl font-bold mb-2 uppercase tracking-tight">
                Network <span className="text-[#CAFF33]">Performance KPIs</span>
              </h2>
              <p className="text-sm text-gray-500">Live totals use recorded transactions. Model quality and latency appear only when measured data is available.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {/* Action Distribution */}
              <div className="border border-gray-900 p-6 rounded-3xl bg-[#050505]">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Enforcement Distribution</h3>
                <div className="space-y-4">
                  <ProgressBar label="Accounts Frozen" percentage={stats.accountsFrozenPct}   color="bg-[#CAFF33]" />
                  <ProgressBar label="Flagged for Review" percentage={stats.flaggedForReviewPct}  color="bg-yellow-500" />
                  <ProgressBar label="Referral Threshold" percentage={stats.policeReferralsPct}  color="bg-red-500" />
                </div>
              </div>

              {/* Accuracy KPI Card */}
              <div className="border border-gray-900 p-6 rounded-3xl bg-[#050505] flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="text-[#CAFF33] w-4 h-4" />
                  <span className="text-xs font-bold uppercase text-gray-400">Detection Accuracy</span>
                </div>
                <div className="text-4xl font-bold">{formatPercent(stats.detectionAccuracy)}</div>
                <div className="text-[10px] text-gray-600 mt-2 uppercase tracking-tighter">
                     Target Variance: &lt; {stats.targetVariance} | False Positive Rate: {formatPercent(stats.falsePositiveRate)}
                </div>
              </div>
            </div>

            {/* Performance Logs */}
            <div className="border border-gray-900 rounded-3xl overflow-hidden bg-[#0A0A0A]">
              <div className="p-4 border-b border-gray-900 bg-gray-900/20 text-xs font-bold uppercase tracking-wider flex justify-between">
                <span>Recorded Transaction Activity</span>
                <span className="text-[#CAFF33]">{stats.totalTransactions.toLocaleString()} transactions</span>
              </div>
              <div className="p-4 space-y-3">
                 {(stats.liveEvents ?? []).map((event, i) => (
                  <LogItem
                    key={i}
                    time={event.time}
                    msg={event.message}
                    node={event.accountId}
                    risk={event.severity}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Side: KPI Summary List */}
          <div className="flex flex-col gap-6">
            <div className="border border-gray-900 p-8 rounded-3xl bg-[#0A0A0A] flex flex-col gap-6 shadow-2xl relative overflow-hidden">
               {/* Decorative Background Icon */}
              <Cpu className="absolute -right-8 -top-8 w-32 h-32 text-gray-800 opacity-20" />
              
              <h3 className="text-lg font-bold flex items-center gap-2 relative z-10">
                <Activity className="text-[#CAFF33] w-5 h-5" /> Operational Summary
              </h3>
              
              <div className="space-y-6 relative z-10">
                <MetricRow label="Value Intercepted" value={`₹${stats.valueInterceptedCrores} Cr`} />
                <MetricRow label="Avg Detection Latency" value={stats.avgDetectionLatencyMs == null ? "Not measured" : `${formatNumber(stats.avgDetectionLatencyMs, 1)} ms`} />
                <MetricRow label="False Positive Rate" value={formatPercent(stats.falsePositiveRate)} />
                <MetricRow label="Transactions Processed" value={stats.totalTransactions.toLocaleString()} />
                <MetricRow label="Configured Capacity Target" value={`${Number(stats.maxScalabilityMDay).toLocaleString()}M/day; not load-tested`} />
              </div>

              <div className="mt-4 p-4 bg-[#CAFF33]/10 border border-[#CAFF33]/20 rounded-2xl relative z-10">
                <p className="text-[11px] text-[#CAFF33] leading-relaxed italic">
                  Recorded counts are live. Throughput requires distinct timestamps; accuracy requires a persisted evaluation; latency and capacity require load-test instrumentation.
                </p>
              </div>
              
              <a
                href={`${API_BASE_URL}/api/admin/stats/audit/download`}
                download
                className="w-full py-3 bg-[#CAFF33] hover:bg-[#b8e62e] active:scale-[0.99] text-black font-bold rounded-2xl text-xs transition-all uppercase tracking-widest relative z-10 flex items-center justify-center gap-2 no-underline"
              >
                Download Performance Audit
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function LogItem({ time, msg, node, risk }: { time: string; msg: string; node: string; risk: string }) {
  const riskColor = 
    risk === "CRITICAL" ? "text-red-500" : 
    risk === "HIGH" ? "text-orange-500" : 
    risk === "STABLE" ? "text-[#CAFF33]" : "text-yellow-500";
    
  return (
    <div className="flex justify-between items-center text-[11px] border-b border-gray-900 pb-2 last:border-0">
      <div className="flex gap-3">
        <span className="text-gray-700 font-mono">{time}</span>
        <span className="text-gray-300">{msg}</span>
      </div>
      <div className="flex gap-3 items-center">
        <span className="bg-gray-900 px-2 py-0.5 rounded text-gray-500">{node}</span>
        <span className={`font-bold ${riskColor}`}>{risk}</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center border-b border-gray-900 pb-3 last:border-0">
      <span className="text-xs text-gray-500 uppercase font-bold tracking-tighter">{label}</span>
      <span className="text-lg font-bold text-gray-200">{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, unit, subValue }: { icon: React.ReactNode; label: string; value: React.ReactNode; unit: string; subValue: string }) {
  return (
    <div className="border border-gray-900 p-6 rounded-3xl bg-[#0A0A0A] flex flex-col gap-2 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="flex items-center gap-2 text-gray-500 text-[10px] font-bold uppercase tracking-widest">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{value}</span>
        <span className="text-[10px] text-gray-600 font-bold uppercase">{unit}</span>
      </div>
      <div className="text-[10px] text-[#CAFF33] font-mono">{subValue}</div>
    </div>
  );
}

function ProgressBar({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-bold uppercase text-gray-500">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all duration-1000`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}