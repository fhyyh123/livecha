package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.AgentSessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class AgentPresenceService {

    private final AgentSessionRepository agentSessionRepository;
    private final long heartbeatTtlSeconds;
    private final long heartbeatIntervalSeconds;

    public AgentPresenceService(
            AgentSessionRepository agentSessionRepository,
            @Value("${app.agent.heartbeat.ttl-seconds:45}") long heartbeatTtlSeconds,
            @Value("${app.agent.heartbeat.interval-seconds:20}") long heartbeatIntervalSeconds
    ) {
        this.agentSessionRepository = agentSessionRepository;
        this.heartbeatTtlSeconds = heartbeatTtlSeconds;
        this.heartbeatIntervalSeconds = heartbeatIntervalSeconds;
    }

    public String createSession(String tenantId, String userId) {
        var sessionId = UUID.randomUUID().toString();
        var expiresAt = Instant.now().plusSeconds(heartbeatTtlSeconds);
        agentSessionRepository.createSession(sessionId, tenantId, userId, expiresAt);
        return sessionId;
    }

    public boolean heartbeat(String sessionId, String userId) {
        var expiresAt = Instant.now().plusSeconds(heartbeatTtlSeconds);
        return agentSessionRepository.touchSession(sessionId, userId, expiresAt);
    }

    public void logout(String sessionId, String userId) {
        agentSessionRepository.deleteSession(sessionId, userId);
    }

    public boolean hasActiveSession(String userId) {
        return agentSessionRepository.hasActiveSession(userId);
    }

    public long heartbeatTtlSeconds() {
        return heartbeatTtlSeconds;
    }

    public long heartbeatIntervalSeconds() {
        return heartbeatIntervalSeconds;
    }
}
