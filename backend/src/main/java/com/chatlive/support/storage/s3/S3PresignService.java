package com.chatlive.support.storage.s3;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;

public class S3PresignService {

    private final S3Properties props;
    private final S3Presigner presigner;

    public S3PresignService(S3Properties props, S3Presigner presigner) {
        this.props = props;
        this.presigner = presigner;
    }

    public record PresignedUrl(String url, long expiresInSeconds) {
    }

    public PresignedUrl presignPut(String bucket, String key, String contentType) {
        try {
            var put = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .build();

            var ttl = Duration.ofSeconds(Math.max(30, props.presignTtlSeconds()));
            var req = PutObjectPresignRequest.builder()
                    .signatureDuration(ttl)
                    .putObjectRequest(put)
                    .build();

            var presigned = presigner.presignPutObject(req);
            return new PresignedUrl(presigned.url().toString(), ttl.toSeconds());
        } catch (SdkException e) {
            throw new IllegalStateException("s3_presign_failed");
        }
    }

    public PresignedUrl presignGet(String bucket, String key) {
        try {
            var get = GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build();

            var ttl = Duration.ofSeconds(Math.max(30, props.presignTtlSeconds()));
            var req = GetObjectPresignRequest.builder()
                    .signatureDuration(ttl)
                    .getObjectRequest(get)
                    .build();

            var presigned = presigner.presignGetObject(req);
            return new PresignedUrl(presigned.url().toString(), ttl.toSeconds());
        } catch (SdkException e) {
            throw new IllegalStateException("s3_presign_failed");
        }
    }
}
