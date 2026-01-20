package com.chatlive.support.chat.ws;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.api.MessageItem;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.chat.service.MessageService;
import com.chatlive.support.chat.service.AgentPresenceService;
import com.chatlive.support.chat.service.AssignmentService;
import com.chatlive.support.chat.repo.ConversationEventRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WsHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(WsHandler.class);

    private final ObjectMapper objectMapper;
    private final JwtService jwtService;
    private final WsSessionRegistry sessionRegistry;
    private final WsBroadcaster broadcaster;
    private final MessageService messageService;
    private final AgentPresenceService agentPresenceService;
    private final AgentProfileRepository agentProfileRepository;
    private final AssignmentService assignmentService;
    private final ConversationRepository conversationRepository;
    private final ConversationEventRepository conversationEventRepository;
    private final Set<String> allowedVisitorOrigins;

    public WsHandler(
            ObjectMapper objectMapper,
            JwtService jwtService,
            WsSessionRegistry sessionRegistry,
            WsBroadcaster broadcaster,
            MessageService messageService,
            AgentPresenceService agentPresenceService,
            AgentProfileRepository agentProfileRepository,
            AssignmentService assignmentService,
            ConversationRepository conversationRepository,
            ConversationEventRepository conversationEventRepository,
            @Value("${app.widget.public-embed-url:http://localhost:5173/visitor/embed}") String publicEmbedUrl,
            @Value("${app.ws.public-allowed-origins:}") String extraAllowedOriginsCsv
    ) {
        this.objectMapper = objectMapper;
        this.jwtService = jwtService;
        this.sessionRegistry = sessionRegistry;
        this.broadcaster = broadcaster;
        this.messageService = messageService;
        this.agentPresenceService = agentPresenceService;
        this.agentProfileRepository = agentProfileRepository;
        this.assignmentService = assignmentService;
        this.conversationRepository = conversationRepository;
        this.conversationEventRepository = conversationEventRepository;

        this.allowedVisitorOrigins = buildAllowedVisitorOrigins(publicEmbedUrl, extraAllowedOriginsCsv);
    }

    private static String normalizePreviewText(String s) {
        if (s == null) return "";
        var trimmed = s.replaceAll("\\s+", " ").trim();
        if (trimmed.length() > 200) return trimmed.substring(0, 200);
        return trimmed;
    }

    private String buildPreviewText(MessageItem item) {
        if (item == null) return "";
        var ct = item.content_type() == null ? "" : item.content_type();
        JsonNode content = item.content();
        if (content == null) content = objectMapper.createObjectNode();

        if ("text".equals(ct)) {
            return normalizePreviewText(content.path("text").asText(""));
        }

        if ("file".equals(ct)) {
            var name = normalizePreviewText(content.path("filename").asText(""));
            if (name != null && !name.isBlank()) return "[附件] " + name;
            return "[附件]";
        }

        return normalizePreviewText("[" + ct + "]");
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        broadcaster.register(session);

        // Optional: support WS connect with token in query string, e.g. /ws/public?token=...&client=visitor
        var uri = session.getUri();
        var params = parseQueryParams(uri);
        var token = params.get("token");
        if (token != null && !token.isBlank()) {
            try {
                var claims = jwtService.parse(token);

                // Browser safety: only allow visitor WS connections from our embed app origin(s).
                if ("visitor".equals(claims.role()) && !isVisitorOriginAllowed(session)) {
                    try {
                        sendError(session, "origin_not_allowed", null);
                    } catch (Exception ignore) {
                        // ignore
                    }
                    try {
                        session.close(CloseStatus.NOT_ACCEPTABLE);
                    } catch (Exception ignore) {
                        // ignore
                    }
                    return;
                }

                var client = params.getOrDefault("client", "unknown");
                var agentSessionId = params.get("session_id");
                sessionRegistry.bind(session, new WsSessionRegistry.SessionContext(claims, client, agentSessionId));

                ObjectNode ok = objectMapper.createObjectNode();
                ok.put("type", "AUTH_OK");
                ok.put("user_id", claims.userId());
                ok.put("role", claims.role());
                ok.put("tenant_id", claims.tenantId());
                if (claims.siteId() != null && !claims.siteId().isBlank()) {
                    ok.put("site_id", claims.siteId());
                }
                send(session, ok);

                var convId = params.get("conversation_id");
                if (convId != null && !convId.isBlank()) {
                    var access = conversationRepository.findAccess(claims.tenantId(), convId).orElse(null);
                    if (access != null && canAccessConversation(claims, access)) {
                        sessionRegistry.subscribe(convId, session);
                        ObjectNode ack = objectMapper.createObjectNode();
                        ack.put("type", "SUB_OK");
                        ack.put("conversation_id", convId);
                        send(session, ack);
                    }
                }
            } catch (ExpiredJwtException ex) {
                try {
                    sendError(session, "token_expired", null);
                } catch (Exception ignore) {
                    // ignore
                }
                closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
            } catch (Exception ex) {
                try {
                    sendError(session, "invalid_token", null);
                } catch (Exception ignore) {
                    // ignore
                }
                closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        broadcaster.unregister(session);
        sessionRegistry.unbind(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        final String rid = "ws_" + session.getId() + "_" + System.nanoTime();
        try {
            JsonNode root = objectMapper.readTree(message.getPayload());
            var type = root.path("type").asText(null);
            if (type == null) {
                sendError(session, "missing_type", rid);
                return;
            }

            switch (type) {
                case "AUTH" -> handleAuth(session, root);
                case "SUB" -> handleSub(session, root);
                case "UNSUB" -> handleUnsub(session, root);
                case "MSG_SEND" -> handleMsgSend(session, root, rid);
                case "SYNC" -> handleSync(session, root, rid);
                case "MSG_READ" -> handleMsgRead(session, root, rid);
                case "TYPING" -> handleTyping(session, root, rid);
                case "PING" -> {
                    var ctx = sessionRegistry.get(session).orElse(null);
                    if (ctx != null && ctx.claims() != null && !"customer".equals(ctx.claims().role())) {
                        var sid = ctx.agentSessionId();
                        if (sid != null && !sid.isBlank()) {
                            var ok = agentPresenceService.heartbeat(sid, ctx.claims().userId());
                            if (!ok) {
                                var tenantId = ctx.claims().tenantId();
                                var userId = ctx.claims().userId();
                                if (tenantId != null && userId != null) {
                                    var newSessionId = agentPresenceService.createSession(tenantId, userId);
                                    sessionRegistry.bind(session, new WsSessionRegistry.SessionContext(
                                            ctx.claims(),
                                            ctx.client(),
                                            newSessionId
                                    ));

                                    ObjectNode refresh = objectMapper.createObjectNode();
                                    refresh.put("type", "SESSION");
                                    refresh.put("session_id", newSessionId);
                                    refresh.put("heartbeat_interval_seconds", agentPresenceService.heartbeatIntervalSeconds());
                                    refresh.put("heartbeat_ttl_seconds", agentPresenceService.heartbeatTtlSeconds());
                                    send(session, refresh);
                                }
                            }
                        }

                        var userId = ctx.claims().userId();
                        var tenantId = ctx.claims().tenantId();
                        if (userId != null && tenantId != null) {
                            var profile = agentProfileRepository.findByUserId(userId)
                                    .orElse(new AgentProfileRepository.AgentProfileRow(userId, "offline", 3));
                            var assignedActive = assignmentService.getAssignedActiveCount(tenantId, userId);
                            var maxC = Math.max(1, profile.maxConcurrent());
                            var remaining = Math.max(0, maxC - assignedActive);
                            var hasPresence = agentPresenceService.hasActiveSession(userId);
                            var status = profile.status();
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
                    send(session, obj("type", "PONG"));
                }
                default -> sendError(session, "unsupported_type", rid);
            }
        } catch (IllegalArgumentException ex) {
            sendError(session, ex.getMessage(), rid);
        } catch (Exception ex) {
            log.warn("ws_internal_error rid={} sessionId={} payload={}", rid, session.getId(), safeOneLine(message.getPayload()), ex);
            sendError(session, "ws_internal_error", rid);
        }
    }

    private void handleAuth(WebSocketSession session, JsonNode root) throws IOException {
        var token = root.path("token").asText(null);
        if (token == null || token.isBlank()) {
            sendError(session, "missing_token", null);
            return;
        }
        final com.chatlive.support.auth.service.jwt.JwtClaims claims;
        try {
            claims = jwtService.parse(token);
        } catch (ExpiredJwtException ex) {
            sendError(session, "token_expired", null);
            closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
            return;
        } catch (JwtException ex) {
            sendError(session, "invalid_token", null);
            closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        if ("visitor".equals(claims.role()) && !isVisitorOriginAllowed(session)) {
            sendError(session, "origin_not_allowed", null);
            closeQuietly(session, CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        var client = root.path("client").asText("unknown");
        var agentSessionId = root.path("session_id").asText(null);
        sessionRegistry.bind(session, new WsSessionRegistry.SessionContext(claims, client, agentSessionId));

        ObjectNode ok = objectMapper.createObjectNode();
        ok.put("type", "AUTH_OK");
        ok.put("user_id", claims.userId());
        ok.put("role", claims.role());
        ok.put("tenant_id", claims.tenantId());
        if (claims.siteId() != null && !claims.siteId().isBlank()) {
            ok.put("site_id", claims.siteId());
        }
        send(session, ok);
    }

    private static Map<String, String> parseQueryParams(URI uri) {
        if (uri == null || uri.getRawQuery() == null || uri.getRawQuery().isBlank()) {
            return Map.of();
        }
        var out = new HashMap<String, String>();
        var pairs = uri.getRawQuery().split("&");
        for (var pair : pairs) {
            if (pair == null || pair.isBlank()) continue;
            var idx = pair.indexOf('=');
            final String rawKey;
            final String rawVal;
            if (idx < 0) {
                rawKey = pair;
                rawVal = "";
            } else {
                rawKey = pair.substring(0, idx);
                rawVal = pair.substring(idx + 1);
            }
            var key = urlDecode(rawKey);
            var val = urlDecode(rawVal);
            if (key != null && !key.isBlank()) {
                out.put(key, val == null ? "" : val);
            }
        }
        return out;
    }

    private static String urlDecode(String s) {
        if (s == null) return null;
        try {
            return URLDecoder.decode(s, StandardCharsets.UTF_8);
        } catch (Exception ex) {
            return s;
        }
    }

    private boolean isVisitorOriginAllowed(WebSocketSession session) {
        if (allowedVisitorOrigins == null || allowedVisitorOrigins.isEmpty()) return true;

        try {
            var origin = session.getHandshakeHeaders().getFirst("Origin");
            if (origin == null || origin.isBlank()) {
                // Non-browser client.
                return true;
            }
            return allowedVisitorOrigins.contains(origin);
        } catch (Exception ex) {
            return true;
        }
    }

    private static Set<String> buildAllowedVisitorOrigins(String publicEmbedUrl, String extraAllowedOriginsCsv) {
        var out = new HashSet<String>();

        var embedOrigin = safeOriginFromUrl(publicEmbedUrl);
        if (embedOrigin != null && !embedOrigin.isBlank()) {
            out.add(embedOrigin);
        }

        if (extraAllowedOriginsCsv != null && !extraAllowedOriginsCsv.isBlank()) {
            for (var raw : extraAllowedOriginsCsv.split(",")) {
                var t = raw == null ? "" : raw.trim();
                if (!t.isBlank()) out.add(t);
            }
        }

        return out;
    }

    private static String safeOriginFromUrl(String url) {
        try {
            return URI.create(url).resolve("/").toString().replaceAll("/$", "");
        } catch (Exception ex) {
            return null;
        }
    }

    private void handleSub(WebSocketSession session, JsonNode root) throws IOException {
        var ctx = sessionRegistry.get(session).orElse(null);
        if (ctx == null) {
            sendError(session, "unauthorized", null);
            return;
        }
        var conversationId = root.path("conversation_id").asText(null);
        if (conversationId == null || conversationId.isBlank()) {
            sendError(session, "missing_conversation_id", null);
            return;
        }

        // Prevent unauthorized subscriptions (especially for public visitor sessions).
        var access = conversationRepository.findAccess(ctx.claims().tenantId(), conversationId).orElse(null);
        if (access == null) {
            sendError(session, "conversation_not_found", null);
            return;
        }
        if (!canAccessConversation(ctx.claims(), access)) {
            sendError(session, "forbidden", null);
            return;
        }

        sessionRegistry.subscribe(conversationId, session);
        ObjectNode ack = objectMapper.createObjectNode();
        ack.put("type", "SUB_OK");
        ack.put("conversation_id", conversationId);
        send(session, ack);
    }

    private void handleUnsub(WebSocketSession session, JsonNode root) throws IOException {
        var ctx = sessionRegistry.get(session).orElse(null);
        if (ctx == null) {
            sendError(session, "unauthorized", null);
            return;
        }

        var conversationId = root.path("conversation_id").asText(null);
        if (conversationId == null || conversationId.isBlank()) {
            sendError(session, "missing_conversation_id", null);
            return;
        }

        sessionRegistry.unsubscribe(conversationId, session);
        ObjectNode ack = objectMapper.createObjectNode();
        ack.put("type", "UNSUB_OK");
        ack.put("conversation_id", conversationId);
        send(session, ack);
    }

    private boolean canAccessConversation(com.chatlive.support.auth.service.jwt.JwtClaims claims, ConversationRepository.ConversationAccessRow conv) {
        if (claims == null || conv == null) return false;

        if ("customer".equals(claims.role())) {
            return claims.userId() != null && claims.userId().equals(conv.customerUserId());
        }
        if ("visitor".equals(claims.role())) {
            return claims.siteId() != null && !claims.siteId().isBlank()
                    && conv.siteId() != null && claims.siteId().equals(conv.siteId())
                    && claims.userId() != null
                    && conv.visitorId() != null
                    && claims.userId().equals(conv.visitorId());
        }

        return claims.tenantId() != null && claims.tenantId().equals(conv.tenantId());
    }

    private void handleMsgSend(WebSocketSession session, JsonNode root, String rid) throws IOException {
        var ctx = sessionRegistry.get(session).orElse(null);
        if (ctx == null) {
            sendError(session, "unauthorized", rid);
            return;
        }

        var conversationId = root.path("conversation_id").asText(null);
        if (conversationId == null || conversationId.isBlank()) {
            sendError(session, "missing_conversation_id", rid);
            return;
        }

        var contentType = root.path("content_type").asText("text");
        var clientMsgId = root.path("client_msg_id").asText(null);

        // convenience: ensure sender is subscribed before broadcast
        sessionRegistry.subscribe(conversationId, session);

        try {
            MessageService.SendResult result;

            if ("text".equals(contentType)) {
                var text = root.path("content").path("text").asText(null);
                if (text == null) {
                    sendError(session, "missing_text", rid);
                    return;
                }
                result = messageService.sendText(ctx.claims(), conversationId, clientMsgId, text);
            } else if ("file".equals(contentType)) {
                var attachmentId = root.path("content").path("attachment_id").asText(null);
                if (attachmentId == null || attachmentId.isBlank()) {
                    sendError(session, "missing_attachment_id", rid);
                    return;
                }
                result = messageService.sendFile(ctx.claims(), conversationId, clientMsgId, attachmentId);
            } else {
                sendError(session, "unsupported_content_type", rid);
                return;
            }
            var item = result.item();

            ObjectNode ack = objectMapper.createObjectNode();
            ack.put("type", "MSG_ACK");
            if (clientMsgId != null && !clientMsgId.isBlank()) {
                ack.put("client_msg_id", clientMsgId);
            }
            ack.put("msg_id", item.id());
            send(session, ack);

            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", "MSG");
            msg.put("conversation_id", conversationId);

            ObjectNode msgObj = objectMapper.createObjectNode();
            msgObj.put("id", item.id());
            msgObj.put("sender_type", item.sender_type());
            msgObj.put("sender_id", item.sender_id());
            msgObj.put("content_type", item.content_type());
            msgObj.set("content", item.content());
            msgObj.put("created_at", item.created_at());
            msgObj.put("preview_text", buildPreviewText(item));
            msg.set("msg", msgObj);

            // Idempotency: if client_msg_id was already inserted, do not broadcast again.
            if (result.inserted()) {
                broadcaster.broadcastToConversation(conversationId, msg);
            }

            // If the visitor/customer message reopened a previously closed conversation, notify tenant agents
            // so their inbox can refresh (they may not be subscribed to this conversation yet).
            if (result.inserted() && result.reopened()) {
                var access = conversationRepository.findAccess(ctx.claims().tenantId(), conversationId).orElse(null);
                ObjectNode evt = objectMapper.createObjectNode();
                evt.put("type", "CONV_REOPENED");
                evt.put("conversation_id", conversationId);
                if (access != null) {
                    evt.put("status", access.status());
                    if (access.assignedAgentUserId() != null && !access.assignedAgentUserId().isBlank()) {
                        evt.put("assigned_agent_user_id", access.assignedAgentUserId());
                    }
                }
                broadcaster.broadcastToTenantAgents(ctx.claims().tenantId(), evt);
            }
        } catch (IllegalArgumentException ex) {
            sendError(session, ex.getMessage(), rid);
        }
    }

    private void handleMsgRead(WebSocketSession session, JsonNode root, String rid) throws IOException {
        var ctx = sessionRegistry.get(session).orElse(null);
        if (ctx == null) {
            sendError(session, "unauthorized", rid);
            return;
        }

        var conversationId = root.path("conversation_id").asText(null);
        if (conversationId == null || conversationId.isBlank()) {
            sendError(session, "missing_conversation_id", rid);
            return;
        }

        var lastReadMsgId = root.path("last_read_msg_id").asText(null);
        if (lastReadMsgId == null || lastReadMsgId.isBlank()) {
            sendError(session, "missing_last_read_msg_id", rid);
            return;
        }

        // convenience: ensure sender is subscribed
        sessionRegistry.subscribe(conversationId, session);

        try {
            long readAt = messageService.markRead(ctx.claims(), conversationId, lastReadMsgId);

            ObjectNode ok = objectMapper.createObjectNode();
            ok.put("type", "MSG_READ_OK");
            ok.put("conversation_id", conversationId);
            ok.put("last_read_msg_id", lastReadMsgId);
            ok.put("read_at", readAt);
            send(session, ok);

            // Broadcast to other subscribers so UI can update read state.
            ObjectNode evt = objectMapper.createObjectNode();
            evt.put("type", "READ");
            evt.put("conversation_id", conversationId);
            evt.put("sender_role", ctx.claims().role());
            evt.put("sender_id", ctx.claims().userId());
            evt.put("last_read_msg_id", lastReadMsgId);
            evt.put("read_at", readAt);
            broadcaster.broadcastToConversation(conversationId, evt);
        } catch (IllegalArgumentException ex) {
            sendError(session, ex.getMessage(), rid);
        }
    }

    private void handleTyping(WebSocketSession session, JsonNode root, String rid) throws IOException {
        var ctx = sessionRegistry.get(session).orElse(null);
        if (ctx == null) {
            sendError(session, "unauthorized", rid);
            return;
        }

        var conversationId = root.path("conversation_id").asText(null);
        if (conversationId == null || conversationId.isBlank()) {
            sendError(session, "missing_conversation_id", rid);
            return;
        }
        if (!root.has("is_typing")) {
            sendError(session, "missing_is_typing", rid);
            return;
        }
        var isTyping = root.path("is_typing").asBoolean(false);

        // Prevent unauthorized typing events (same rule as SUB).
        var access = conversationRepository.findAccess(ctx.claims().tenantId(), conversationId).orElse(null);
        if (access == null) {
            sendError(session, "conversation_not_found", rid);
            return;
        }
        if (!canAccessConversation(ctx.claims(), access)) {
            sendError(session, "forbidden", rid);
            return;
        }

        // convenience: ensure sender is subscribed before broadcast
        sessionRegistry.subscribe(conversationId, session);

        ObjectNode evt = objectMapper.createObjectNode();
        evt.put("type", "TYPING");
        evt.put("conversation_id", conversationId);
        evt.put("sender_role", ctx.claims().role());
        evt.put("sender_id", ctx.claims().userId());
        evt.put("is_typing", isTyping);
        broadcaster.broadcastToConversation(conversationId, evt);
    }

    private void handleSync(WebSocketSession session, JsonNode root, String rid) throws IOException {
        var ctx = sessionRegistry.get(session).orElse(null);
        if (ctx == null) {
            sendError(session, "unauthorized", rid);
            return;
        }

        var conversationId = root.path("conversation_id").asText(null);
        if (conversationId == null || conversationId.isBlank()) {
            sendError(session, "missing_conversation_id", rid);
            return;
        }
        var afterMsgId = root.path("after_msg_id").asText(null);

        // convenience: ensure sender is subscribed
        sessionRegistry.subscribe(conversationId, session);

        try {
            var page = messageService.listMessagesPage(ctx.claims(), conversationId, afterMsgId, 200);

            ObjectNode res = objectMapper.createObjectNode();
            res.put("type", "SYNC_RES");
            res.put("conversation_id", conversationId);
            if (afterMsgId != null && !afterMsgId.isBlank()) {
                res.put("after_msg_id", afterMsgId);
            }

            ArrayNode arr = objectMapper.createArrayNode();
            for (var item : page.messages()) {
                ObjectNode msgObj = objectMapper.createObjectNode();
                msgObj.put("id", item.id());
                msgObj.put("sender_type", item.sender_type());
                msgObj.put("sender_id", item.sender_id());
                msgObj.put("content_type", item.content_type());
                msgObj.set("content", item.content());
                msgObj.put("created_at", item.created_at());
                msgObj.put("preview_text", buildPreviewText(item));
                arr.add(msgObj);
            }
            res.set("messages", arr);
            res.put("has_more", page.has_more());
            if (page.next_after_msg_id() != null && !page.next_after_msg_id().isBlank()) {
                res.put("next_after_msg_id", page.next_after_msg_id());
            }
            if (page.reset()) {
                res.put("reset", true);
            }

            // First-page sync: include conversation lifecycle events for timeline replay.
            if (afterMsgId == null || afterMsgId.isBlank()) {
                ArrayNode evArr = objectMapper.createArrayNode();
                try {
                    var events = conversationEventRepository.listByConversation(ctx.claims().tenantId(), conversationId, 500);
                    for (var ev : events) {
                        ObjectNode o = objectMapper.createObjectNode();
                        o.put("conversation_id", conversationId);
                        o.put("event_id", ev.id());
                        o.put("event_key", ev.eventKey());
                        o.put("created_at", ev.createdAt().getEpochSecond());
                        if (ev.data() != null) {
                            o.set("data", ev.data());
                        }
                        evArr.add(o);
                    }
                } catch (Exception ignored) {
                    // best-effort
                }
                res.set("conversation_events", evArr);
            }

            send(session, res);
        } catch (IllegalArgumentException ex) {
            sendError(session, ex.getMessage(), rid);
        }
    }

    private void sendError(WebSocketSession session, String code, String rid) throws IOException {
        ObjectNode err = objectMapper.createObjectNode();
        err.put("type", "ERROR");
        err.put("code", code);
        err.put("message", errorMessageForCode(code));
        if (rid != null && !rid.isBlank()) {
            err.put("rid", rid);
        }
        send(session, err);
    }

    private String errorMessageForCode(String code) {
        if (code == null || code.isBlank()) return "error";
        return switch (code) {
            case "missing_type" -> "missing field: type";
            case "missing_token" -> "missing auth token";
            case "token_expired" -> "auth token expired";
            case "invalid_token" -> "invalid auth token";
            case "unauthorized" -> "unauthorized";
            case "missing_conversation_id" -> "missing field: conversation_id";
            case "missing_text" -> "missing field: content.text";
            case "missing_attachment_id" -> "missing field: content.attachment_id";
            case "unsupported_content_type" -> "unsupported content_type";
            case "missing_last_read_msg_id" -> "missing field: last_read_msg_id";
            case "last_read_msg_id_not_found" -> "last_read_msg_id not found";
            case "missing_is_typing" -> "missing field: is_typing";
            case "conversation_not_found" -> "conversation not found";
            case "attachment_not_found" -> "attachment not found";
            case "attachment_conversation_mismatch" -> "attachment conversation mismatch";
            case "forbidden" -> "forbidden";
            case "unsupported_type" -> "unsupported message type";
            case "ws_internal_error" -> "internal websocket error";
            default -> code;
        };
    }

    private void closeQuietly(WebSocketSession session, CloseStatus status) {
        try {
            if (session != null && session.isOpen()) {
                session.close(status);
            }
        } catch (Exception ignore) {
            // ignore
        }
    }

    private String safeOneLine(String s) {
        if (s == null) return "";
        var x = s.replaceAll("[\\r\\n\\t]", " ");
        return x.length() > 500 ? x.substring(0, 500) + "..." : x;
    }

    private void send(WebSocketSession session, JsonNode node) throws IOException {
        if (!session.isOpen()) return;
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(node)));
    }

    private ObjectNode obj(String k, String v) {
        ObjectNode n = objectMapper.createObjectNode();
        n.put(k, v);
        return n;
    }
}
