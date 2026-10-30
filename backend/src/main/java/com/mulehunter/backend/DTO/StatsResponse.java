package com.mulehunter.backend.DTO;

import java.util.List;

/**
 * Response DTO for GET /api/admin/stats
 * Powers the Network Performance KPIs dashboard.
 */
public class StatsResponse {

    // ── Top KPI cards ─────────────────────────────────────────────
    public Double throughputTps;         // null when recorded timestamps cannot define a rate
    public Double avgDetectionLatencyMs;  // null until request latency is measured
    public long   muleAccountsBlocked;       // BLOCK decisions
    public long   muleAccountsBlockedToday;  // BLOCK decisions filtered to today UTC
    public double systemScalabilityTxDay;    // configured target, not a measured benchmark

    // ── Detection Accuracy ────────────────────────────────────────
    public Double detectionAccuracy;    // null when no persisted evaluation exists
    public Double falsePositiveRate;    // null when no persisted evaluation exists
    public double targetVariance;       // constant: 0.005 (<0.5%)

    // ── Enforcement Distribution ──────────────────────────────────
    public double accountsFrozenPct;    // % BLOCK of total flagged
    public double flaggedForReviewPct;  // % REVIEW of total flagged
    public double policeReferralsPct;   // referral-threshold subset of BLOCK decisions
    public long   accountsFrozenCount;
    public long   transactionsInReview;
    public long   policeReferrals;

    // ── Operational Summary ───────────────────────────────────────
    public double valueInterceptedCrores; // sum(amount of BLOCK txs) / 1Cr
    public long   totalTransactions;      // raw tx count (use for display, e.g. "4,970")
    public long   millionsOfTransactions; // totalTx / 1_000_000  (0 until you hit 1M)
    public double maxScalabilityMDay;     // 25.0 (M/day)

    // ── Live Activity (3 events) ──────────────────────────────────
    public List<LiveEvent> liveEvents;

    public static class LiveEvent {
        public String time;       // "HH:mm:ss" UTC
        public String message;
        public String accountId;  // "ID_12395"
        public String severity;   // CRITICAL / HIGH / STABLE

        public LiveEvent(String time, String message, String accountId, String severity) {
            this.time      = time;
            this.message   = message;
            this.accountId = accountId;
            this.severity  = severity;
        }
    }
}