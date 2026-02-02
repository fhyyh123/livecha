package com.chatlive.support.chat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.api.*;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.repo.ConversationMarkRepository;
import com.chatlive.support.chat.repo.ConversationPreChatFieldRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.SkillGroupRepository;
import com.chatlive.support.chat.ws.WsSessionRegistry;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.chatlive.support.user.repo.UserAccountRepository;
import com.chatlive.support.widget.repo.VisitorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

@Service
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final WsSessionRegistry wsSessionRegistry;
    private final WsBroadcaster wsBroadcaster;
    private final AssignmentService assignmentService;
    private final UserAccountRepository userAccountRepository;
    private final VisitorRepository visitorRepository;
    private final SkillGroupRepository skillGroupRepository;
    private final ConversationMarkRepository conversationMarkRepository;
    private final AgentProfileRepository agentProfileRepository;
    private final ConversationPreChatFieldRepository conversationPreChatFieldRepository;

    public ConversationService(
            ConversationRepository conversationRepository,
            WsSessionRegistry wsSessionRegistry,
            WsBroadcaster wsBroadcaster,
            AssignmentService assignmentService,
            UserAccountRepository userAccountRepository,
            VisitorRepository visitorRepository,
            SkillGroupRepository skillGroupRepository,
            ConversationMarkRepository conversationMarkRepository,
            AgentProfileRepository agentProfileRepository,
            ConversationPreChatFieldRepository conversationPreChatFieldRepository
    ) {
        this.conversationRepository = conversationRepository;
        this.wsSessionRegistry = wsSessionRegistry;
        this.wsBroadcaster = wsBroadcaster;
        this.assignmentService = assignmentService;
        this.userAccountRepository = userAccountRepository;
        this.visitorRepository = visitorRepository;
        this.skillGroupRepository = skillGroupRepository;
        this.conversationMarkRepository = conversationMarkRepository;
        this.agentProfileRepository = agentProfileRepository;
        this.conversationPreChatFieldRepository = conversationPreChatFieldRepository;
    }

    private String resolveAgentLabel(String userId) {
        if (userId == null || userId.isBlank()) return null;

        var display = agentProfileRepository.findDisplayNameByUserId(userId)
                .map(s -> s == null ? null : s.trim())
                .orElse(null);
        if (display != null && !display.isBlank()) return display;

        return userAccountRepository.findPublicById(userId)
                .map(u -> u.username() == null ? null : u.username().trim())
                .filter(s -> s != null && !s.isBlank())
                .orElse(null);
    }

    private void afterCommit(Runnable r) {
        if (r == null) return;
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        r.run();
                    } catch (Exception ignore) {
                        // ignore
                    }
                }
            });
        } else {
            r.run();
        }
    }

    public CreateConversationResponse createConversation(JwtClaims claims, CreateConversationRequest req) {
        var id = conversationRepository.create(
                claims.tenantId(),
                claims.userId(),
                req.channel(),
                req.skill_group_id(),
                req.subject()
        );

        // Persist a "started" system event for timeline/history (LiveChat-style).
        ObjectNode started = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        started.put("mode", "agent_created");
        started.put("by_user_id", claims.userId());
        wsBroadcaster.broadcastConversationEvent(claims.tenantId(), id, "started", started);

        // 自动分配（round-robin）：如果没有在线坐席或都满载，会保持 queued
        assignmentService.autoAssignNewConversation(claims.tenantId(), id, req.skill_group_id());

        return new CreateConversationResponse(id);
    }

    public List<ConversationSummary> listMyConversations(JwtClaims claims, String status, boolean starredOnly) {
        if ("customer".equals(claims.role())) {
            return conversationRepository.listByCustomer(claims.tenantId(), claims.userId(), status);
        }

        // Archives behavior: allow tenant agents/admins to see all closed conversations.
        if (("agent".equals(claims.role()) || "admin".equals(claims.role())) && "closed".equals(status)) {
            return conversationRepository.listClosedForAgent(claims.tenantId(), claims.userId(), starredOnly);
        }

        var subscribed = wsSessionRegistry.getUserSubscribedConversationIds(claims.userId());
        return conversationRepository.listVisibleToAgent(claims.tenantId(), claims.userId(), subscribed, status, starredOnly);
    }

    public ConversationDetailResponse getConversationDetail(JwtClaims claims, String conversationId) {
        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, access);

        var detail = conversationRepository.findDetail(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));

        var customer = userAccountRepository.findPublicById(detail.customerUserId())
                .map(u -> new UserPublicProfile(u.id(), u.username(), u.phone(), u.email()))
                .orElse(null);

        String skillGroupName = null;
        if (detail.skillGroupId() != null && !detail.skillGroupId().isBlank()) {
            skillGroupName = skillGroupRepository.findById(claims.tenantId(), detail.skillGroupId())
                .map(SkillGroupRepository.SkillGroupRow::name)
                .orElse(null);
        }

        VisitorPublicProfile visitor = null;
        if (access.siteId() != null && !access.siteId().isBlank() && access.visitorId() != null && !access.visitorId().isBlank()) {
            var v = visitorRepository.findByIdAndSite(access.visitorId(), access.siteId()).orElse(null);
            if (v != null) {
                var count = conversationRepository.countBySiteVisitor(claims.tenantId(), access.siteId(), access.visitorId());
                var geoUpdatedAt = v.geoUpdatedAt() == null ? null : v.geoUpdatedAt().getEpochSecond();
                visitor = new VisitorPublicProfile(
                        v.id(),
                        v.siteId(),
                        v.name(),
                        v.email(),
                    v.lastIp(),
                    v.lastUserAgent(),
                        v.geoCountry(),
                        v.geoRegion(),
                        v.geoCity(),
                        v.geoLat(),
                        v.geoLon(),
                        v.geoTimezone(),
                        geoUpdatedAt,
                        count,
                        count
                );
            }
        }

        var starred = false;
        if (claims.userId() != null && ("agent".equals(claims.role()) || "admin".equals(claims.role()))) {
            starred = conversationMarkRepository.findStarred(claims.tenantId(), conversationId, claims.userId()).orElse(false);
        }

        Long activeDurationSeconds = conversationRepository.findActiveDurationSeconds(claims.tenantId(), conversationId);

        var preChatFields = conversationPreChatFieldRepository.listByConversation(claims.tenantId(), conversationId)
            .stream()
            .map(r -> new ConversationPreChatFieldItem(
                r.fieldKey(),
                r.fieldLabel(),
                r.fieldType(),
                r.valueJson()
            ))
            .toList();

        return new ConversationDetailResponse(
                detail.id(),
                detail.status(),
                detail.channel(),
                detail.subject(),
                detail.customerUserId(),
                detail.assignedAgentUserId(),
                access.siteId(),
                access.visitorId(),
                detail.skillGroupId(),
                skillGroupName,
                detail.createdAt().getEpochSecond(),
                detail.lastMsgAt().getEpochSecond(),
            detail.closedAt() == null ? null : detail.closedAt().getEpochSecond(),
                activeDurationSeconds,
                customer,
                visitor,
            preChatFields,
                starred
        );
    }

    public void setStarred(JwtClaims claims, String conversationId, boolean starred) {
        if (claims == null || claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (!("agent".equals(claims.role()) || "admin".equals(claims.role()))) {
            throw new IllegalArgumentException("forbidden");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, access);

        conversationMarkRepository.upsertStarred(claims.tenantId(), conversationId, claims.userId(), starred);
    }

    @Transactional
    public void closeConversation(JwtClaims claims, String conversationId, String reason) {
        if (claims == null || claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (!("agent".equals(claims.role()) || "admin".equals(claims.role()))) {
            throw new IllegalArgumentException("forbidden");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, access);

        final String safeReason = (reason == null || reason.isBlank()) ? null : reason.trim();

        // Idempotent: closing an already-closed conversation is OK.
        // Persist reason for list rendering; do not infer inactivity minutes for manual close.
        conversationRepository.closeConversation(claims.tenantId(), conversationId, claims.userId(), safeReason, null);
        afterCommit(() -> {
            ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            data.put("by_user_id", claims.userId());
            var byLabel = resolveAgentLabel(claims.userId());
            if (byLabel != null && !byLabel.isBlank()) {
                data.put("by_display_name", byLabel);
            }
            if (safeReason != null) {
                data.put("reason", safeReason);
            }
            wsBroadcaster.broadcastConversationEvent(claims.tenantId(), conversationId, "archived", data);
        });
    }

    /**
     * Internal job: auto-archive conversations that have been inactive for a long time.
     *
     * This method is idempotent.
     */
    @Transactional
    public void closeConversationForInactivity(String tenantId, String conversationId, long inactivityMinutes) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        // Normalize minutes for stable UI wording.
        long safeMinutes = Math.max(1, Math.min(inactivityMinutes, 365L * 24 * 60));

        // Idempotent.
        conversationRepository.closeConversation(
            tenantId,
            conversationId,
            null,
            "inactivity_" + safeMinutes,
            (int) safeMinutes
        );

        afterCommit(() -> {
            ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            data.put("mode", "auto");
            data.put("reason", "inactivity_" + safeMinutes);
            data.put("inactivity_minutes", safeMinutes);
            wsBroadcaster.broadcastConversationEvent(tenantId, conversationId, "archived", data);
        });
    }

    @Transactional
    public void reopenConversation(JwtClaims claims, String conversationId) {
        if (claims == null || claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (!("agent".equals(claims.role()) || "admin".equals(claims.role()))) {
            throw new IllegalArgumentException("forbidden");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, access);

        var updated = conversationRepository.reopenConversation(claims.tenantId(), conversationId, claims.userId());
        if (updated == 0) {
            // If it wasn't closed, treat as no-op.
            return;
        }

        afterCommit(() -> {
            ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            data.put("by_user_id", claims.userId());
            var byLabel = resolveAgentLabel(claims.userId());
            if (byLabel != null && !byLabel.isBlank()) {
                data.put("by_display_name", byLabel);
            }
            wsBroadcaster.broadcastConversationEvent(claims.tenantId(), conversationId, "reopened", data);
        });
    }

    private void ensureCanAccessConversation(JwtClaims claims, ConversationRepository.ConversationAccessRow conv) {
        if ("customer".equals(claims.role())) {
            if (!claims.userId().equals(conv.customerUserId())) {
                throw new IllegalArgumentException("forbidden");
            }
            return;
        }

        if (claims.tenantId() == null || !claims.tenantId().equals(conv.tenantId())) {
            throw new IllegalArgumentException("forbidden");
        }

        // Archives: closed conversations are tenant-readable (read-only enforcement happens at message send).
        if ("closed".equals(conv.status())) {
            return;
        }

        if (claims.userId() != null && claims.userId().equals(conv.assignedAgentUserId())) {
            return;
        }
        if (claims.userId() != null && wsSessionRegistry.hasUserSubscribedConversation(claims.userId(), conv.id())) {
            return;
        }

        throw new IllegalArgumentException("forbidden");
    }
}
