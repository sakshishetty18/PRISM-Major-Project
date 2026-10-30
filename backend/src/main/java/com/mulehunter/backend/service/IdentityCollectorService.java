package com.mulehunter.backend.service;

import org.springframework.stereotype.Service;

import com.mulehunter.backend.model.Transaction;
import com.mulehunter.backend.repository.TransactionRepository;

import reactor.core.publisher.Mono;

@Service
public class IdentityCollectorService {

    private final TransactionRepository repository;

    public IdentityCollectorService(TransactionRepository repository) {
        this.repository = repository;
    }

    public Mono<Transaction> collect(Transaction tx, String ja3, String deviceHash, String ip) {

        tx.setDeviceHash(deviceHash);
        tx.setIpAddress(ip);

        Mono<Long> deviceCount =
                repository.countByDeviceHash(deviceHash).defaultIfEmpty(0L);

        Mono<Long> ipCount =
                repository.countByIpAddress(ip).defaultIfEmpty(0L);

        return Mono.zip(deviceCount, ipCount)
                .map(tuple -> {

                    int deviceReuse = Math.max(0, tuple.getT1().intValue() - 1);
                    int ipReuse = Math.max(0, tuple.getT2().intValue() - 1);

                    tx.setJa3ReuseCount(0);
                    tx.setDeviceReuseCount(deviceReuse);
                    tx.setIpReuseCount(ipReuse);

                    tx.setIsNewDevice(deviceReuse == 0);
                    tx.setIsNewJa3(null);

                    return tx;
                });
    }
}
