package com.mulehunter.backend.service;

import com.mulehunter.backend.DTO.StatsResponse;
import com.mulehunter.backend.model.ModelPerformanceMetrics;
import com.mulehunter.backend.model.Transaction;
import com.mulehunter.backend.repository.ModelMetricsRepository;
import com.mulehunter.backend.repository.TransactionRepository;

import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoField;
import java.util.*;

@Service
public class StatsService {

    // ── Hard constants ────────────────────────────────────────────
    private static final double PEAK_CAPACITY_TX_DAY     = 25_000_000.0;
    private static final double TARGET_VARIANCE_PCT       = 0.005;
    private static final double POLICE_REFERRAL_THRESHOLD = 0.85;
    private static final double SOFT_REFERRAL_THRESHOLD   = 0.70;

    /**
     * FIX: Handles "2025-12-16T11:33:23.578092" — LocalDateTime with
     * optional fractional seconds up to nanosecond precision, no zone.
     * Java's built-in ISO_LOCAL_DATE_TIME rejects 6-digit microseconds
     * in some JVM versions; this formatter is explicit and permissive.
     */
    private static final DateTimeFormatter LOCAL_DT_FLEX =
        new DateTimeFormatterBuilder()
            .appendPattern("yyyy-MM-dd'T'HH:mm:ss")
            .optionalStart()
                .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
            .optionalEnd()
            .toFormatter();

    private final TransactionRepository  transactionRepo;
    private final ModelMetricsRepository metricsRepo;

    public StatsService(TransactionRepository transactionRepo,
                        ModelMetricsRepository metricsRepo) {
        this.transactionRepo = transactionRepo;
        this.metricsRepo     = metricsRepo;
    }

