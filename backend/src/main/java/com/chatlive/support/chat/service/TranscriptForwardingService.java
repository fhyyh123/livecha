package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.ChatTranscriptForwardingSettingsRepository;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.repo.AttachmentRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.MessageRepository;
import com.chatlive.support.common.email.EmailDeliveryService;
import com.chatlive.support.storage.s3.S3PresignService;
import com.chatlive.support.user.repo.UserAccountRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.VisitorRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Service
public class TranscriptForwardingService {

    private static final Logger log = LoggerFactory.getLogger(TranscriptForwardingService.class);

    private static final int MAX_MESSAGES = 5000;
    private static final int PAGE_SIZE = 500;

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss 'UTC'")
            .withZone(ZoneOffset.UTC);

    private final ChatTranscriptForwardingSettingsRepository transcriptForwardingSettingsRepository;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final AttachmentRepository attachmentRepository;
    private final SiteRepository siteRepository;
    private final VisitorRepository visitorRepository;
    private final AgentProfileRepository agentProfileRepository;
    private final UserAccountRepository userAccountRepository;
    private final EmailDeliveryService emailDeliveryService;
    private final ObjectProvider<S3PresignService> presignServiceProvider;
    private final ObjectMapper objectMapper;

    @Value("${app.onboarding.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    public TranscriptForwardingService(
            ChatTranscriptForwardingSettingsRepository transcriptForwardingSettingsRepository,
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            AttachmentRepository attachmentRepository,
            SiteRepository siteRepository,
            VisitorRepository visitorRepository,
            AgentProfileRepository agentProfileRepository,
            UserAccountRepository userAccountRepository,
            EmailDeliveryService emailDeliveryService,
            ObjectProvider<S3PresignService> presignServiceProvider,
            ObjectMapper objectMapper
    ) {
        this.transcriptForwardingSettingsRepository = transcriptForwardingSettingsRepository;
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.attachmentRepository = attachmentRepository;
        this.siteRepository = siteRepository;
        this.visitorRepository = visitorRepository;
        this.agentProfileRepository = agentProfileRepository;
        this.userAccountRepository = userAccountRepository;
        this.emailDeliveryService = emailDeliveryService;
        this.presignServiceProvider = presignServiceProvider;
        this.objectMapper = objectMapper;
    }

    /**
     * Best-effort: send a transcript email if forwarding is configured.
     *
     * This method is intentionally resilient: failures are logged and swallowed.
     */
    public void trySendOnArchived(String tenantId, String conversationId, String archivedReason, String archivedByUserId) {
        if (tenantId == null || tenantId.isBlank()) return;
        if (conversationId == null || conversationId.isBlank()) return;

        try {
            var row = transcriptForwardingSettingsRepository.findByTenantId(tenantId).orElse(null);
            var to = row == null ? null : row.forwardToEmail();
            to = to == null ? null : to.trim();
            if (to == null || to.isBlank()) {
                return;
            }

            var access = conversationRepository.findAccess(tenantId, conversationId).orElse(null);
            var conv = conversationRepository.findDetail(tenantId, conversationId).orElse(null);
            if (access == null || conv == null) return;

            // Only send for archived/closed conversations.
            if (!"closed".equals(access.status()) || !"closed".equals(conv.status())) return;

            var meta = buildMeta(access, conv, archivedReason, archivedByUserId);

            var subject = buildSubject(meta, conv);
            var bodyText = buildTextBody(meta, conv);
            var bodyHtml = buildHtmlBody(meta, conv);
            emailDeliveryService.sendHtml(to, subject, bodyText, bodyHtml);
        } catch (Exception e) {
            log.warn("transcript_forwarding_send_failed tenant={} conversationId={}", tenantId, conversationId, e);
        }
    }

    private record TranscriptMeta(
            String siteId,
            String siteName,
            String visitorId,
            String visitorName,
            String visitorEmail,
            String visitorGeo,
            String assignedAgentUserId,
            String assignedAgentDisplay,
            String archivedReason,
            String archivedByUserId,
            String archivedByDisplay,
            String consoleUrl
    ) {
    }

