package com.chatlive.support.storage.s3;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.s3")
public record S3Properties(
        boolean enabled,
        String internalEndpoint,
        String publicEndpoint,
        String region,
        String accessKey,
        String secretKey,
        String bucket,
        boolean pathStyleAccess,
        long presignTtlSeconds,
        long maxUploadBytes
) {
}
