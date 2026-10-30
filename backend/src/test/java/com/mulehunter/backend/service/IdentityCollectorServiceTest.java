package com.mulehunter.backend.service;

import com.mulehunter.backend.model.Transaction;
import com.mulehunter.backend.repository.TransactionRepository;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class IdentityCollectorServiceTest {

    @Test
    void firstDeviceAndIpUseAreNotCountedAsReuse() {
        TransactionRepository repository = mock(TransactionRepository.class);
        when(repository.countByDeviceHash("device-a")).thenReturn(Mono.just(1L));
        when(repository.countByIpAddress("192.0.2.10")).thenReturn(Mono.just(1L));
        Transaction transaction = new Transaction();

        Transaction result = new IdentityCollectorService(repository)
                .collect(transaction, "fingerprint-a", "device-a", "192.0.2.10")
                .block();

        assertNotNull(result);
        assertEquals(0, result.getDeviceReuseCount());
        assertEquals(0, result.getIpReuseCount());
        assertTrue(result.getIsNewDevice());
        assertNull(result.getIsNewJa3());
        assertEquals("device-a", result.getDeviceHash());
        assertEquals("192.0.2.10", result.getIpAddress());
    }

    @Test
    void previouslySeenDeviceAndIpAreCountedAsReuse() {
        TransactionRepository repository = mock(TransactionRepository.class);
        when(repository.countByDeviceHash("device-a")).thenReturn(Mono.just(3L));
        when(repository.countByIpAddress("192.0.2.10")).thenReturn(Mono.just(2L));
        Transaction transaction = new Transaction();

        Transaction result = new IdentityCollectorService(repository)
                .collect(transaction, "fingerprint-a", "device-a", "192.0.2.10")
                .block();

        assertNotNull(result);
        assertEquals(2, result.getDeviceReuseCount());
        assertEquals(1, result.getIpReuseCount());
        assertFalse(result.getIsNewDevice());
    }
}