    public Mono<StatsResponse> getStats() {

        Mono<List<Transaction>> txsMono =
                transactionRepo.findAll().collectList();

        Mono<ModelPerformanceMetrics> metricsMono =
                metricsRepo.findTopByOrderByEvaluatedAtDesc()
                           .defaultIfEmpty(new ModelPerformanceMetrics());

        return Mono.zip(txsMono, metricsMono).map(tuple -> {

            List<Transaction>       txs     = tuple.getT1();
            ModelPerformanceMetrics metrics = tuple.getT2();
            StatsResponse           stats   = new StatsResponse();

            long   totalTx            = txs.size();
            long   blocked            = 0;
            long   review             = 0;
            long   policeReferral     = 0;
            long   softReferral       = 0;
            long   blockedToday       = 0;
            long   muleRingMembers    = 0;

            double totalBlockedAmount = 0.0;

            Set<Integer> uniqueRingIds    = new HashSet<>();
            Set<Integer> uniqueClusterIds = new HashSet<>();

            List<Transaction> recentFlagged = new ArrayList<>();

            Instant startOfToday = LocalDate.now(ZoneOffset.UTC)
                    .atStartOfDay(ZoneOffset.UTC).toInstant();

            for (Transaction tx : txs) {

                String  decision = tx.getDecision();
                Double  risk     = tx.getRiskScore();
                boolean isBlock  = "BLOCK".equals(decision);
                boolean isReview = "REVIEW".equals(decision);

                if (isBlock) {
                    blocked++;
                    if (tx.getAmount() != null)
                        totalBlockedAmount += tx.getAmount().doubleValue();
                    if (isTodayInstant(tx.getTimestamp(), startOfToday))
                        blockedToday++;
                    if (risk != null) {
                        if (risk >= POLICE_REFERRAL_THRESHOLD) policeReferral++;
                        if (risk >= SOFT_REFERRAL_THRESHOLD)   softReferral++;
                    }
                    recentFlagged.add(tx);
                }
                if (isReview) {
                    review++;
                    recentFlagged.add(tx);
                }

                if (Boolean.TRUE.equals(tx.getMuleRingMember())) muleRingMembers++;
                if (tx.getRingId() != null && tx.getRingId() > 0)
                    uniqueRingIds.add(tx.getRingId());
                if (tx.getClusterId() != null && tx.getClusterId() > 0)
                    uniqueClusterIds.add(tx.getClusterId());
            }

            long totalFlagged = blocked + review;

            // ── 1. THROUGHPUT ─────────────────────────────────────
            OptionalLong spanSecOpt = deriveDatasetSpanSeconds(txs);
            stats.throughputTps = spanSecOpt.isPresent() && spanSecOpt.getAsLong() > 0
                    ? (double) totalTx / spanSecOpt.getAsLong()
                    : null;

            // ── 2. LATENCY ────────────────────────────────────────
            stats.avgDetectionLatencyMs = null;

            // ── 3. MULE ACCOUNTS BLOCKED ──────────────────────────
            stats.muleAccountsBlocked      = blocked;
            stats.muleAccountsBlockedToday = blockedToday;

            // ── 4. SYSTEM SCALABILITY ─────────────────────────────
            stats.systemScalabilityTxDay = PEAK_CAPACITY_TX_DAY;

            // ── 5. DETECTION ACCURACY & FPR ───────────────────────
            if (metrics.getEvaluatedAt() != null) {
                stats.detectionAccuracy = metrics.getPrecision();
                stats.falsePositiveRate = metrics.getFpr();
            } else {
                stats.detectionAccuracy = null;
                stats.falsePositiveRate = null;
            }
            stats.targetVariance = TARGET_VARIANCE_PCT;

            // ── 6. ENFORCEMENT DISTRIBUTION ───────────────────────
            long referralCount = policeReferral > 0 ? policeReferral : softReferral;
            referralCount = Math.min(referralCount, blocked);
            stats.transactionsInReview = review;
            stats.policeReferrals = referralCount;

            if (totalFlagged > 0) {
                long frozenCount = Math.max(0, blocked - referralCount);

                stats.accountsFrozenCount = frozenCount;
                stats.accountsFrozenPct   = round2((double) frozenCount   / totalFlagged * 100.0);
                stats.flaggedForReviewPct = round2((double) review         / totalFlagged * 100.0);
                stats.policeReferralsPct  = round2((double) referralCount  / totalFlagged * 100.0);

                double sum = stats.accountsFrozenPct + stats.flaggedForReviewPct + stats.policeReferralsPct;
                if (sum > 0 && Math.abs(sum - 100.0) > 0.5) {
                    double scale = 100.0 / sum;
                    stats.accountsFrozenPct   = round2(stats.accountsFrozenPct   * scale);
                    stats.flaggedForReviewPct = round2(stats.flaggedForReviewPct * scale);
                    stats.policeReferralsPct  = round2(stats.policeReferralsPct  * scale);
                }
            } else {
                stats.accountsFrozenCount = 0;
                stats.accountsFrozenPct   = 0.0;
                stats.flaggedForReviewPct = 0.0;
                stats.policeReferralsPct  = 0.0;
            }

            // ── 7. OPERATIONAL SUMMARY ────────────────────────────
            stats.valueInterceptedCrores = round2(totalBlockedAmount / 10_000_000.0);

            stats.totalTransactions      = totalTx;
            stats.millionsOfTransactions = totalTx / 1_000_000L;
            stats.maxScalabilityMDay     = PEAK_CAPACITY_TX_DAY / 1_000_000.0;

            // ── 8. LIVE EVENTS ────────────────────────────────────
            recentFlagged.sort(Comparator.comparing(
                    tx -> tx.getTimestamp() != null ? tx.getTimestamp() : "",
                    Comparator.reverseOrder()
            ));

            DateTimeFormatter timeFmt = DateTimeFormatter
                    .ofPattern("HH:mm:ss")
                    .withZone(ZoneOffset.UTC);

            List<StatsResponse.LiveEvent> events = new ArrayList<>();
            int added = 0;

            for (Transaction tx : recentFlagged) {
                if (added >= 2) break;

                String accId = tx.getSourceAccount() != null
                        ? "ID_" + tx.getSourceAccount() : "ID_???";
                Double risk  = tx.getRiskScore();

                String time = parseTimestampToTime(tx.getTimestamp(), timeFmt);
                if ("00:00:00".equals(time))
                    time = timeFmt.format(Instant.now().minusSeconds(120L * (added + 1)));

                String message, severity;

                if (Boolean.TRUE.equals(tx.getMuleRingMember()) && tx.getRingId() != null) {
                    message  = "Mule ring #" + tx.getRingId()
                             + (tx.getRingShape() != null ? " [" + tx.getRingShape() + "]" : "")
                             + " — " + (tx.getRingSize() != null ? tx.getRingSize() : "?") + " accounts frozen";
                    severity = "CRITICAL";
                } else if (risk != null && risk >= 0.90) {
                    message  = "Circular flow detected"
                             + (tx.getRingShape() != null ? " [" + tx.getRingShape() + "]" : "");
                    severity = "CRITICAL";
                } else if (Boolean.TRUE.equals(tx.getJa3Detected())) {
                    message  = "JA3 bot fingerprint hit"
                             + (tx.getJa3Velocity() != null ? " — velocity=" + tx.getJa3Velocity() : "")
                             + (tx.getJa3Fanout()   != null ? ", fanout="    + tx.getJa3Fanout()   : "");
                    severity = "HIGH";
                } else if (tx.getClusterId() != null) {
                    message  = "Fraud cluster #" + tx.getClusterId()
                             + (tx.getClusterSize() != null ? " — " + tx.getClusterSize() + " nodes" : "")
                             + (tx.getClusterRiskScore() != null
                                 ? ", cluster risk=" + String.format("%.2f", tx.getClusterRiskScore()) : "");
                    severity = "HIGH";
                } else {
                    StringBuilder msg = new StringBuilder("Transaction flagged");
                    if (risk != null)              msg.append(" — risk=").append(String.format("%.2f", risk));
                    if (tx.getGnnScore() != null)  msg.append(", gnn=").append(String.format("%.2f", tx.getGnnScore()));
                    if (tx.getRiskLevel() != null)  msg.append(" [").append(tx.getRiskLevel()).append("]");
                    message  = msg.toString();
                    severity = (risk != null && risk >= 0.75) ? "HIGH" : "MEDIUM";
                }

                events.add(new StatsResponse.LiveEvent(time, message, accId, severity));
                added++;
            }

            String systemMsg = !uniqueClusterIds.isEmpty()
                    ? "Monitoring " + uniqueClusterIds.size() + " clusters · "
                      + uniqueRingIds.size() + " mule rings · "
                      + muleRingMembers + " accounts in rings"
                    : "No active fraud clusters or rings in recorded transactions";

            events.add(new StatsResponse.LiveEvent(
                    timeFmt.format(Instant.now()), systemMsg, "SYSTEM",
                    uniqueClusterIds.isEmpty() ? "INFO" : "STABLE"
            ));

            stats.liveEvents = events;
            return stats;
        });
    }

