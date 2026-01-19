package com.chatlive.support.storage.s3;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;

public class S3BucketInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(S3BucketInitializer.class);

    private final S3Properties props;
    private final S3Client client;

    public S3BucketInitializer(S3Properties props, S3Client client) {
        this.props = props;
        this.client = client;
    }

    @Override
    public void run(ApplicationArguments args) {
        var bucket = props.bucket();
        if (bucket == null || bucket.isBlank()) {
            log.warn("s3 bucket not configured; skip init");
            return;
        }

        try {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
            log.info("s3 bucket exists: {}", bucket);
        } catch (SdkException e) {
            try {
                client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
                log.info("s3 bucket created: {}", bucket);
            } catch (SdkException e2) {
                log.warn("s3 bucket init failed: {}", bucket, e2);
            }
        }
    }
}
