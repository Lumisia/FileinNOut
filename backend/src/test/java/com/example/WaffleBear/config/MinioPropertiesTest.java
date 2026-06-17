package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MinioPropertiesTest {

    @Test
    void publicEndpointFallsBackToInternalEndpointWhenNotConfigured() {
        MinioProperties properties = new MinioProperties();
        properties.setEndpoint("http://minio:9000");

        assertThat(properties.getPublicEndpoint()).isEqualTo("http://minio:9000");
    }

    @Test
    void publicEndpointUsesExternalHttpsHostWhenConfigured() {
        MinioProperties properties = new MinioProperties();
        properties.setEndpoint("http://minio:9000");
        properties.setPublicEndpoint("https://minio.fileinnout.com");

        assertThat(properties.getPublicEndpoint()).isEqualTo("https://minio.fileinnout.com");
    }
}