    private TranscriptMeta buildMeta(
            ConversationRepository.ConversationAccessRow access,
            ConversationRepository.ConversationDetailRow conv,
            String archivedReason,
            String archivedByUserId
    ) {
        String siteName = null;
        String visitorName = null;
        String visitorEmail = null;
        String visitorGeo = null;

        if (access.siteId() != null && !access.siteId().isBlank()) {
            try {
                var site = siteRepository.findById(conv.tenantId(), access.siteId()).orElse(null);
                siteName = site == null ? null : safeTrim(site.name());
            } catch (Exception ignore) {
                // ignore
            }
        }

        if (access.siteId() != null && !access.siteId().isBlank() && access.visitorId() != null && !access.visitorId().isBlank()) {
            try {
                var v = visitorRepository.findByIdAndSite(access.visitorId(), access.siteId()).orElse(null);
                if (v != null) {
                    visitorName = safeTrim(v.name());
                    visitorEmail = safeTrim(v.email());
                    visitorGeo = formatGeo(v);
                }
            } catch (Exception ignore) {
                // ignore
            }
        }

        var assignedAgentDisplay = resolveAgentLabel(access.assignedAgentUserId());
        var archivedByDisplay = resolveAgentLabel(archivedByUserId);

        var url = buildConsoleArchiveUrl(conv.id());

        return new TranscriptMeta(
                access.siteId(),
                siteName,
                access.visitorId(),
                visitorName,
                visitorEmail,
                visitorGeo,
                access.assignedAgentUserId(),
                assignedAgentDisplay,
                safeTrim(archivedReason),
                safeTrim(archivedByUserId),
                archivedByDisplay,
                url
        );
    }

    private String buildSubject(TranscriptMeta meta, ConversationRepository.ConversationDetailRow conv) {
        var subjectPart = (conv.subject() == null || conv.subject().isBlank()) ? conv.id() : conv.subject().trim();
        var sitePart = (meta.siteName() == null || meta.siteName().isBlank()) ? null : meta.siteName().trim();
        var visitorPart = buildVisitorDisplay(meta);
        var prefix = "Chat transcript";

        var parts = new ArrayList<String>();
        parts.add(prefix);
        if (sitePart != null) parts.add(sitePart);
        if (visitorPart != null) parts.add(visitorPart);
        parts.add(subjectPart);
        return String.join(" - ", parts);
    }

