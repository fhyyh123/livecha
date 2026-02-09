package com.chatlive.support.chat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.repo.AttachmentRepository;
import com.chatlive.support.chat.repo.ChatFileSharingSettingsRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.ws.WsSessionRegistry;
import com.chatlive.support.storage.s3.S3PresignService;
import com.chatlive.support.storage.s3.S3Properties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
public class AttachmentService {

    private static final DateTimeFormatter DATE_PATH = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneOffset.UTC);

    private final ConversationRepository conversationRepository;
    private final WsSessionRegistry wsSessionRegistry;
    private final AttachmentRepository attachmentRepository;
    private final ChatFileSharingSettingsRepository fileSharingSettingsRepository;
    private final S3Properties s3Properties;
    private final ObjectProvider<S3PresignService> presignServiceProvider;

    private final boolean defaultVisitorFileEnabled;
    private final boolean defaultAgentFileEnabled;

    public AttachmentService(
            ConversationRepository conversationRepository,
            WsSessionRegistry wsSessionRegistry,
            AttachmentRepository attachmentRepository,
            ChatFileSharingSettingsRepository fileSharingSettingsRepository,
            S3Properties s3Properties,
            ObjectProvider<S3PresignService> presignServiceProvider,
            @Value("${app.chat.file-sharing.visitor-enabled:true}") boolean defaultVisitorFileEnabled,
            @Value("${app.chat.file-sharing.agent-enabled:true}") boolean defaultAgentFileEnabled
    ) {
        this.conversationRepository = conversationRepository;
        this.wsSessionRegistry = wsSessionRegistry;
        this.attachmentRepository = attachmentRepository;
        this.fileSharingSettingsRepository = fileSharingSettingsRepository;
        this.s3Properties = s3Properties;
        this.presignServiceProvider = presignServiceProvider;
        this.defaultVisitorFileEnabled = defaultVisitorFileEnabled;
        this.defaultAgentFileEnabled = defaultAgentFileEnabled;
    }

    public record PresignUploadResult(
            String attachmentId,
            String bucket,
            String objectKey,
            String uploadUrl,
            long expiresInSeconds,
            long maxUploadBytes
    ) {
    }

    public record PresignDownloadResult(
            String attachmentId,
            String downloadUrl,
            long expiresInSeconds
    ) {
    }

    public PresignUploadResult presignUpload(JwtClaims claims, String conversationId, String filename, String contentType, long sizeBytes) {
        ensureStorageEnabled();
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        if (sizeBytes <= 0) {
            throw new IllegalArgumentException("invalid_size_bytes");
        }
        if (sizeBytes > s3Properties.maxUploadBytes()) {
            throw new IllegalArgumentException("file_too_large");
        }

        var conv = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        if (!isFileSharingEnabledForRole(claims)) {
            throw new IllegalArgumentException("file_sharing_disabled");
        }

        var safeFilename = sanitizeFilename(filename);
        var safeContentType = (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType;

        var attachmentId = "a_" + UUID.randomUUID();
        var datePath = DATE_PATH.format(Instant.now());
        var objectKey = claims.tenantId() + "/" + datePath + "/" + attachmentId + (safeFilename.isBlank() ? "" : ("_" + safeFilename));

        attachmentRepository.insertPending(
                attachmentId,
                claims.tenantId(),
                conversationId,
                claims.userId(),
                s3Properties.bucket(),
                objectKey,
                safeFilename,
                safeContentType,
                sizeBytes
        );

            var presignService = presignServiceProvider.getIfAvailable();
            if (presignService == null) {
                throw new IllegalArgumentException("storage_not_configured");
            }
            var presigned = presignService.presignPut(s3Properties.bucket(), objectKey, safeContentType);
        return new PresignUploadResult(
                attachmentId,
                s3Properties.bucket(),
                objectKey,
                presigned.url(),
                presigned.expiresInSeconds(),
                s3Properties.maxUploadBytes()
        );
    }

    private boolean isFileSharingEnabledForRole(JwtClaims claims) {
        if (claims == null) return false;
        var tenantId = claims.tenantId();
        var row = fileSharingSettingsRepository.findByTenantId(tenantId).orElse(null);
        var visitorEnabled = row == null ? defaultVisitorFileEnabled : row.visitorFileEnabled();
        var agentEnabled = row == null ? defaultAgentFileEnabled : row.agentFileEnabled();

        var role = claims.role();
        if ("visitor".equals(role)) return visitorEnabled;
        if ("agent".equals(role) || "admin".equals(role)) return agentEnabled;
        return true;
    }

    public PresignDownloadResult presignDownload(JwtClaims claims, String attachmentId) {
        ensureStorageEnabled();
        if (attachmentId == null || attachmentId.isBlank()) {
            throw new IllegalArgumentException("missing_attachment_id");
        }

        var row = attachmentRepository.findById(claims.tenantId(), attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("attachment_not_found"));

        var conv = conversationRepository.findAccess(claims.tenantId(), row.conversationId())
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        var presignService = presignServiceProvider.getIfAvailable();
        if (presignService == null) {
            throw new IllegalArgumentException("storage_not_configured");
        }
        var presigned = presignService.presignGet(row.bucket(), row.objectKey());
        return new PresignDownloadResult(row.id(), presigned.url(), presigned.expiresInSeconds());
    }

    public AttachmentRepository.AttachmentRow requireOwnedForSend(JwtClaims claims, String conversationId, String attachmentId) {
        if (attachmentId == null || attachmentId.isBlank()) {
            throw new IllegalArgumentException("missing_attachment_id");
        }

        var row = attachmentRepository.findById(claims.tenantId(), attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("attachment_not_found"));

        if (!conversationId.equals(row.conversationId())) {
            throw new IllegalArgumentException("attachment_conversation_mismatch");
        }
        if (!claims.userId().equals(row.uploaderUserId())) {
            throw new IllegalArgumentException("forbidden");
        }

        return row;
    }

    public void markLinked(JwtClaims claims, String attachmentId, String msgId) {
        attachmentRepository.markLinked(claims.tenantId(), attachmentId, msgId);
    }

    private void ensureStorageEnabled() {
        if (!s3Properties.enabled()) {
            throw new IllegalArgumentException("storage_disabled");
        }
        if (s3Properties.bucket() == null || s3Properties.bucket().isBlank()) {
            throw new IllegalArgumentException("storage_not_configured");
        }
    }

    private void ensureCanAccessConversation(JwtClaims claims, ConversationRepository.ConversationAccessRow conv) {
        if ("customer".equals(claims.role())) {
            if (!claims.userId().equals(conv.customerUserId())) {
                throw new IllegalArgumentException("forbidden");
            }
            return;
        }

        if ("visitor".equals(claims.role())) {
            if (claims.siteId() == null || claims.siteId().isBlank()) {
                throw new IllegalArgumentException("forbidden");
            }
            if (conv.siteId() == null || conv.siteId().isBlank() || !claims.siteId().equals(conv.siteId())) {
                throw new IllegalArgumentException("forbidden");
            }
            if (conv.visitorId() == null || conv.visitorId().isBlank() || !claims.userId().equals(conv.visitorId())) {
                throw new IllegalArgumentException("forbidden");
            }
            return;
        }

        if (claims.tenantId() == null || !claims.tenantId().equals(conv.tenantId())) {
            throw new IllegalArgumentException("forbidden");
        }

        if (claims.userId() != null && claims.userId().equals(conv.assignedAgentUserId())) {
            return;
        }
        if (claims.userId() != null && wsSessionRegistry.hasUserSubscribedConversation(claims.userId(), conv.id())) {
            return;
        }

        throw new IllegalArgumentException("forbidden");
    }

    private String sanitizeFilename(String filename) {
        if (filename == null) return "";
        var s = filename.trim();
        if (s.isBlank()) return "";

        s = s.replace("\\u0000", "");
        s = s.replace("/", "_").replace("\\\\", "_");
        s = s.replaceAll("\\s+", "_");
        s = s.replaceAll("[^a-zA-Z0-9._-]", "_");

        if (s.length() > 120) {
            s = s.substring(s.length() - 120);
        }

        while (s.startsWith(".")) s = s.substring(1);
        return s;
    }
}
