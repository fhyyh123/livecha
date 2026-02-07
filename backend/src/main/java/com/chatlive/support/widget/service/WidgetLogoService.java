package com.chatlive.support.widget.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.storage.s3.S3PresignService;
import com.chatlive.support.storage.s3.S3Properties;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

@Service
public class WidgetLogoService {

    private static final DateTimeFormatter DATE_PATH = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneOffset.UTC);

    private final WidgetConfigRepository widgetConfigRepository;
    private final S3Properties s3Properties;
    private final ObjectProvider<S3PresignService> presignServiceProvider;

    public WidgetLogoService(
            WidgetConfigRepository widgetConfigRepository,
            S3Properties s3Properties,
            ObjectProvider<S3PresignService> presignServiceProvider
    ) {
        this.widgetConfigRepository = widgetConfigRepository;
        this.s3Properties = s3Properties;
        this.presignServiceProvider = presignServiceProvider;
    }

    public record PresignWidgetLogoUploadResult(
            String bucket,
            String object_key,
            String upload_url,
            long expires_in_seconds,
            long max_upload_bytes
    ) {
    }

    public PresignWidgetLogoUploadResult presignUpload(JwtClaims claims, String siteId, String filename, String contentType, long sizeBytes) {
        if (claims == null) throw new IllegalArgumentException("forbidden");
        if (siteId == null || siteId.isBlank()) throw new IllegalArgumentException("site_not_found");
        if (!s3Properties.enabled()) throw new IllegalArgumentException("storage_disabled");
        if (s3Properties.bucket() == null || s3Properties.bucket().isBlank()) throw new IllegalArgumentException("storage_not_configured");

        if (sizeBytes <= 0) throw new IllegalArgumentException("invalid_size_bytes");
        if (sizeBytes > s3Properties.maxUploadBytes()) throw new IllegalArgumentException("file_too_large");

        var safeCt = (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType.trim();
        if (!isAllowedImageContentType(safeCt)) {
            throw new IllegalArgumentException("invalid_logo_type");
        }

        var ext = guessExt(safeCt, filename);
        var datePath = DATE_PATH.format(Instant.now());
        var objectKey = claims.tenantId() + "/widget-logo/" + siteId + "/" + datePath + "/logo_" + UUID.randomUUID() + ext;

        var presign = presignServiceProvider.getIfAvailable();
        if (presign == null) throw new IllegalArgumentException("storage_not_configured");

        var presigned = presign.presignPut(s3Properties.bucket(), objectKey, safeCt);

        // Store reference immediately (MVP); upload is client-side PUT.
        widgetConfigRepository.upsertLogo(siteId, true, s3Properties.bucket(), objectKey, safeCt);

        return new PresignWidgetLogoUploadResult(
                s3Properties.bucket(),
                objectKey,
                presigned.url(),
                presigned.expiresInSeconds(),
                s3Properties.maxUploadBytes()
        );
    }

    private static boolean isAllowedImageContentType(String ct) {
        var t = ct == null ? "" : ct.toLowerCase(Locale.ROOT).trim();
        return t.equals("image/png")
                || t.equals("image/jpeg")
                || t.equals("image/jpg")
                || t.equals("image/webp")
                || t.equals("image/gif");
    }

    private static String guessExt(String contentType, String filename) {
        var ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).trim();
        if (ct.equals("image/png")) return ".png";
        if (ct.equals("image/webp")) return ".webp";
        if (ct.equals("image/gif")) return ".gif";
        if (ct.equals("image/jpeg") || ct.equals("image/jpg")) return ".jpg";
        var f = filename == null ? "" : filename.trim().toLowerCase(Locale.ROOT);
        if (f.endsWith(".png")) return ".png";
        if (f.endsWith(".webp")) return ".webp";
        if (f.endsWith(".gif")) return ".gif";
        if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return ".jpg";
        return ".img";
    }
}