    private String buildTextBody(TranscriptMeta meta, ConversationRepository.ConversationDetailRow conv) {
        var lines = new ArrayList<String>();
        lines.add("Chat transcript");
        lines.add("");
        if (meta.consoleUrl() != null && !meta.consoleUrl().isBlank()) {
            lines.add("Console link: " + meta.consoleUrl());
            lines.add("");
        }

        if (meta.siteName() != null && !meta.siteName().isBlank()) {
            lines.add("Site: " + meta.siteName() + (meta.siteId() != null && !meta.siteId().isBlank() ? " (" + meta.siteId() + ")" : ""));
        } else if (meta.siteId() != null && !meta.siteId().isBlank()) {
            lines.add("Site ID: " + meta.siteId());
        }

        var visitorDisplay = buildVisitorDisplay(meta);
        if (visitorDisplay != null && !visitorDisplay.isBlank()) {
            lines.add("Visitor: " + visitorDisplay + (meta.visitorId() != null && !meta.visitorId().isBlank() ? " (" + meta.visitorId() + ")" : ""));
        } else if (meta.visitorId() != null && !meta.visitorId().isBlank()) {
            lines.add("Visitor ID: " + meta.visitorId());
        }
        if (meta.visitorGeo() != null && !meta.visitorGeo().isBlank()) {
            lines.add("Visitor location: " + meta.visitorGeo());
        }
        if (meta.assignedAgentDisplay() != null && !meta.assignedAgentDisplay().isBlank()) {
            lines.add("Assigned agent: " + meta.assignedAgentDisplay() + (meta.assignedAgentUserId() != null && !meta.assignedAgentUserId().isBlank() ? " (" + meta.assignedAgentUserId() + ")" : ""));
        } else if (meta.assignedAgentUserId() != null && !meta.assignedAgentUserId().isBlank()) {
            lines.add("Assigned agent user ID: " + meta.assignedAgentUserId());
        }
        if (meta.archivedByDisplay() != null && !meta.archivedByDisplay().isBlank()) {
            lines.add("Archived by: " + meta.archivedByDisplay() + (meta.archivedByUserId() != null && !meta.archivedByUserId().isBlank() ? " (" + meta.archivedByUserId() + ")" : ""));
        } else if (meta.archivedByUserId() != null && !meta.archivedByUserId().isBlank()) {
            lines.add("Archived by user ID: " + meta.archivedByUserId());
        }

        lines.add("Conversation ID: " + safe(conv.id()));
        lines.add("Channel: " + safe(conv.channel()));
        lines.add("Subject: " + safe(conv.subject()));
        lines.add("Created at: " + fmt(conv.createdAt()));
        lines.add("Archived at: " + fmt(conv.closedAt()));
        if (meta.archivedReason() != null && !meta.archivedReason().isBlank()) {
            lines.add("Archived reason: " + meta.archivedReason());
        }

        var customerLabel = resolveCustomerLabel(conv.customerUserId());
        if (customerLabel != null) {
            lines.add("Customer: " + customerLabel);
        }

        lines.add("");
        lines.add("Messages:");

        var msgs = loadAllMessages(conv.tenantId(), conv.id());
        for (var m : msgs.messages()) {
            lines.add(formatMessageLine(m));
            if ("file".equalsIgnoreCase(m.contentType())) {
                var link = tryPresignAttachmentLink(m);
                if (link != null && link.url() != null && !link.url().isBlank()) {
                    lines.add("    Download: " + link.url());
                }
            }
        }
        if (msgs.truncated()) {
            lines.add("");
            lines.add("(Transcript truncated: too many messages)");
        }

        lines.add("");
        lines.add("—");
        lines.add("Sent by ChatLive transcript forwarding");

        return String.join("\n", lines);
    }

    private String buildHtmlBody(TranscriptMeta meta, ConversationRepository.ConversationDetailRow conv) {
        var sb = new StringBuilder();
        sb.append("<div style=\"font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 14px; line-height: 1.4\">\n");
        sb.append("<h2 style=\"margin:0 0 12px\">Chat transcript</h2>\n");
        sb.append("<div style=\"color:#666; margin:0 0 16px\">Conversation archived transcript</div>\n");
        sb.append("<table style=\"border-collapse: collapse; margin: 0 0 16px\">\n");

        if (meta.consoleUrl() != null && !meta.consoleUrl().isBlank()) {
            rowLink(sb, "Console link", meta.consoleUrl(), meta.consoleUrl());
        }
        if (meta.siteName() != null && !meta.siteName().isBlank()) {
            row(sb, "Site", meta.siteName() + (meta.siteId() != null && !meta.siteId().isBlank() ? " (" + meta.siteId() + ")" : ""));
        } else {
            row(sb, "Site ID", meta.siteId());
        }
        var visitorDisplay = buildVisitorDisplay(meta);
        if (visitorDisplay != null && !visitorDisplay.isBlank()) {
            row(sb, "Visitor", visitorDisplay + (meta.visitorId() != null && !meta.visitorId().isBlank() ? " (" + meta.visitorId() + ")" : ""));
        } else {
            row(sb, "Visitor ID", meta.visitorId());
        }
        if (meta.visitorGeo() != null && !meta.visitorGeo().isBlank()) {
            row(sb, "Visitor location", meta.visitorGeo());
        }
        if (meta.assignedAgentDisplay() != null && !meta.assignedAgentDisplay().isBlank()) {
            row(sb, "Assigned agent", meta.assignedAgentDisplay());
        } else {
            row(sb, "Assigned agent user ID", meta.assignedAgentUserId());
        }
        if (meta.archivedByDisplay() != null && !meta.archivedByDisplay().isBlank()) {
            row(sb, "Archived by", meta.archivedByDisplay());
        } else {
            row(sb, "Archived by user ID", meta.archivedByUserId());
        }

        row(sb, "Conversation ID", conv.id());
        row(sb, "Channel", conv.channel());
        row(sb, "Subject", conv.subject());
        row(sb, "Created at", fmt(conv.createdAt()));
        row(sb, "Archived at", fmt(conv.closedAt()));
        if (meta.archivedReason() != null && !meta.archivedReason().isBlank()) {
            row(sb, "Archived reason", meta.archivedReason());
        }
        var customerLabel = resolveCustomerLabel(conv.customerUserId());
        if (customerLabel != null) {
            row(sb, "Customer", customerLabel);
        }
        sb.append("</table>\n");

        var msgs = loadAllMessages(conv.tenantId(), conv.id());

        sb.append("<h3 style=\"margin:0 0 8px\">Messages</h3>\n");
        sb.append("<div style=\"background:#f6f6f6; padding:12px; border-radius:8px\">\n");
        for (var m : msgs.messages()) {
            sb.append(renderMessageHtml(m));
        }
        if (msgs.truncated()) {
            sb.append("<div style=\"margin-top:8px; color:#666\">(Transcript truncated: too many messages)</div>\n");
        }
        sb.append("</div>\n");

        sb.append("<div style=\"color:#888; margin-top:16px\">Sent by ChatLive transcript forwarding</div>\n");
        sb.append("</div>");
        return sb.toString();
    }

