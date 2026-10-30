package com.mulehunter.backend.service;

import com.lowagie.text.pdf.PdfReader;
import com.mulehunter.backend.DTO.StatsResponse;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AuditPdfServiceTest {

    @Test
    void generatesReadablePdfWhenUnmeasuredMetricsAndEmptyDistributionArePresent() throws Exception {
        StatsResponse stats = new StatsResponse();
        stats.liveEvents = java.util.List.of();

        byte[] pdf = new AuditPdfService().generate(stats);

        assertNotNull(pdf);
        assertTrue(pdf.length > 5);
        assertEquals('%', (char) pdf[0]);
        assertEquals('P', (char) pdf[1]);
        assertEquals('D', (char) pdf[2]);
        assertEquals('F', (char) pdf[3]);
        try (PdfReader reader = new PdfReader(pdf)) {
            assertTrue(reader.getNumberOfPages() > 0);
        }
    }
}
