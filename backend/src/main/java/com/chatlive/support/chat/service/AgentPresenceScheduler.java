package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.repo.AgentSessionRepository;
import com.chatlive.support.chat.repo.PgAdvisoryLockRepository;
import com.chatlive.support.chat.repo.TenantRepository;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

@Component
public class AgentPresenceScheduler {

    private static final Logger log = LoggerFactory.getLogger(AgentPresenceScheduler.class);

    private final TenantRepository tenantRepository;
    private final PgAdvisoryLockRepository lockRepository;
    private final AgentSessionRepository agentSessionRepository;
    private final AgentProfileRepository agentProfileRepository;
    private final AssignmentService assignmentService;
    private final AgentPresenceService agentPresenceService;
    private final WsBroadcaster broadcaster;
    private final ObjectMapper objectMapper;

    private final int batchSize;

    public AgentPresenceScheduler(
            TenantRepository tenantRepository,
            PgAdvisoryLockRepository lockRepository,
            AgentSessionRepository agentSessionRepository,
            AgentProfileRepository agentProfileRepository,
            AssignmentService assignmentService,
            AgentPresenceService agentPresenceService,
            WsBroadcaster broadcaster,
            ObjectMapper objectMapper,
            @Value("${app.agent.presence.sweep-batch-size:200}") int batchSize
    ) {
        this.tenantRepository = tenantRepository;
        this.lockRepository = lockRepository;
        this.agentSessionRepository = agentSessionRepository;
        this.agentProfileRepository = agentProfileRepository;
        this.assignmentService = assignmentService;
        this.agentPresenceService = agentPresenceService;
        this.broadcaster = broadcaster;
        this.objectMapper = objectMapper;
        this.batchSize = Math.max(1, Math.min(batchSize, 1000));
    }

    @Scheduled(fixedDelayString = "${app.agent.presence.sweep-interval-ms:5000}")
    public void sweepExpiredSessions() {
        for (var tenantId : tenantRepository.listTenantIds()) {
            var lockKey = "agent_presence_sweep:" + tenantId;
            if (!lockRepository.tryLock(lockKey)) {
                continue;
            }

            try {
                var expired = agentSessionRepository.listExpiredSessions(tenantId, batchSize);
                if (expired.isEmpty()) continue;

                var sessionIds = expired.stream().map(AgentSessionRepository.AgentSessionRow::sessionId).toList();
                agentSessionRepository.deleteSessions(sessionIds);

                Set<String> affectedUsers = new HashSet<>();
                for (var row : expired) {
                    if (row.userId() != null && !row.userId().isBlank()) {
                        affectedUsers.add(row.userId());
                    }
                }

                for (var userId : affectedUsers) {
                    if (agentPresenceService.hasActiveSession(userId)) continue;
                    broadcastAgentStatus(tenantId, userId);
                }
            } catch (Exception e) {
                log.warn("agent_presence_sweep_failed tenant={}", tenantId, e);
            } finally {
                lockRepository.unlock(lockKey);
            }
        }
    }

    private void broadcastAgentStatus(String tenantId, String userId) {
        if (tenantId == null || tenantId.isBlank() || userId == null || userId.isBlank()) return;
        var profile = agentProfileRepository.findByUserId(userId)
                .orElse(new AgentProfileRepository.AgentProfileRow(userId, "offline", 3));
        var assignedActive = assignmentService.getAssignedActiveCount(tenantId, userId);
        var maxC = Math.max(1, profile.maxConcurrent());
        var remaining = Math.max(0, maxC - assignedActive);
        var hasPresence = agentPresenceService.hasActiveSession(userId);
        var status = hasPresence ? profile.status() : "offline";
        var effective = ("online".equals(status) && remaining == 0) ? "busy" : status;
        var canAccept = "online".equals(status) && remaining > 0;

        ObjectNode evt = objectMapper.createObjectNode();
        evt.put("user_id", userId);
        evt.put("status", status);
        evt.put("effective_status", effective);
        evt.put("max_concurrent", maxC);
        evt.put("assigned_active", assignedActive);
        evt.put("remaining_capacity", remaining);
        evt.put("can_accept", canAccept);
        broadcaster.broadcastAgentStatus(tenantId, evt);
    }
}
