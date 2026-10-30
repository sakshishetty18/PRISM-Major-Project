package com.mulehunter.backend.service;

import com.mulehunter.backend.DTO.StatsResponse;
import com.mulehunter.backend.model.Transaction;
import com.mulehunter.backend.repository.ModelMetricsRepository;
import com.mulehunter.backend.repository.TransactionRepository;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StatsServiceTest {

    @Test
    void emptyDatasetHasNoFabricatedMetricsOrEnforcementCounts() {
        TransactionRepository transactions = mock(TransactionRepository.class);
        ModelMetricsRepository metrics = mock(ModelMetricsRepository.class);
        when(transactions.findAll()).thenReturn(Flux.empty());
        when(metrics.findTopByOrderByEvaluatedAtDesc()).thenReturn(Mono.empty());

        StatsResponse stats = new StatsService(transactions, metrics).getStats().block();

        assertNotNull(stats);
        assertEquals(0, stats.totalTransactions);
        assertEquals(0, stats.muleAccountsBlocked);
        assertEquals(0, stats.accountsFrozenCount);
        assertEquals(0, stats.transactionsInReview);
        assertEquals(0, stats.policeReferrals);
        assertNull(stats.throughputTps);
        assertNull(stats.avgDetectionLatencyMs);
        assertNull(stats.detectionAccuracy);
        assertNull(stats.falsePositiveRate);
        assertEquals(0, stats.millionsOfTransactions);
        assertEquals(1, stats.liveEvents.size());
        assertEquals("SYSTEM", stats.liveEvents.get(0).accountId);
    }

    @Test
    void transactionTotalsAndReferralIndicatorsReflectStoredDecisions() {
        Transaction transaction = new Transaction();
        transaction.setSourceAccount("synthetic-source");
        transaction.setAmount(new BigDecimal("125.00"));
        transaction.setDecision("BLOCK");
        transaction.setRiskScore(0.80);
        transaction.setTimestamp("2026-10-25T10:00:00Z");

        TransactionRepository transactions = mock(TransactionRepository.class);
        ModelMetricsRepository metrics = mock(ModelMetricsRepository.class);
        when(transactions.findAll()).thenReturn(Flux.fromIterable(List.of(transaction)));
        when(metrics.findTopByOrderByEvaluatedAtDesc()).thenReturn(Mono.empty());

        StatsResponse stats = new StatsService(transactions, metrics).getStats().block();

        assertNotNull(stats);
        assertEquals(1, stats.totalTransactions);
        assertEquals(1, stats.muleAccountsBlocked);
        assertEquals(1, stats.policeReferrals);
        assertEquals(0, stats.accountsFrozenCount);
        assertEquals(0, stats.transactionsInReview);
        assertEquals(0, stats.millionsOfTransactions);
        assertNull(stats.detectionAccuracy);
        assertNull(stats.falsePositiveRate);
    }
}