    private void row(StringBuilder sb, String key, String value) {
        if (value == null || value.isBlank()) return;
        sb.append("<tr>")
                .append("<td style=\"padding:4px 12px 4px 0; color:#666\">")
                .append(escapeHtml(key))
                .append("</td>")
                .append("<td style=\"padding:4px 0\">")
                .append(escapeHtml(safe(value)))
                .append("</td>")
                .append("</tr>\n");
    }

    private void rowLink(StringBuilder sb, String key, String href, String text) {
        if (href == null || href.isBlank()) return;
        sb.append("<tr>")
                .append("<td style=\"padding:4px 12px 4px 0; color:#666\">")
                .append(escapeHtml(key))
                .append("</td>")
                .append("<td style=\"padding:4px 0\">")
                .append("<a href=\"")
                .append(escapeHtmlAttr(href))
                .append("\" target=\"_blank\" rel=\"noreferrer\">")
                .append(escapeHtml(text == null ? href : text))
                .append("</a>")
                .append("</td>")
                .append("</tr>\n");
    }

    private record LoadedMessages(List<MessageRepository.MessageRow> messages, boolean truncated) {
    }

    private LoadedMessages loadAllMessages(String tenantId, String conversationId) {
        var all = new ArrayList<MessageRepository.MessageRow>();
        String after = null;
        boolean truncated = false;
        while (all.size() < MAX_MESSAGES) {
            int pageLimit = Math.min(PAGE_SIZE, MAX_MESSAGES - all.size());
            var batch = messageRepository.listMessages(tenantId, conversationId, after, pageLimit);
            if (batch.isEmpty()) break;
            all.addAll(batch);
            after = batch.get(batch.size() - 1).id();
            if (batch.size() < pageLimit) break;
        }

        // If there are more messages beyond MAX_MESSAGES, treat as truncated.
        if (all.size() >= MAX_MESSAGES) {
            try {
                var extra = messageRepository.listMessages(tenantId, conversationId, after, 1);
                truncated = !extra.isEmpty();
            } catch (Exception ignore) {
                // ignore
            }
        }

        return new LoadedMessages(all, truncated);
    }

    private String formatMessageLine(MessageRepository.MessageRow row) {
        var ts = fmt(row.createdAt());
        var who = resolveSenderLabel(row.senderType(), row.senderId());
        var content = toPlainContent(row.contentType(), row.contentJson());
        return ts + " - " + who + ": " + content;
    }

    private String resolveSenderLabel(String senderType, String senderId) {
        var st = senderType == null ? "" : senderType.trim().toLowerCase();
        if ("agent".equals(st)) {
            var label = resolveAgentLabel(senderId);
            return label == null ? "Agent" : label;
        }
        if ("customer".equals(st)) {
            // senderId is customer user id.
            var label = resolveCustomerLabel(senderId);
            return label == null ? "Customer" : label;
        }
        return "System";
    }