    // ─── Helpers ──────────────────────────────────────────────────

    private OptionalLong deriveDatasetSpanSeconds(List<Transaction> txs) {
        Instant min = null, max = null;
        for (Transaction tx : txs) {
            Instant t = parseTimestamp(tx.getTimestamp());
            if (t == null) continue;
            if (min == null || t.isBefore(min)) min = t;
            if (max == null || t.isAfter(max))  max = t;
        }
        if (min == null || max == null || max.equals(min)) return OptionalLong.empty();
        return OptionalLong.of(max.getEpochSecond() - min.getEpochSecond());
    }

    private boolean isTodayInstant(String timestamp, Instant startOfToday) {
        Instant parsed = parseTimestamp(timestamp);
        return parsed != null && parsed.isAfter(startOfToday);
    }

    private String parseTimestampToTime(String timestamp, DateTimeFormatter fmt) {
        Instant parsed = parseTimestamp(timestamp);
        return parsed != null ? fmt.format(parsed) : "00:00:00";
    }

    /**
     * Parses every timestamp format present in this dataset.
     *
     * The critical case is "2025-12-16T11:33:23.578092":
     *   - No Z / no offset → Instant.parse() fails
     *   - OffsetDateTime.parse() fails (no offset)
     *   - LocalDateTime.parse() with DEFAULT formatter fails on 6-digit
     *     microseconds in some JVM versions
     *   - LOCAL_DT_FLEX uses appendFraction(NANO_OF_SECOND, 0, 9) which
     *     accepts 0–9 fractional digits → parses correctly every time
     */
    private Instant parseTimestamp(String timestamp) {
        if (timestamp == null || timestamp.isBlank()) return null;
        String ts = timestamp.trim().replace(' ', 'T'); // handle space separator

        // 1. Standard ISO instant (has Z or numeric offset)
        try { return Instant.parse(ts); } catch (DateTimeParseException ignored) {}

        // 2. Has named offset like +05:30
        try { return OffsetDateTime.parse(ts).toInstant(); } catch (DateTimeParseException ignored) {}

        // 3. No zone — use explicit microsecond-aware formatter, treat as UTC
        try {
            return LocalDateTime.parse(ts, LOCAL_DT_FLEX).toInstant(ZoneOffset.UTC);
        } catch (DateTimeParseException ignored) {}

        return null;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}