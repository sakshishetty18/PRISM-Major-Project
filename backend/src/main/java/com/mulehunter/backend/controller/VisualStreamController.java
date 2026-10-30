package com.mulehunter.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/visual")
@CrossOrigin(origins = "*")
public class VisualStreamController {

    private final WebClient webClient;

    @Value("${visual.internal-api-key}")
    private String internalApiKey;

    public VisualStreamController(
            WebClient.Builder builder,
            @Value("${visual.analytics.url:http://visual-analytics:8000}") String visualAnalyticsUrl) {
        this.webClient = builder
            .baseUrl(visualAnalyticsUrl)
            .build();
    }

    @GetMapping(
        value = "/stream/unsupervised",
        produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<String> streamUnsupervised(
            @RequestParam String transactionId,
            @RequestParam String nodeId) {

        System.out.println("➡ SSE proxy connected | tx=" + transactionId + " node=" + nodeId);

        return webClient.get()
            .uri(uriBuilder -> uriBuilder
                .path("/visual-analytics/api/visual/stream/unsupervised")
                .queryParam("transactionId", transactionId)
                .queryParam("nodeId", nodeId)
                .build())
            .header("X-INTERNAL-API-KEY", internalApiKey)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .retrieve()
            .bodyToFlux(String.class)
            .doOnCancel(() ->
                System.out.println("❌ SSE proxy disconnected | tx=" + transactionId)
            );
    }
}
