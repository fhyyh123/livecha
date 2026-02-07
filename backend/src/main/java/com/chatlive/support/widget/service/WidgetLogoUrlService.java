package com.chatlive.support.widget.service;

import com.chatlive.support.storage.s3.S3PresignService;
import com.chatlive.support.storage.s3.S3Properties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class WidgetLogoUrlService {

    private final S3Properties s3Properties;
    private final ObjectProvider<S3PresignService> presignServiceProvider;

    public WidgetLogoUrlService(S3Properties s3Properties, ObjectProvider<S3PresignService> presignServiceProvider) {
        this.s3Properties = s3Properties;
        this.presignServiceProvider = presignServiceProvider;
    }

    public String presignGetUrl(String bucket, String objectKey) {
        if (!s3Properties.enabled()) return null;
        if (bucket == null || bucket.isBlank()) return null;
        if (objectKey == null || objectKey.isBlank()) return null;
        var presign = presignServiceProvider.getIfAvailable();
        if (presign == null) return null;
        return presign.presignGet(bucket, objectKey).url();
    }
}
