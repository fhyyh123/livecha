package com.chatlive.support.chat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.repo.AssignCursorRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.service.assignment.AssignmentContext;
import com.chatlive.support.chat.service.assignment.AssignmentStrategyResolver;
import com.chatlive.support.user.repo.UserAccountRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;

import com.chatlive.support.chat.ws.WsBroadcaster;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.ArrayList;

@Service
public class AssignmentService {

    private static final Logger log = LoggerFactory.getLogger(AssignmentService.class);

    private static final String DEFAULT_GROUP_KEY = "__default__";

    private final ConversationRepository conversationRepository;
    private final AgentProfileRepository agentProfileRepository;
    private final AssignCursorRepository assignCursorRepository;
    private final WsBroadcaster wsBroadcaster;
    private final AssignmentStrategyResolver assignmentStrategyResolver;
    private final UserAccountRepository userAccountRepository;

        private final Counter onlineTriggerAttempts;
        private final Counter onlineTriggerAssignedTotal;
        private final DistributionSummary onlineTriggerAssignedPerTrigger;
        private final DistributionSummary onlineTriggerScannedPerTrigger;
        private final Timer onlineTriggerDuration;

    public AssignmentService(
            ConversationRepository conversationRepository,
            AgentProfileRepository agentProfileRepository,
            AssignCursorRepository assignCursorRepository,
            WsBroadcaster wsBroadcaster,
            AssignmentStrategyResolver assignmentStrategyResolver,
            UserAccountRepository userAccountRepository,
            MeterRegistry meterRegistry
    ) {
        this.conversationRepository = conversationRepository;
        this.agentProfileRepository = agentProfileRepository;
        this.assignCursorRepository = assignCursorRepository;
        this.wsBroadcaster = wsBroadcaster;
        this.assignmentStrategyResolver = assignmentStrategyResolver;
        this.userAccountRepository = userAccountRepository;

        // Low-cardinality metrics: do NOT tag by tenant/agent/conversation.
        this.onlineTriggerAttempts = Counter.builder("chatlive.assignment.online_trigger.attempts")
            .description("Number of online-trigger assignment attempts")
            .register(meterRegistry);
        this.onlineTriggerAssignedTotal = Counter.builder("chatlive.assignment.online_trigger.assigned_total")
            .description("Total number of conversations assigned by online-trigger")
            .register(meterRegistry);
        this.onlineTriggerAssignedPerTrigger = DistributionSummary.builder("chatlive.assignment.online_trigger.assigned")
            .description("Assigned count per online-trigger")
            .baseUnit("conversations")
            .register(meterRegistry);
        this.onlineTriggerScannedPerTrigger = DistributionSummary.builder("chatlive.assignment.online_trigger.scanned")
            .description("Scanned queued rows per online-trigger")
            .baseUnit("rows")
            .register(meterRegistry);
        this.onlineTriggerDuration = Timer.builder("chatlive.assignment.online_trigger.duration")
            .description("Duration of online-trigger assignment")
            .register(meterRegistry);
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

    private void putAgentLabel(ObjectNode data, String displayNameKey, String userId) {
        if (data == null) return;
        if (userId == null || userId.isBlank()) return;

        var label = resolveAgentLabel(userId);
        if (label != null && !label.isBlank()) {
            data.put(displayNameKey, label);
        }
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
    
    public int getAssignedActiveCount(String tenantId, String agentUserId) {
        return conversationRepository.countActiveAssignedToAgent(tenantId, agentUserId);
    }

    public record AssignToAgentResult(int assigned_count, List<String> picked_ids, int scanned) {
    }

    @Transactional
    public void autoAssignNewConversation(String tenantId, String conversationId, String skillGroupId) {
        autoAssignNewConversationExcluding(tenantId, conversationId, skillGroupId, null);
    }

    /**
     * Auto-assign a conversation, optionally excluding one agent userId.
     *
     * This is used by the "agent no reply -> transfer" feature to ensure the conversation doesn't get
     * assigned back to the same agent immediately.
     */
    @Transactional
    public void autoAssignNewConversationExcluding(String tenantId, String conversationId, String skillGroupId, String excludeAgentUserId) {
        boolean requestedGroup = skillGroupId != null && !skillGroupId.isBlank();

        // Decide candidates first (no locks). If the requested group is empty/unavailable, fallback to default pool.
        String effectiveGroupKey = requestedGroup ? skillGroupId : DEFAULT_GROUP_KEY;
        List<AgentProfileRepository.AgentCandidateRow> candidates = requestedGroup
                ? agentProfileRepository.listOnlineCandidatesForGroup(tenantId, skillGroupId)
                : agentProfileRepository.listOnlineCandidatesForTenant(tenantId);

        if (requestedGroup && candidates.isEmpty()) {
            effectiveGroupKey = DEFAULT_GROUP_KEY;
            candidates = agentProfileRepository.listOnlineCandidatesForTenant(tenantId);
        }

        if (excludeAgentUserId != null && !excludeAgentUserId.isBlank()) {
            final String exclude = excludeAgentUserId;
            candidates = candidates.stream().filter(c -> c != null && !exclude.equals(c.userId())).toList();
        }

        if (candidates.isEmpty()) {
            // keep queued
            return;
        }

        var cursor = assignCursorRepository.lockForUpdate(tenantId, effectiveGroupKey);

        var candidateIds = candidates.stream().map(AgentProfileRepository.AgentCandidateRow::userId).toList();
        var loads = conversationRepository.countActiveAssignedByAgents(tenantId, candidateIds);

        var ctx = new AssignmentContext(
                tenantId,
            effectiveGroupKey,
                cursor.lastAgentUserId(),
                candidates,
                loads
        );

        AgentProfileRepository.AgentCandidateRow selected = assignmentStrategyResolver.resolve(ctx).select(ctx);

        if (selected == null) {
            // all busy
            return;
        }

        var updated = conversationRepository.tryAssignToAgent(tenantId, conversationId, selected.userId());
        if (updated == 1) {
            assignCursorRepository.updateLastAgent(tenantId, effectiveGroupKey, selected.userId());

            var agentUserId = selected.userId();
            afterCommit(() -> {
                wsBroadcaster.notifyInboxChanged(tenantId, agentUserId, conversationId, "assigned");

                ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                data.put("to_agent_user_id", agentUserId);
                putAgentLabel(data, "to_agent_display_name", agentUserId);
                data.put("mode", "auto");
                wsBroadcaster.broadcastConversationEvent(tenantId, conversationId, "assigned", data);
            });
        }
    }

    /**
     * Retry assigning queued conversations.
     *
     * @return number of conversations successfully assigned
     */
    @Transactional
    public int tryAssignFromQueue(String tenantId, int limit) {
        var rows = conversationRepository.listQueuedForAssignment(tenantId, Math.max(1, Math.min(limit, 500)));
        var assigned = 0;
        for (var row : rows) {
            autoAssignNewConversation(tenantId, row.id(), row.skillGroupId());
            var conv = conversationRepository.findAccess(tenantId, row.id()).orElse(null);
            if (conv != null && conv.assignedAgentUserId() != null && !conv.assignedAgentUserId().isBlank()) {
                assigned++;
            }
        }
        return assigned;
    }

    /**
     * Assign queued conversations to a specific agent, and report details for logging/observability.
     * This is primarily used by the "agent turns online" trigger.
     */
    @Transactional
    public AssignToAgentResult tryAssignFromQueueToAgent(String tenantId, String agentUserId, int maxToAssign) {
        onlineTriggerAttempts.increment();
        Timer.Sample sample = Timer.start();
        try {
            if (maxToAssign <= 0) {
                return new AssignToAgentResult(0, List.of(), 0);
            }

            var profile = agentProfileRepository.findByUserId(agentUserId).orElse(null);
            if (profile == null || !"online".equals(profile.status())) {
                return new AssignToAgentResult(0, List.of(), 0);
            }

            var maxConcurrent = Math.max(1, profile.maxConcurrent());
            var active = conversationRepository.countActiveAssignedToAgent(tenantId, agentUserId);
            var remaining = Math.max(0, maxConcurrent - active);
            var target = Math.min(Math.max(0, maxToAssign), remaining);
            if (target <= 0) {
                return new AssignToAgentResult(0, List.of(), 0);
            }

            // Scan a bit more than target to tolerate races, but never assign beyond target.
            var scanLimit = Math.min(target * 5, 200);
            var rows = conversationRepository.listQueuedForAgent(tenantId, agentUserId, scanLimit);

            var picked = new ArrayList<String>(Math.min(target, 32));
            for (var row : rows) {
                if (picked.size() >= target) {
                    break;
                }
                var updated = conversationRepository.tryAssignToAgent(tenantId, row.id(), agentUserId);
                if (updated == 1) {
                    picked.add(row.id());
                }
            }

            int assigned = picked.size();
            onlineTriggerAssignedTotal.increment(assigned);
            onlineTriggerAssignedPerTrigger.record(assigned);
            onlineTriggerScannedPerTrigger.record(rows.size());

            if (assigned > 0) {
                afterCommit(() -> wsBroadcaster.notifyInboxChanged(tenantId, agentUserId, null, "assigned"));
            }
            return new AssignToAgentResult(assigned, List.copyOf(picked), rows.size());
        } catch (Exception e) {
            // Avoid breaking the status update path; log and return empty result.
            log.warn("online_trigger_assign_failed tenantId={} agentUserId={}", tenantId, agentUserId, e);
            return new AssignToAgentResult(0, List.of(), 0);
        } finally {
            sample.stop(onlineTriggerDuration);
        }
    }

    @Transactional
    public void claimConversation(JwtClaims claims, String conversationId) {
        if (claims == null || "customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        String beforeAssigned = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .map(ConversationRepository.ConversationAccessRow::assignedAgentUserId)
                .orElse(null);

        var updated = conversationRepository.tryClaim( claims.tenantId(), conversationId, claims.userId());
        if (updated == 0) {
            throw new IllegalArgumentException("claim_failed");
        }

        var tenantId = claims.tenantId();
        var newAgentUserId = claims.userId();
        afterCommit(() -> {
            wsBroadcaster.notifyInboxChanged(tenantId, newAgentUserId, conversationId, "claimed");

            ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            data.put("by_user_id", newAgentUserId);
            putAgentLabel(data, "by_display_name", newAgentUserId);
            if (beforeAssigned != null && !beforeAssigned.isBlank()) {
                data.put("from_agent_user_id", beforeAssigned);
                putAgentLabel(data, "from_agent_display_name", beforeAssigned);
            }
            data.put("to_agent_user_id", newAgentUserId);
            putAgentLabel(data, "to_agent_display_name", newAgentUserId);
            wsBroadcaster.broadcastConversationEvent(tenantId, conversationId, "claimed", data);

            if (beforeAssigned != null && !beforeAssigned.isBlank() && !beforeAssigned.equals(newAgentUserId)) {
                ObjectNode tr = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                tr.put("from_agent_user_id", beforeAssigned);
                putAgentLabel(tr, "from_agent_display_name", beforeAssigned);
                tr.put("to_agent_user_id", newAgentUserId);
                putAgentLabel(tr, "to_agent_display_name", newAgentUserId);
                tr.put("by_user_id", newAgentUserId);
                putAgentLabel(tr, "by_display_name", newAgentUserId);
                wsBroadcaster.broadcastConversationEvent(tenantId, conversationId, "transferred", tr);
            }
        });
        if (beforeAssigned != null && !beforeAssigned.isBlank() && !beforeAssigned.equals(newAgentUserId)) {
            afterCommit(() -> wsBroadcaster.notifyInboxChanged(tenantId, beforeAssigned, conversationId, "transferred_out"));
        }
    }

    @Transactional
    public void assignConversation(JwtClaims claims, String conversationId, String agentUserId) {
        if (claims == null || "customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        String beforeAssigned = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .map(ConversationRepository.ConversationAccessRow::assignedAgentUserId)
                .orElse(null);

        // admin/agent 都允许显式指派（后续可收紧）
        var updated = conversationRepository.forceAssign(claims.tenantId(), conversationId, agentUserId);
        if (updated == 0) {
            throw new IllegalArgumentException("assign_failed");
        }

        var tenantId = claims.tenantId();
        var newAgentUserId = agentUserId;
        afterCommit(() -> {
            wsBroadcaster.notifyInboxChanged(tenantId, newAgentUserId, conversationId, "transferred_in");

            ObjectNode tr = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            if (beforeAssigned != null && !beforeAssigned.isBlank()) {
                tr.put("from_agent_user_id", beforeAssigned);
                putAgentLabel(tr, "from_agent_display_name", beforeAssigned);
            }
            tr.put("to_agent_user_id", newAgentUserId);
            putAgentLabel(tr, "to_agent_display_name", newAgentUserId);
            if (claims != null && claims.userId() != null && !claims.userId().isBlank()) {
                tr.put("by_user_id", claims.userId());
                putAgentLabel(tr, "by_display_name", claims.userId());
            }
            wsBroadcaster.broadcastConversationEvent(tenantId, conversationId, "transferred", tr);
        });
        if (beforeAssigned != null && !beforeAssigned.isBlank() && !beforeAssigned.equals(newAgentUserId)) {
            afterCommit(() -> wsBroadcaster.notifyInboxChanged(tenantId, beforeAssigned, conversationId, "transferred_out"));
        }
    }
}
