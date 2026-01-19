package com.chatlive.support.storage.s3;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

@Configuration
@ConditionalOnProperty(prefix = "app.s3", name = "enabled", havingValue = "true")
public class S3Config {

    @Bean
    public StaticCredentialsProvider s3CredentialsProvider(S3Properties props) {
        var creds = AwsBasicCredentials.create(props.accessKey(), props.secretKey());
        return StaticCredentialsProvider.create(creds);
    }

    @Bean
    public Region s3Region(S3Properties props) {
        return Region.of(props.region() == null || props.region().isBlank() ? "us-east-1" : props.region());
    }

    @Bean
    public S3Client s3Client(S3Properties props, StaticCredentialsProvider credentialsProvider, Region region) {
        var endpoint = effectiveInternalEndpoint(props);
        return S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .credentialsProvider(credentialsProvider)
                .region(region)
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(props.pathStyleAccess()).build())
                .build();
    }

    @Bean
    public S3Presigner s3Presigner(S3Properties props, StaticCredentialsProvider credentialsProvider, Region region) {
        var endpoint = effectivePublicEndpoint(props);
        return S3Presigner.builder()
                .endpointOverride(URI.create(endpoint))
                .credentialsProvider(credentialsProvider)
                .region(region)
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(props.pathStyleAccess()).build())
                .build();
    }

    @Bean
    public S3PresignService s3PresignService(S3Properties props, S3Presigner presigner) {
        return new S3PresignService(props, presigner);
    }

    @Bean
    public S3BucketInitializer s3BucketInitializer(S3Properties props, S3Client client) {
        return new S3BucketInitializer(props, client);
    }

    static String effectiveInternalEndpoint(S3Properties props) {
        if (props.internalEndpoint() != null && !props.internalEndpoint().isBlank()) {
            return props.internalEndpoint();
        }
        return effectivePublicEndpoint(props);
    }

    static String effectivePublicEndpoint(S3Properties props) {
        if (props.publicEndpoint() != null && !props.publicEndpoint().isBlank()) {
            return props.publicEndpoint();
        }
        return "http://localhost:9000";
    }
}
