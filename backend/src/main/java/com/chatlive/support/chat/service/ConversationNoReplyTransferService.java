package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class ConversationNoReplyTransferService {

    private final ConversationRepository conversationRepository;
    private final AgentProfileRepository agentProfileRepository;
    private final AssignmentService assignmentService;
    private final WsBroadcaster wsBroadcaster;

    public ConversationNoReplyTransferService(
            ConversationRepository conversationRepository,
            AgentProfileRepository agentProfileRepository,
            AssignmentService assignmentService,
            WsBroadcaster wsBroadcaster
    ) {
        this.conversationRepository = conversationRepository;
        this.agentProfileRepository = agentProfileRepository;
        this.assignmentService = assignmentService;
        this.wsBroadcaster = wsBroadcaster;
    }

    private void afterCommit(Runnable r) {
        if (r == null) return;
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        r.run();
                    } catch (Exception ignored) {
                        // ignore
                    }
                }
            });
        } else {
            r.run();
        }
    }

    @Transactional
    public boolean transferBecauseAgentDidNotReply(String tenantId, ConversationRepository.NoReplyTransferCandidateRow row) {
        if (tenantId == null || tenantId.isBlank()) return false;
        if (row == null) return false;

        var conversationId = row.id();
        var fromAgentUserId = row.assignedAgentUserId();

        // Must have another eligible online agent; otherwise do not transfer.
        var candidates = (row.skillGroupId() != null && !row.skillGroupId().isBlank())
                ? agentProfileRepository.listOnlineCandidatesForGroup(tenantId, row.skillGroupId())
                : agentProfileRepository.listOnlineCandidatesForTenant(tenantId);

        // If group candidates are empty, fallback to tenant pool (consistent with assignment behavior).
        if ((row.skillGroupId() != null && !row.skillGroupId().isBlank()) && candidates.isEmpty()) {
            candidates = agentProfileRepository.listOnlineCandidatesForTenant(tenantId);
        }

        if (candidates.isEmpty()) {
            return false;
        }
        if (fromAgentUserId != null && !fromAgentUserId.isBlank()) {
            final String exclude = fromAgentUserId;
            candidates = candidates.stream().filter(c -> c != null && !exclude.equals(c.userId())).toList();
        }
        if (candidates.isEmpty()) {
            // Only one online agent (the current one), or no alternative.
            return false;
        }

        // Best-effort: only transfer if still assigned to the same agent.
        int updated = conversationRepository.unassignToQueued(tenantId, conversationId, fromAgentUserId);
        if (updated == 0) {
            return false;
        }

        // Re-assign (best-effort) excluding the current agent.
        assignmentService.autoAssignNewConversationExcluding(tenantId, conversationId, row.skillGroupId(), fromAgentUserId);

        var access = conversationRepository.findAccess(tenantId, conversationId).orElse(null);
        var toAgentUserId = access == null ? null : access.assignedAgentUserId();

        if (toAgentUserId == null || toAgentUserId.isBlank()) {
            // No one picked up (all busy/offline/race). Restore original assignment when safe.
            conversationRepository.tryRestoreAssignment(tenantId, conversationId, fromAgentUserId);
            return false;
        }

        afterCommit(() -> {
            // Notify inbox changes.
            if (fromAgentUserId != null && !fromAgentUserId.isBlank()) {
                wsBroadcaster.notifyInboxChanged(tenantId, fromAgentUserId, conversationId, "transferred");
            }
            if (toAgentUserId != null && !toAgentUserId.isBlank()) {
                wsBroadcaster.notifyInboxChanged(tenantId, toAgentUserId, conversationId, "assigned");
            }

            ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            data.put("mode", "auto");
            if (fromAgentUserId != null) {
                data.put("from_agent_user_id", fromAgentUserId);
            }
            if (toAgentUserId != null) {
                data.put("to_agent_user_id", toAgentUserId);
            }
            wsBroadcaster.broadcastConversationEvent(tenantId, conversationId, "transferred", data);
        });

        return true;
    }
}
