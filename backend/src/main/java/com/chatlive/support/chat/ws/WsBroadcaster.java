package com.chatlive.support.chat.ws;

import com.chatlive.support.chat.repo.ConversationEventRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;

@Component
public class WsBroadcaster {

    private final ObjectMapper objectMapper;
    private final WsSessionRegistry sessionRegistry;
    private final ConversationEventRepository conversationEventRepository;

    private final Map<String, WebSocketSession> liveSessions = new ConcurrentHashMap<>();

    public WsBroadcaster(ObjectMapper objectMapper, WsSessionRegistry sessionRegistry, ConversationEventRepository conversationEventRepository) {
        this.objectMapper = objectMapper;
        this.sessionRegistry = sessionRegistry;
        this.conversationEventRepository = conversationEventRepository;
    }

    public void register(WebSocketSession session) {
        if (session == null) return;
        liveSessions.put(session.getId(), session);
    }

    public void unregister(WebSocketSession session) {
        if (session == null) return;
        liveSessions.remove(session.getId());
    }

    public void broadcastToConversation(String conversationId, JsonNode node) {
        if (conversationId == null || conversationId.isBlank()) return;
        for (var sessionId : sessionRegistry.getSubscriberSessionIds(conversationId)) {
            var s = liveSessions.get(sessionId);
            if (s == null) continue;
            try {
                send(s, node);
            } catch (IOException ignored) {
                // best-effort
            }
        }
    }

    public void broadcastToTenantAgents(String tenantId, JsonNode node) {
        if (tenantId == null || tenantId.isBlank()) return;
        for (var s : liveSessions.values()) {
            if (s == null) continue;
            var ctx = sessionRegistry.get(s).orElse(null);
            if (ctx == null || ctx.claims() == null) continue;
            if (ctx.claims().tenantId() == null || !tenantId.equals(ctx.claims().tenantId())) continue;
            var role = ctx.claims().role();
            if (!"agent".equals(role) && !"admin".equals(role)) continue;
            try {
                send(s, node);
            } catch (IOException ignored) {
                // best-effort
            }
        }
    }

    public void sendToTenantAgentUser(String tenantId, String agentUserId, JsonNode node) {
        if (tenantId == null || tenantId.isBlank()) return;
        if (agentUserId == null || agentUserId.isBlank()) return;
        for (var s : liveSessions.values()) {
            if (s == null) continue;
            var ctx = sessionRegistry.get(s).orElse(null);
            if (ctx == null || ctx.claims() == null) continue;
            if (ctx.claims().tenantId() == null || !tenantId.equals(ctx.claims().tenantId())) continue;
            if (ctx.claims().userId() == null || !agentUserId.equals(ctx.claims().userId())) continue;
            var role = ctx.claims().role();
            if (!"agent".equals(role) && !"admin".equals(role)) continue;
            try {
                send(s, node);
            } catch (IOException ignored) {
                // best-effort
            }
        }
    }

    public void broadcastAgentStatus(String tenantId, ObjectNode payload) {
        if (tenantId == null || tenantId.isBlank()) return;
        if (payload == null) return;
        payload.put("type", "AGENT_STATUS");
        broadcastToTenantAgents(tenantId, payload);
    }

    public void notifyInboxChanged(String tenantId, String agentUserId, String conversationId, String reason) {
        if (tenantId == null || tenantId.isBlank()) return;
        if (agentUserId == null || agentUserId.isBlank()) return;

        ObjectNode evt = objectMapper.createObjectNode();
        evt.put("type", "INBOX_CHANGED");
        evt.put("agent_user_id", agentUserId);
        if (conversationId != null && !conversationId.isBlank()) {
            evt.put("conversation_id", conversationId);
        }
        if (reason != null && !reason.isBlank()) {
            evt.put("reason", reason);
        }

        sendToTenantAgentUser(tenantId, agentUserId, evt);
    }

    /**
     * Broadcast a conversation lifecycle event to current conversation subscribers.
     *
     * This is used to drive the agent UI timeline (e.g. assigned/transferred/archived) and is intentionally
     * separate from chat messages.
     */
    public void broadcastConversationEvent(String tenantId, String conversationId, String eventKey, ObjectNode data) {
        if (tenantId == null || tenantId.isBlank()) return;
        if (conversationId == null || conversationId.isBlank()) return;
        if (eventKey == null || eventKey.isBlank()) return;

        var now = Instant.now();
        var eventId = "ce_" + UUID.randomUUID();

        // Best-effort persist for reload/history replay.
        try {
            var json = (data == null) ? "{}" : data.toString();
            conversationEventRepository.insertEvent(eventId, tenantId, conversationId, eventKey, json, now);
        } catch (Exception ignored) {
            // best-effort
        }

        ObjectNode evt = objectMapper.createObjectNode();
        evt.put("type", "CONV_EVENT");
        evt.put("conversation_id", conversationId);
        evt.put("event_id", eventId);
        evt.put("event_key", eventKey);
        evt.put("created_at", now.getEpochSecond());
        if (data != null) {
            evt.set("data", data);
        }

        broadcastToConversation(conversationId, evt);
    }

    private void send(WebSocketSession session, JsonNode node) throws IOException {
        if (session == null || node == null) return;
        if (!session.isOpen()) return;
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(node)));
    }
}
