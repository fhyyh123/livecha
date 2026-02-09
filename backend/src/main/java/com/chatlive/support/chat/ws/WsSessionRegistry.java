package com.chatlive.support.chat.ws;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WsSessionRegistry {

    public record SessionContext(JwtClaims claims, String client, String agentSessionId, String clientIp) {
    }

    private final Map<String, SessionContext> sessions = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> convSubscribers = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> sessionSubscribedConversationIds = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Integer>> userConvSubCounts = new ConcurrentHashMap<>();

    public void bind(WebSocketSession session, SessionContext ctx) {
        sessions.put(session.getId(), ctx);
    }

    public Optional<SessionContext> get(WebSocketSession session) {
        return Optional.ofNullable(sessions.get(session.getId()));
    }

    public void unbind(WebSocketSession session) {
        var sessionId = session.getId();
        var ctx = sessions.remove(sessionId);
        var userId = (ctx != null && ctx.claims() != null) ? ctx.claims().userId() : null;

        var subscribed = sessionSubscribedConversationIds.remove(sessionId);
        if (subscribed != null && !subscribed.isEmpty()) {
            for (var convId : subscribed) {
                unsubscribeInternal(convId, sessionId, userId);
            }
        }

        // best-effort cleanup for legacy sessions
        convSubscribers.values().forEach(set -> set.remove(sessionId));
    }

    public void subscribe(String conversationId, WebSocketSession session) {
        var sessionId = session.getId();
        convSubscribers.computeIfAbsent(conversationId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);

        boolean added = sessionSubscribedConversationIds
                .computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet())
                .add(conversationId);
        if (!added) return;

        var ctx = sessions.get(sessionId);
        if (ctx != null && ctx.claims() != null && ctx.claims().userId() != null) {
            incrementUserConv(ctx.claims().userId(), conversationId);
        }
    }

    public void unsubscribe(String conversationId, WebSocketSession session) {
        if (conversationId == null || conversationId.isBlank() || session == null) return;
        var sessionId = session.getId();
        var ctx = sessions.get(sessionId);
        var userId = (ctx != null && ctx.claims() != null) ? ctx.claims().userId() : null;
        unsubscribeInternal(conversationId, sessionId, userId);
    }

    private void unsubscribeInternal(String conversationId, String sessionId, String userId) {
        if (conversationId == null || conversationId.isBlank() || sessionId == null) return;

        var subSet = sessionSubscribedConversationIds.get(sessionId);
        boolean removed = subSet != null && subSet.remove(conversationId);
        if (subSet != null && subSet.isEmpty()) {
            sessionSubscribedConversationIds.remove(sessionId);
        }

        var sessionIds = convSubscribers.get(conversationId);
        if (sessionIds != null) {
            sessionIds.remove(sessionId);
            if (sessionIds.isEmpty()) {
                convSubscribers.remove(conversationId);
            }
        }

        if (removed && userId != null && !userId.isBlank()) {
            decrementUserConv(userId, conversationId);
        }
    }

    private void incrementUserConv(String userId, String conversationId) {
        userConvSubCounts.compute(userId, (uid, map) -> {
            var next = map == null ? new ConcurrentHashMap<String, Integer>() : map;
            next.merge(conversationId, 1, Integer::sum);
            return next;
        });
    }

    private void decrementUserConv(String userId, String conversationId) {
        userConvSubCounts.computeIfPresent(userId, (uid, map) -> {
            var cur = map.get(conversationId);
            if (cur == null) return map;
            if (cur <= 1) map.remove(conversationId);
            else map.put(conversationId, cur - 1);
            return map.isEmpty() ? null : map;
        });
    }

    public Set<String> getUserSubscribedConversationIds(String userId) {
        var m = userConvSubCounts.get(userId);
        if (m == null || m.isEmpty()) return Collections.emptySet();
        return m.keySet();
    }

    public boolean hasUserSubscribedConversation(String userId, String conversationId) {
        return getUserSubscribedConversationIds(userId).contains(conversationId);
    }

    public Set<String> getSubscriberSessionIds(String conversationId) {
        return convSubscribers.getOrDefault(conversationId, Collections.emptySet());
    }
}
