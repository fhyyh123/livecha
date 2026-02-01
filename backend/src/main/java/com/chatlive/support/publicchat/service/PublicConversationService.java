package com.chatlive.support.publicchat.service;

import com.chatlive.support.auth.service.crypto.PasswordHasher;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.repo.ConversationRepository;
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
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class PublicConversationService {

    private final WidgetConfigRepository widgetConfigRepository;
    private final VisitorRepository visitorRepository;
    private final UserAccountRepository userAccountRepository;
    private final PasswordHasher passwordHasher;
    private final ConversationRepository conversationRepository;
    private final AssignmentService assignmentService;
    private final MessageService messageService;
    private final WsBroadcaster wsBroadcaster;
    private final VisitorGeoUpdater visitorGeoUpdater;

    public PublicConversationService(
            WidgetConfigRepository widgetConfigRepository,
            VisitorRepository visitorRepository,
            UserAccountRepository userAccountRepository,
            PasswordHasher passwordHasher,
            ConversationRepository conversationRepository,
            AssignmentService assignmentService,
            MessageService messageService,
            WsBroadcaster wsBroadcaster,
            VisitorGeoUpdater visitorGeoUpdater
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

        var name = safeTrim(req == null ? null : req.name());
        var email = safeTrim(req == null ? null : req.email());

        if (preChatEnabled) {
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
        }

        // Reuse existing agent-side model: create a customer user_account with id==visitorId.
        var randomPassword = UUID.randomUUID().toString();
        var passwordHash = passwordHasher.hash(randomPassword);
        userAccountRepository.ensureVisitorCustomerExists(claims.tenantId(), visitorId, emptyToNull(email), passwordHash);

        var active = conversationRepository.findActiveBySiteVisitor(claims.tenantId(), claims.siteId(), visitorId).orElse(null);
        if (active != null) {
            return new CreateOrRecoverConversationResponse(active, true);
        }

        // If the latest conversation is closed, keep reusing it. The first inbound message will reopen it.
        var latest = conversationRepository.findLatestBySiteVisitor(claims.tenantId(), claims.siteId(), visitorId).orElse(null);
        if (latest != null) {
            return new CreateOrRecoverConversationResponse(latest, true);
        }

        var channel = safeTrim(req == null ? null : req.channel());
        if (channel == null || channel.isBlank()) {
            channel = "web";
        }
        var subject = safeTrim(req == null ? null : req.subject());
        var skillGroupId = safeTrim(req == null ? null : req.skill_group_id());

        var conversationId = conversationRepository.createForVisitor(
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

        return new CreateOrRecoverConversationResponse(conversationId, false);
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