    private String resolveAgentLabel(String userId) {
        if (userId == null || userId.isBlank()) return null;
        try {
            var display = agentProfileRepository.findDisplayNameByUserId(userId).orElse(null);
            if (display != null && !display.trim().isBlank()) return display.trim();
        } catch (Exception ignore) {
            // ignore
        }
        try {
            var u = userAccountRepository.findPublicById(userId).orElse(null);
            if (u == null) return null;
            var name = u.username() == null ? null : u.username().trim();
            if (name != null && !name.isBlank()) return name;
            var email = u.email() == null ? null : u.email().trim();
            if (email != null && !email.isBlank()) return email;
        } catch (Exception ignore) {
            // ignore
        }
        return null;
    }

    private String resolveCustomerLabel(String userId) {
        if (userId == null || userId.isBlank()) return null;
        try {
            var u = userAccountRepository.findPublicById(userId).orElse(null);
            if (u == null) return null;
            var name = u.username() == null ? null : u.username().trim();
            if (name != null && !name.isBlank()) return name;
            var email = u.email() == null ? null : u.email().trim();
            if (email != null && !email.isBlank()) return email;
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private String toPlainContent(String contentType, String contentJson) {
        var ct = contentType == null ? "" : contentType.trim().toLowerCase();
        var raw = contentJson == null ? "" : contentJson;

        try {
            JsonNode node = objectMapper.readTree(raw);
            if ("text".equals(ct)) {
                var t = node.path("text").asText("");
                return sanitizeText(t);
            }
            if ("file".equals(ct)) {
                var filename = node.path("filename").asText("");
                var size = node.path("size_bytes").asLong(0);
                var attachmentId = node.path("attachment_id").asText("");
                if (filename != null && !filename.isBlank()) {
                    var suffix = (size > 0 ? " (" + size + " bytes)" : "");
                    if (attachmentId != null && !attachmentId.isBlank()) {
                        suffix = suffix + " [" + sanitizeText(attachmentId) + "]";
                    }
                    return "[file] " + sanitizeText(filename) + suffix;
                }
                return "[file]";
            }
            // Generic best-effort.
            var preview = node.path("text").asText("");
            if (preview != null && !preview.isBlank()) {
                return "[" + ct + "] " + sanitizeText(preview);
            }
            return ct.isBlank() ? "[message]" : "[" + ct + "]";
        } catch (Exception ignored) {
            if (!ct.isBlank()) return "[" + ct + "]";
            return "[message]";
        }
    }

    private static String sanitizeText(String input) {
        if (input == null) return "";
        return input.replaceAll("\\s+", " ").trim();
    }

    private static String safeTrim(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }

    private String buildVisitorDisplay(TranscriptMeta meta) {
        if (meta == null) return null;
        if (meta.visitorName() != null && !meta.visitorName().isBlank() && meta.visitorEmail() != null && !meta.visitorEmail().isBlank()) {
            return meta.visitorName().trim() + " <" + meta.visitorEmail().trim() + ">";
        }
        if (meta.visitorName() != null && !meta.visitorName().isBlank()) return meta.visitorName().trim();
        if (meta.visitorEmail() != null && !meta.visitorEmail().isBlank()) return meta.visitorEmail().trim();
        return null;
    }

    private String formatGeo(VisitorRepository.VisitorRow v) {
        if (v == null) return null;
        var parts = new ArrayList<String>();
        if (v.geoCountry() != null && !v.geoCountry().isBlank()) parts.add(v.geoCountry().trim());
        if (v.geoRegion() != null && !v.geoRegion().isBlank()) parts.add(v.geoRegion().trim());
        if (v.geoCity() != null && !v.geoCity().isBlank()) parts.add(v.geoCity().trim());
        var loc = parts.isEmpty() ? null : String.join(", ", parts);
        if (v.geoTimezone() != null && !v.geoTimezone().isBlank()) {
            loc = (loc == null ? "" : loc + " ") + "(" + v.geoTimezone().trim() + ")";
        }
        return loc;
    }

    private String buildConsoleArchiveUrl(String conversationId) {
        if (conversationId == null || conversationId.isBlank()) return null;
        var base = (frontendBaseUrl == null || frontendBaseUrl.isBlank()) ? null : frontendBaseUrl.trim();
        if (base == null) return null;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/archives/" + conversationId;
    }

    private record PresignedLink(String url, long expiresInSeconds) {
    }

    private PresignedLink tryPresignAttachmentLink(MessageRepository.MessageRow m) {
        if (m == null) return null;
        if (m.contentType() == null || !"file".equalsIgnoreCase(m.contentType())) return null;

        try {
            JsonNode node = objectMapper.readTree(m.contentJson() == null ? "" : m.contentJson());
            var attachmentId = node.path("attachment_id").asText(null);
            if (attachmentId == null || attachmentId.isBlank()) return null;

            var presign = presignServiceProvider.getIfAvailable();
            if (presign == null) return null;

            var row = attachmentRepository.findById(m.tenantId(), attachmentId).orElse(null);
            if (row == null) return null;
            if (row.conversationId() == null || !row.conversationId().equals(m.conversationId())) return null;
            if (row.bucket() == null || row.bucket().isBlank() || row.objectKey() == null || row.objectKey().isBlank()) return null;

            var p = presign.presignGet(row.bucket(), row.objectKey());
            return new PresignedLink(p.url(), p.expiresInSeconds());
        } catch (Exception ignore) {
            return null;
        }
    }

    private String renderMessageHtml(MessageRepository.MessageRow m) {
        var ts = fmt(m.createdAt());
        var who = resolveSenderLabel(m.senderType(), m.senderId());

        var ct = m.contentType() == null ? "" : m.contentType().trim().toLowerCase();
        String contentHtml;

        if ("text".equals(ct)) {
            contentHtml = escapeHtml(extractTextFromJson(m.contentJson()));
        } else if ("file".equals(ct)) {
            var fileMeta = extractFileMeta(m.contentJson());
            var label = "[file]";
            if (fileMeta.filename() != null && !fileMeta.filename().isBlank()) {
                label += " " + escapeHtml(fileMeta.filename());
            }
            if (fileMeta.sizeBytes() > 0) {
                label += " <span style=\"color:#666\">(" + fileMeta.sizeBytes() + " bytes)</span>";
            }
            var link = tryPresignAttachmentLink(m);
            if (link != null && link.url() != null && !link.url().isBlank()) {
                label += " — <a href=\"" + escapeHtmlAttr(link.url()) + "\" target=\"_blank\" rel=\"noreferrer\">Download</a>";
                if (link.expiresInSeconds() > 0) {
                    label += " <span style=\"color:#888\">(expires in " + link.expiresInSeconds() + "s)</span>";
                }
            }
            contentHtml = label;
        } else {
            var preview = escapeHtml(toPlainContent(m.contentType(), m.contentJson()));
            contentHtml = preview;
        }

        return "<div style=\"margin:0 0 6px\">"
                + "<span style=\"color:#888\">" + escapeHtml(ts) + "</span>"
                + " <strong>" + escapeHtml(who) + "</strong>: "
                + contentHtml
                + "</div>\n";
    }

    private record FileMeta(String attachmentId, String filename, long sizeBytes) {
    }

    private FileMeta extractFileMeta(String json) {
        try {
            JsonNode node = objectMapper.readTree(json == null ? "" : json);
            return new FileMeta(
                    node.path("attachment_id").asText(null),
                    sanitizeText(node.path("filename").asText("")),
                    node.path("size_bytes").asLong(0)
            );
        } catch (Exception ignore) {
            return new FileMeta(null, null, 0);
        }
    }

    private String extractTextFromJson(String json) {
        try {
            JsonNode node = objectMapper.readTree(json == null ? "" : json);
            return sanitizeText(node.path("text").asText(""));
        } catch (Exception ignore) {
            return "";
        }
    }

    private static String safe(String s) {
        if (s == null) return "";
        return s;
    }

    private static String fmt(Instant instant) {
        if (instant == null) return "";
        return TS.format(instant);
    }

    private static String escapeHtml(String input) {
        if (input == null) return "";
        return input
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String escapeHtmlAttr(String input) {
        return escapeHtml(input);
    }
}
