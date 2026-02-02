package com.chatlive.support.publicchat.service;

import com.chatlive.support.auth.service.crypto.PasswordHasher;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.ConversationPreChatFieldRepository;
import com.chatlive.support.chat.service.AssignmentService;
import com.chatlive.support.chat.service.MessageService;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.chatlive.support.common.geo.VisitorGeoUpdater;
import com.chatlive.support.publicchat.api.CreateOrRecoverConversationRequest;
import com.chatlive.support.publicchat.api.CreateOrRecoverConversationResponse;
import com.chatlive.support.publicchat.api.PublicPageViewEventRequest;
import com.chatlive.support.publicchat.api.PublicSendFileMessageRequest;
import com.chatlive.support.publicchat.api.PublicSendTextMessageRequest;
import com.chatlive.support.user.repo.UserAccountRepository;
import com.chatlive.support.widget.repo.VisitorRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class PublicConversationService {

    private static final Pattern WIDGET_LANG_ALLOWED = Pattern.compile("^(en|zh-CN)$", Pattern.CASE_INSENSITIVE);

    private final WidgetConfigRepository widgetConfigRepository;
    private final VisitorRepository visitorRepository;
    private final UserAccountRepository userAccountRepository;
    private final PasswordHasher passwordHasher;
    private final ConversationRepository conversationRepository;
    private final AssignmentService assignmentService;
    private final MessageService messageService;
    private final WsBroadcaster wsBroadcaster;
    private final VisitorGeoUpdater visitorGeoUpdater;
    private final ConversationPreChatFieldRepository conversationPreChatFieldRepository;
    private final ObjectMapper objectMapper;

    public PublicConversationService(
            WidgetConfigRepository widgetConfigRepository,
            VisitorRepository visitorRepository,
            UserAccountRepository userAccountRepository,
            PasswordHasher passwordHasher,
            ConversationRepository conversationRepository,
            AssignmentService assignmentService,
            MessageService messageService,
            WsBroadcaster wsBroadcaster,
            VisitorGeoUpdater visitorGeoUpdater,
            ConversationPreChatFieldRepository conversationPreChatFieldRepository,
            ObjectMapper objectMapper
    ) {
        this.widgetConfigRepository = widgetConfigRepository;
        this.visitorRepository = visitorRepository;
        this.userAccountRepository = userAccountRepository;
        this.passwordHasher = passwordHasher;
        this.conversationRepository = conversationRepository;
        this.assignmentService = assignmentService;
        this.messageService = messageService;
        this.wsBroadcaster = wsBroadcaster;
        this.visitorGeoUpdater = visitorGeoUpdater;
        this.conversationPreChatFieldRepository = conversationPreChatFieldRepository;
        this.objectMapper = objectMapper;
    }

    private record PreChatFieldConfig(
            String id,
            String type,
            String label,
            Boolean required,
            java.util.List<String> options,
            String text
    ) {
    }

    public com.chatlive.support.chat.api.MessageItem sendText(HttpServletRequest request, JwtClaims claims, String conversationId, PublicSendTextMessageRequest req) {
        if (claims == null || !"visitor".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        visitorGeoUpdater.refreshGeoIfNeeded(claims.userId(), claims.siteId(), request);
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }
        var text = req == null ? null : req.text();
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("text_required");
        }

        var clientMsgId = req == null ? null : req.client_msg_id();
        var res = messageService.sendText(claims, conversationId, clientMsgId, text.trim());
        return res.item();
    }

    public com.chatlive.support.chat.api.MessageItem sendFile(HttpServletRequest request, JwtClaims claims, String conversationId, PublicSendFileMessageRequest req) {
        if (claims == null || !"visitor".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        visitorGeoUpdater.refreshGeoIfNeeded(claims.userId(), claims.siteId(), request);
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }
        var attachmentId = req == null ? null : req.attachment_id();
        if (attachmentId == null || attachmentId.isBlank()) {
            throw new IllegalArgumentException("attachment_id_required");
        }

        var clientMsgId = req == null ? null : req.client_msg_id();
        var res = messageService.sendFile(claims, conversationId, clientMsgId, attachmentId);
        return res.item();
    }

    public CreateOrRecoverConversationResponse createOrRecover(HttpServletRequest request, JwtClaims claims, CreateOrRecoverConversationRequest req) {
        if (claims == null || !"visitor".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.siteId() == null || claims.siteId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }

        var config = widgetConfigRepository.findBySiteId(claims.siteId()).orElse(null);
        var preChatEnabled = config != null && config.preChatEnabled();
        var nameRequired = config != null && config.preChatNameRequired();
        var emailRequired = config != null && config.preChatEmailRequired();

        var submitted = req == null ? null : req.pre_chat_fields();
        if (submitted == null) submitted = java.util.Map.of();

        var name = safeTrim(req == null ? null : req.name());
        var email = safeTrim(req == null ? null : req.email());

        if (preChatEnabled) {
            var cfgs = parsePreChatFields(config == null ? null : config.preChatFieldsJson());

            // Backward compatibility: if no dynamic config exists yet, fallback to legacy name/email behavior.
            if (cfgs == null || cfgs.isEmpty()) {
                if (nameRequired && (name == null || name.isBlank())) {
                    throw new IllegalArgumentException("identity_required");
                }
                if (emailRequired && (email == null || email.isBlank())) {
                    throw new IllegalArgumentException("identity_required");
                }
                if (!nameRequired && !emailRequired) {
                    if ((name == null || name.isBlank()) && (email == null || email.isBlank())) {
                        throw new IllegalArgumentException("identity_required");
                    }
                }
            } else {
                // Dynamic validation: required fields must be provided.
                boolean hasAnyInputField = false;
                boolean hasRequiredInput = false;
                boolean hasAnyValue = false;

                for (var f : cfgs) {
                    var type = safeTrim(f.type());
                    if (type == null) continue;
                    if ("info".equals(type)) continue;
                    hasAnyInputField = true;
                    var required = Boolean.TRUE.equals(f.required());
                    if (required) hasRequiredInput = true;

                    Object raw = null;
                    if ("name".equals(type)) raw = name;
                    else if ("email".equals(type)) raw = email;
                    else raw = submitted.get(f.id());

                    if (isNonEmptyValue(raw)) {
                        hasAnyValue = true;
                    } else if (required) {
                        throw new IllegalArgumentException("identity_required");
                    }
                }

                // If user configured only optional fields, require at least one value.
                if (hasAnyInputField && !hasRequiredInput && !hasAnyValue) {
                    throw new IllegalArgumentException("identity_required");
                }
            }
        }

        // Ensure visitor exists
        var visitorId = claims.userId();
        var existingVisitor = visitorRepository.findByIdAndSite(visitorId, claims.siteId()).orElse(null);
        if (existingVisitor == null) {
            visitorRepository.createAnonymousWithId(claims.siteId(), visitorId);
        }
        visitorRepository.touchLastSeen(visitorId);

        // Best-effort geo refresh (no IP stored or returned).
        visitorGeoUpdater.refreshGeoIfNeeded(visitorId, claims.siteId(), request);

        // Persist identity fields if provided
        if ((name != null && !name.isBlank()) || (email != null && !email.isBlank())) {
            visitorRepository.updateIdentity(visitorId, emptyToNull(name), emptyToNull(email));
        } else {
            // LiveChat-like behavior: if visitor stays anonymous, use a configurable default name.
            // We only set it if current visitor has no name yet (avoid overwriting real identity).
            var defaultName = extractDefaultCustomerName(config == null ? null : config.widgetPhrasesJson());
            if (defaultName != null && !defaultName.isBlank()) {
                var current = visitorRepository.findByIdAndSite(visitorId, claims.siteId()).orElse(null);
                var currentName = current == null ? null : safeTrim(current.name());
                if (currentName == null || currentName.isBlank()) {
                    var currentEmail = current == null ? null : safeTrim(current.email());
                    visitorRepository.updateIdentity(visitorId, defaultName, emptyToNull(currentEmail));
                }
            }
        }

        // Reuse existing agent-side model: create a customer user_account with id==visitorId.
        var randomPassword = UUID.randomUUID().toString();
        var passwordHash = passwordHasher.hash(randomPassword);
        userAccountRepository.ensureVisitorCustomerExists(claims.tenantId(), visitorId, emptyToNull(email), passwordHash);

        String conversationId;
        boolean recovered;

        var active = conversationRepository.findActiveBySiteVisitor(claims.tenantId(), claims.siteId(), visitorId).orElse(null);
        if (active != null) {
            conversationId = active;
            recovered = true;
        } else {
            // If the latest conversation is closed, keep reusing it. The first inbound message will reopen it.
            var latest = conversationRepository.findLatestBySiteVisitor(claims.tenantId(), claims.siteId(), visitorId).orElse(null);
            if (latest != null) {
                conversationId = latest;
                recovered = true;
            } else {
                var channel = safeTrim(req == null ? null : req.channel());
                if (channel == null || channel.isBlank()) {
                    channel = "web";
                }
                var subject = safeTrim(req == null ? null : req.subject());
                var skillGroupId = safeTrim(req == null ? null : req.skill_group_id());

                conversationId = conversationRepository.createForVisitor(
                        claims.tenantId(),
                        visitorId,
                        channel,
                        skillGroupId,
                        subject,
                        claims.siteId(),
                        visitorId
                );

                // Persist a "started" system event for timeline/history (LiveChat-style).
                var started = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                started.put("mode", "visitor_created");
                started.put("site_id", claims.siteId());
                started.put("visitor_id", visitorId);
                wsBroadcaster.broadcastConversationEvent(claims.tenantId(), conversationId, "started", started);

                assignmentService.autoAssignNewConversation(claims.tenantId(), conversationId, skillGroupId);
                recovered = false;
            }
        }

        // Persist pre-chat form submissions (best-effort; do not block conversation creation).
        if (preChatEnabled) {
            try {
                persistPreChatFields(claims.tenantId(), conversationId, config == null ? null : config.preChatFieldsJson(), name, email, submitted);
            } catch (Exception ignore) {
                // ignore
            }
        }

        return new CreateOrRecoverConversationResponse(conversationId, recovered);
    }

    private static String extractDefaultCustomerName(String widgetPhrasesJson) {
        var raw = safeTrim(widgetPhrasesJson);
        if (raw == null || raw.isBlank()) return null;
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var node = mapper.readTree(raw);
            if (node == null || !node.isObject()) return null;
            var v = node.get("default_customer_name");
            if (v == null || !v.isTextual()) return null;
            var t = v.asText();
            t = t == null ? null : t.trim();
            return (t == null || t.isBlank()) ? null : t;
        } catch (Exception ignore) {
            return null;
        }
    }

    private java.util.List<PreChatFieldConfig> parsePreChatFields(String preChatFieldsJson) {
        var json = safeTrim(preChatFieldsJson);
        if (json == null || json.isBlank()) return java.util.List.of();
        try {
            JsonNode node = objectMapper.readTree(json);
            if (node == null || !node.isArray()) return java.util.List.of();
            var out = new java.util.ArrayList<PreChatFieldConfig>();
            for (var item : node) {
                if (item == null || !item.isObject()) continue;
                var id = safeTrim(item.path("id").asText(null));
                var type = safeTrim(item.path("type").asText(null));
                var label = safeTrim(item.path("label").asText(null));
                Boolean required = null;
                if (item.has("required") && item.get("required").isBoolean()) {
                    required = item.get("required").asBoolean();
                }

                java.util.List<String> options = null;
                if (item.has("options") && item.get("options").isArray()) {
                    var opts = new java.util.ArrayList<String>();
                    for (var opt : item.get("options")) {
                        var s = safeTrim(opt == null ? null : opt.asText(null));
                        if (s != null && !s.isBlank()) opts.add(s);
                    }
                    options = opts;
                }

                var text = safeTrim(item.path("text").asText(null));
                if (id == null || id.isBlank()) continue;
                if (type == null || type.isBlank()) continue;
                out.add(new PreChatFieldConfig(id, type, label, required, options, text));
            }
            return out;
        } catch (Exception ignore) {
            return java.util.List.of();
        }
    }

    private void persistPreChatFields(
            String tenantId,
            String conversationId,
            String preChatFieldsJson,
            String name,
            String email,
            java.util.Map<String, Object> submitted
    ) {
        if (tenantId == null || tenantId.isBlank()) return;
        if (conversationId == null || conversationId.isBlank()) return;

        var cfgs = parsePreChatFields(preChatFieldsJson);
        if (cfgs == null || cfgs.isEmpty()) {
            // Legacy mode: persist provided identity as fields.
            if (name != null && !name.isBlank()) {
                upsertPreChatField(tenantId, conversationId, "name", "Name", "name", name);
            }
            if (email != null && !email.isBlank()) {
                upsertPreChatField(tenantId, conversationId, "email", "Email", "email", email);
            }
            return;
        }

        for (var f : cfgs) {
            if (f == null) continue;
            var type = safeTrim(f.type());
            if (type == null || type.isBlank()) continue;
            if ("info".equals(type)) continue;

            Object raw;
            if ("name".equals(type)) raw = name;
            else if ("email".equals(type)) raw = email;
            else raw = submitted.get(f.id());

            if (!isNonEmptyValue(raw)) continue;

            var label = safeTrim(f.label());
            if (label == null || label.isBlank()) {
                label = f.id();
            }
            upsertPreChatField(tenantId, conversationId, f.id(), label, type, raw);
        }
    }

    private void upsertPreChatField(String tenantId, String conversationId, String fieldKey, String fieldLabel, String fieldType, Object raw) {
        try {
            var json = objectMapper.writeValueAsString(raw);
            conversationPreChatFieldRepository.upsert(tenantId, conversationId, fieldKey, fieldLabel, fieldType, json);
        } catch (Exception ignore) {
            // ignore
        }
    }

    private static boolean isNonEmptyValue(Object raw) {
        if (raw == null) return false;
        if (raw instanceof String s) {
            return !s.trim().isBlank();
        }
        if (raw instanceof java.util.Collection<?> c) {
            return !c.isEmpty();
        }
        if (raw instanceof java.util.Map<?, ?> m) {
            return !m.isEmpty();
        }
        return true;
    }

    public void recordPageView(HttpServletRequest request, JwtClaims claims, String conversationId, PublicPageViewEventRequest req) {
        if (claims == null || !"visitor".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.siteId() == null || claims.siteId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.userId() == null || claims.userId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        // Best-effort persist client info (ip/ua) for agent Technology panel.
        visitorGeoUpdater.refreshGeoIfNeeded(claims.userId(), claims.siteId(), request);

        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        var canAccess = access.siteId() != null
                && !access.siteId().isBlank()
                && claims.siteId().equals(access.siteId())
                && access.visitorId() != null
                && !access.visitorId().isBlank()
                && claims.userId().equals(access.visitorId());
        if (!canAccess) {
            throw new IllegalArgumentException("forbidden");
        }

        var url = safeTrim(req == null ? null : req.url());
        if (url == null || url.isBlank()) {
            // Best-effort / optional tracking.
            return;
        }
        if (url.length() > 4096) {
            url = url.substring(0, 4096);
        }

        var title = safeTrim(req == null ? null : req.title());
        if (title != null && title.length() > 512) {
            title = title.substring(0, 512);
        }

        var referrer = safeTrim(req == null ? null : req.referrer());
        if (referrer != null && referrer.length() > 4096) {
            referrer = referrer.substring(0, 4096);
        }

        var data = JsonNodeFactory.instance.objectNode();
        data.put("url", url);
        if (title != null && !title.isBlank()) {
            data.put("title", title);
        }
        if (referrer != null && !referrer.isBlank()) {
            data.put("referrer", referrer);
        }

        wsBroadcaster.broadcastConversationEvent(claims.tenantId(), conversationId, "page_view", data);
    }

    private static String safeTrim(String s) {
        return s == null ? null : s.trim();
    }

    private static String emptyToNull(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }
}
