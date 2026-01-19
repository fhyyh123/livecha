package com.chatlive.support.chat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.api.MessageItem;
import com.chatlive.support.chat.api.MessagePage;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.MessageRepository;
import com.chatlive.support.chat.repo.MessageStateRepository;
import com.chatlive.support.chat.ws.WsSessionRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class MessageService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final MessageStateRepository messageStateRepository;
    private final ObjectMapper objectMapper;
    private final WsSessionRegistry wsSessionRegistry;
    private final AttachmentService attachmentService;
    private final AssignmentService assignmentService;

    public MessageService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            MessageStateRepository messageStateRepository,
            ObjectMapper objectMapper,
            WsSessionRegistry wsSessionRegistry,
            AttachmentService attachmentService,
            AssignmentService assignmentService
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.messageStateRepository = messageStateRepository;
        this.objectMapper = objectMapper;
        this.wsSessionRegistry = wsSessionRegistry;
        this.attachmentService = attachmentService;
        this.assignmentService = assignmentService;
    }

    public record SendResult(MessageItem item, boolean inserted, boolean reopened) {
    }

    public SendResult sendText(JwtClaims claims, String conversationId, String clientMsgId, String text) {
        var conv = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        var reopened = maybeReopenIfClosedOnInboundMessage(claims, conv);
        if ("closed".equals(conv.status()) && !reopened) {
            throw new IllegalArgumentException("conversation_closed");
        }

        var senderType = normalizeSenderType(claims.role());

        ObjectNode content = objectMapper.createObjectNode();
        content.put("text", text);

        var insert = messageRepository.insertTextMessage(
                claims.tenantId(),
                conversationId,
            senderType,
                claims.userId(),
                clientMsgId,
                content.toString()
        );

        if (insert.inserted()) {
            conversationRepository.touchLastMsgAt(claims.tenantId(), conversationId);
            if ("customer".equals(senderType)) {
                conversationRepository.touchLastCustomerMsgAt(claims.tenantId(), conversationId);
            }
        }

        return new SendResult(toItem(insert.row(), content), insert.inserted(), reopened);
    }

    public SendResult sendFile(
            JwtClaims claims,
            String conversationId,
            String clientMsgId,
            String attachmentId
    ) {
        var conv = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        var reopened = maybeReopenIfClosedOnInboundMessage(claims, conv);
        if ("closed".equals(conv.status()) && !reopened) {
            throw new IllegalArgumentException("conversation_closed");
        }

        var senderType = normalizeSenderType(claims.role());
        var attachment = attachmentService.requireOwnedForSend(claims, conversationId, attachmentId);

        ObjectNode content = objectMapper.createObjectNode();
        content.put("attachment_id", attachment.id());
        if (attachment.filename() != null && !attachment.filename().isBlank()) {
            content.put("filename", attachment.filename());
        }
        if (attachment.contentType() != null && !attachment.contentType().isBlank()) {
            content.put("mime", attachment.contentType());
        }
        content.put("size_bytes", attachment.sizeBytes());

        var insert = messageRepository.insertMessage(
                claims.tenantId(),
                conversationId,
                senderType,
                claims.userId(),
                clientMsgId,
                "file",
                content.toString()
        );

        if (insert.inserted()) {
            conversationRepository.touchLastMsgAt(claims.tenantId(), conversationId);
            if ("customer".equals(senderType)) {
                conversationRepository.touchLastCustomerMsgAt(claims.tenantId(), conversationId);
            }
            attachmentService.markLinked(claims, attachment.id(), insert.row().id());
        }

        return new SendResult(toItem(insert.row(), content), insert.inserted(), reopened);
    }

    private boolean maybeReopenIfClosedOnInboundMessage(JwtClaims claims, ConversationRepository.ConversationAccessRow conv) {
        if (claims == null || conv == null) return false;
        if (!"closed".equals(conv.status())) return false;

        // Product behavior: when an agent closes a conversation, visitor/customer may still send.
        // We treat it as a reopen -> queued -> (best-effort) auto-assign.
        if (!"visitor".equals(claims.role()) && !"customer".equals(claims.role())) {
            return false;
        }

        var skillGroupId = conversationRepository.findSkillGroupId(claims.tenantId(), conv.id()).orElse(null);
        var updated = conversationRepository.reopenToQueued(claims.tenantId(), conv.id());
        if (updated > 0) {
            assignmentService.autoAssignNewConversation(claims.tenantId(), conv.id(), skillGroupId);
            return true;
        }

        // If updated==0, someone else may have reopened concurrently; allow send anyway.
        return true;
    }

    public long markRead(JwtClaims claims, String conversationId, String lastReadMsgId) {
        var conv = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        if (lastReadMsgId == null || lastReadMsgId.isBlank()) {
            throw new IllegalArgumentException("missing_last_read_msg_id");
        }

        // Ensure the marker exists within this conversation to avoid storing garbage ids.
        messageRepository.findMarker(claims.tenantId(), conversationId, lastReadMsgId)
                .orElseThrow(() -> new IllegalArgumentException("last_read_msg_id_not_found"));

        return messageStateRepository.upsertLastReadAndGetUpdatedAtSeconds(conversationId, claims.userId(), lastReadMsgId);
    }

    public List<MessageItem> listMessages(JwtClaims claims, String conversationId, String afterMsgId, int limit) {
        var conv = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        try {
            return toItems(messageRepository.listMessages(claims.tenantId(), conversationId, afterMsgId, limit));
        } catch (IllegalArgumentException ex) {
            // 断线续拉时客户端的 last_msg_id 可能失效（清库/迁移/历史被裁剪等），M1 先降级从头拉。
            if ("after_msg_id_not_found".equals(ex.getMessage())) {
                return toItems(messageRepository.listMessages(claims.tenantId(), conversationId, null, limit));
            }
            throw ex;
        }
    }

    public MessagePage listMessagesPage(JwtClaims claims, String conversationId, String afterMsgId, int pageSize) {
        var conv = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));
        ensureCanAccessConversation(claims, conv);

        var effectiveAfter = afterMsgId;
        var reset = false;

        List<MessageRepository.MessageRow> rows;
        try {
            rows = messageRepository.listMessages(claims.tenantId(), conversationId, effectiveAfter, pageSize + 1);
        } catch (IllegalArgumentException ex) {
            if ("after_msg_id_not_found".equals(ex.getMessage())) {
                reset = true;
                effectiveAfter = null;
                rows = messageRepository.listMessages(claims.tenantId(), conversationId, null, pageSize + 1);
            } else {
                throw ex;
            }
        }

        var hasMore = rows.size() > pageSize;
        if (hasMore) {
            rows = rows.subList(0, pageSize);
        }

        var items = toItems(rows);
        var nextAfter = items.isEmpty() ? effectiveAfter : items.getLast().id();
        return new MessagePage(items, hasMore, nextAfter, reset);
    }

    private void ensureCanAccessConversation(JwtClaims claims, ConversationRepository.ConversationAccessRow conv) {
        if ("customer".equals(claims.role())) {
            if (!claims.userId().equals(conv.customerUserId())) {
                throw new IllegalArgumentException("forbidden");
            }
            return;
        }

        if ("visitor".equals(claims.role())) {
            if (claims.siteId() == null || claims.siteId().isBlank()) {
                throw new IllegalArgumentException("forbidden");
            }
            if (conv.siteId() == null || conv.siteId().isBlank() || !claims.siteId().equals(conv.siteId())) {
                throw new IllegalArgumentException("forbidden");
            }
            if (conv.visitorId() == null || conv.visitorId().isBlank() || !claims.userId().equals(conv.visitorId())) {
                throw new IllegalArgumentException("forbidden");
            }
            return;
        }

        // 收紧：仅允许 assigned + 自己订阅过的会话
        if (claims.tenantId() == null || !claims.tenantId().equals(conv.tenantId())) {
            throw new IllegalArgumentException("forbidden");
        }

        // Archives: closed conversations are tenant-readable.
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

    private String normalizeSenderType(String role) {
        if (role == null) return "system";
        return switch (role) {
            case "customer" -> "customer";
            case "visitor" -> "customer";
            case "agent", "admin" -> "agent";
            default -> "system";
        };
    }

    private MessageItem toItem(MessageRepository.MessageRow row, JsonNode content) {
        return new MessageItem(
                row.id(),
                row.senderType(),
                row.senderId(),
                row.contentType(),
                content,
                row.createdAt().getEpochSecond()
        );
    }

    private List<MessageItem> toItems(List<MessageRepository.MessageRow> rows) {
        return rows.stream().map(row -> {
            JsonNode content;
            try {
                content = objectMapper.readTree(row.contentJson());
            } catch (Exception e) {
                content = objectMapper.createObjectNode();
            }
            return toItem(row, content);
        }).toList();
    }
}
