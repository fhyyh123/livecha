package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.service.AssignmentService;
import com.chatlive.support.chat.service.AgentPresenceService;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.chatlive.support.user.repo.UserAccountRepository;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {

    private static final Logger log = LoggerFactory.getLogger(AgentController.class);

    private final JwtService jwtService;
    private final AgentProfileRepository agentProfileRepository;
    private final AssignmentService assignmentService;
    private final UserAccountRepository userAccountRepository;
        private final AgentPresenceService agentPresenceService;
        private final WsBroadcaster broadcaster;
        private final ObjectMapper objectMapper;

    public AgentController(
            JwtService jwtService,
            AgentProfileRepository agentProfileRepository,
            AssignmentService assignmentService,
                        UserAccountRepository userAccountRepository,
                        AgentPresenceService agentPresenceService,
                        WsBroadcaster broadcaster,
                        ObjectMapper objectMapper
    ) {
        this.jwtService = jwtService;
        this.agentProfileRepository = agentProfileRepository;
        this.assignmentService = assignmentService;
        this.userAccountRepository = userAccountRepository;
                this.agentPresenceService = agentPresenceService;
                this.broadcaster = broadcaster;
                this.objectMapper = objectMapper;
    }

        @PostMapping("/heartbeat")
        public ApiResponse<AgentHeartbeatResponse> heartbeat(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @Valid @RequestBody AgentHeartbeatRequest req
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if ("customer".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var ok = agentPresenceService.heartbeat(req.session_id(), claims.userId());
                if (!ok) {
                        throw new IllegalArgumentException("invalid_session");
                }

                var profile = agentProfileRepository.findByUserId(claims.userId())
                                .orElse(new AgentProfileRepository.AgentProfileRow(claims.userId(), "offline", 3));

                var assignedActive = assignmentService.getAssignedActiveCount(claims.tenantId(), claims.userId());
                var maxC = Math.max(1, profile.maxConcurrent());
                var remaining = Math.max(0, maxC - assignedActive);

                var hasPresence = agentPresenceService.hasActiveSession(claims.userId());
                var status = hasPresence ? profile.status() : "offline";
                if (hasPresence && "offline".equals(status)) {
                        status = "online";
                }
                var effective = ("online".equals(status) && remaining == 0) ? "busy" : status;

                var res = new AgentHeartbeatResponse(
                                status,
                                effective,
                                agentPresenceService.heartbeatTtlSeconds(),
                                System.currentTimeMillis()
                );
                broadcastAgentStatus(claims.tenantId(), claims.userId());
                return ApiResponse.ok(res);
        }

            @PostMapping("/session")
            public ApiResponse<AgentSessionResponse> createSession(
                    @RequestHeader(value = "Authorization", required = false) String authorization
            ) {
                var token = JwtService.extractBearerToken(authorization)
                        .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if ("customer".equals(claims.role())) {
                    throw new IllegalArgumentException("forbidden");
                }

                var sessionId = agentPresenceService.createSession(claims.tenantId(), claims.userId());
                return ApiResponse.ok(new AgentSessionResponse(
                        sessionId,
                        agentPresenceService.heartbeatIntervalSeconds(),
                        agentPresenceService.heartbeatTtlSeconds()
                ));
            }

        @PostMapping("/logout")
        public ApiResponse<Void> logout(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @Valid @RequestBody AgentHeartbeatRequest req
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if ("customer".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }
                agentPresenceService.logout(req.session_id(), claims.userId());
                broadcastAgentStatus(claims.tenantId(), claims.userId());
                return ApiResponse.ok(null);
        }

    @PostMapping("/status")
    public ApiResponse<Void> setStatus(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody AgentStatusRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var status = req.status();
        if (!("online".equals(status) || "away".equals(status) || "offline".equals(status))) {
            throw new IllegalArgumentException("invalid_status");
        }

        agentProfileRepository.upsertStatus(claims.userId(), status, req.max_concurrent());
        broadcastAgentStatus(claims.tenantId(), claims.userId());

        // Strategy C: agent comes online -> immediately try to drain queue (best-effort)
        if ("online".equals(status)) {
            var profile = agentProfileRepository.findByUserId(claims.userId())
                    .orElse(new AgentProfileRepository.AgentProfileRow(claims.userId(), "offline", 3));
            var maxC = Math.max(1, profile.maxConcurrent());
            var assignedActive = assignmentService.getAssignedActiveCount(claims.tenantId(), claims.userId());
            var remaining = Math.max(0, maxC - assignedActive);

            if (remaining > 0) {
                // strict bound: only assign up to remaining capacity for this agent
                var result = assignmentService.tryAssignFromQueueToAgent(claims.tenantId(), claims.userId(), remaining);
                if (result.assigned_count() > 0) {
                    var ids = result.picked_ids();
                    var showN = Math.min(ids.size(), 20);
                    var head = ids.subList(0, showN);
                    var more = ids.size() - showN;
                    log.info(
                            "online_trigger_assigned tenantId={} agentUserId={} remainingCapacity={} scanned={} assignedCount={} pickedIds={}{}",
                            claims.tenantId(),
                            claims.userId(),
                            remaining,
                            result.scanned(),
                            result.assigned_count(),
                            head,
                            (more > 0 ? " (+" + more + " more)" : "")
                    );
                } else {
                    log.info(
                            "online_trigger_assigned tenantId={} agentUserId={} remainingCapacity={} scanned={} assignedCount=0",
                            claims.tenantId(),
                            claims.userId(),
                            remaining,
                            result.scanned()
                    );
                }
            }
        }
        return ApiResponse.ok(null);
    }

        @PostMapping("/users/{userId}/status")
        public ApiResponse<Void> setStatusForUser(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @PathVariable("userId") String userId,
                        @Valid @RequestBody AgentStatusRequest req
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if (!"admin".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var user = userAccountRepository.findMeById(userId)
                                .orElseThrow(() -> new IllegalArgumentException("user_not_found"));
                if (!claims.tenantId().equals(user.tenantId())) {
                        throw new IllegalArgumentException("forbidden");
                }
                if ("customer".equals(user.type())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var status = req.status();
                if (!("online".equals(status) || "away".equals(status) || "offline".equals(status))) {
                        throw new IllegalArgumentException("invalid_status");
                }

                agentProfileRepository.upsertStatus(userId, status, req.max_concurrent());
                broadcastAgentStatus(claims.tenantId(), userId);

                // best-effort: when setting a user online, try to drain queue to that user
                if ("online".equals(status)) {
                        var profile = agentProfileRepository.findByUserId(userId)
                                        .orElse(new AgentProfileRepository.AgentProfileRow(userId, "offline", 3));
                        var maxC = Math.max(1, profile.maxConcurrent());
                        var assignedActive = assignmentService.getAssignedActiveCount(claims.tenantId(), userId);
                        var remaining = Math.max(0, maxC - assignedActive);

                        if (remaining > 0) {
                                var result = assignmentService.tryAssignFromQueueToAgent(claims.tenantId(), userId, remaining);
                                if (result.assigned_count() > 0) {
                                        var ids = result.picked_ids();
                                        var showN = Math.min(ids.size(), 20);
                                        var head = ids.subList(0, showN);
                                        var more = ids.size() - showN;
                                        log.info(
                                                        "admin_online_trigger_assigned tenantId={} agentUserId={} remainingCapacity={} scanned={} assignedCount={} pickedIds={}{}",
                                                        claims.tenantId(),
                                                        userId,
                                                        remaining,
                                                        result.scanned(),
                                                        result.assigned_count(),
                                                        head,
                                                        (more > 0 ? " (+" + more + " more)" : "")
                                        );
                                } else {
                                        log.info(
                                                        "admin_online_trigger_assigned tenantId={} agentUserId={} remainingCapacity={} scanned={} assignedCount=0",
                                                        claims.tenantId(),
                                                        userId,
                                                        remaining,
                                                        result.scanned()
                                        );
                                }
                        }
                }

                return ApiResponse.ok(null);
        }

    @GetMapping("/status")
    public ApiResponse<AgentStatusResponse> getStatus(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var profile = agentProfileRepository.findByUserId(claims.userId())
                .orElse(new AgentProfileRepository.AgentProfileRow(claims.userId(), "offline", 3));

        // assigned_active uses same rule as assignment capacity
        var assignedActive = assignmentService.getAssignedActiveCount(claims.tenantId(), claims.userId());
        var maxC = Math.max(1, profile.maxConcurrent());
        var remaining = Math.max(0, maxC - assignedActive);
                var hasPresence = agentPresenceService.hasActiveSession(claims.userId());
                var status = hasPresence ? profile.status() : "offline";
                if (hasPresence && "offline".equals(status)) {
                        status = "online";
                }
        var canAccept = "online".equals(status) && remaining > 0;
        var effective = ("online".equals(status) && remaining == 0) ? "busy" : status;

        return ApiResponse.ok(new AgentStatusResponse(
                claims.userId(),
                status,
                effective,
                maxC,
                assignedActive,
                remaining,
                canAccept
        ));
    }

    @PostMapping("/conversations/{id}/claim")
    public ApiResponse<Void> claim(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        assignmentService.claimConversation(claims, conversationId);
        return ApiResponse.ok(null);
    }

    @PostMapping("/conversations/{id}/assign")
    public ApiResponse<Void> assign(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @Valid @RequestBody AssignConversationRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        assignmentService.assignConversation(claims, conversationId, req.agent_user_id());
        return ApiResponse.ok(null);
    }

    @GetMapping("/agents")
    public ApiResponse<java.util.List<AgentListItem>> listAgents(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var rows = userAccountRepository.listAgentsByTenant(claims.tenantId());
        var items = rows.stream().map(r -> new AgentListItem(
                r.id(),
                r.type(),
                r.username(),
                r.email(),
                r.agentStatus(),
                r.maxConcurrent()
        )).toList();
        return ApiResponse.ok(items);
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
                if (hasPresence && "offline".equals(status)) {
                        status = "online";
                }
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
