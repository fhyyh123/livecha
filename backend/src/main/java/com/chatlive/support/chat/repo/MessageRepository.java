package com.chatlive.support.chat.repo;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class MessageRepository {

    public record MessageRow(
            String id,
            String tenantId,
            String conversationId,
            String senderType,
            String senderId,
            String clientMsgId,
            String contentType,
            String contentJson,
            Instant createdAt
    ) {
    }

    public record InsertResult(MessageRow row, boolean inserted) {
    }

    public record Marker(Instant createdAt, String id) {
    }

    private final JdbcTemplate jdbcTemplate;

    public MessageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<MessageRow> findByClientMsgId(String tenantId, String senderId, String clientMsgId) {
        var sql = """
                select id, tenant_id, conversation_id, sender_type, sender_id, client_msg_id, content_type, content_jsonb, created_at
                from message
                where tenant_id = ? and sender_id = ? and client_msg_id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new MessageRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("conversation_id"),
                rs.getString("sender_type"),
                rs.getString("sender_id"),
                rs.getString("client_msg_id"),
                rs.getString("content_type"),
                rs.getString("content_jsonb"),
                rs.getTimestamp("created_at").toInstant()
        ), tenantId, senderId, clientMsgId);
        return list.stream().findFirst();
    }

    public InsertResult insertMessage(
            String tenantId,
            String conversationId,
            String senderType,
            String senderId,
            String clientMsgId,
            String contentType,
            String contentJson
    ) {
        var id = "m_" + UUID.randomUUID();
        var now = Instant.now();

                // Postgres jsonb needs an explicit cast; H2 uses CLOB in dev profile.
                var sqlCastJsonb = """
                                insert into message(
                                        id, tenant_id, conversation_id, sender_type, sender_id, client_msg_id, content_type, content_jsonb, created_at
                                ) values (?, ?, ?, ?, ?, ?, ?, cast(? as jsonb), ?)
                                """;

                var sqlPlain = """
                                insert into message(
                                        id, tenant_id, conversation_id, sender_type, sender_id, client_msg_id, content_type, content_jsonb, created_at
                                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """;

                try {
                        try {
                                jdbcTemplate.update(sqlCastJsonb,
                                                id,
                                                tenantId,
                                                conversationId,
                                                senderType,
                                                senderId,
                                                (clientMsgId == null || clientMsgId.isBlank()) ? null : clientMsgId,
                                                contentType,
                                                contentJson,
                                                Timestamp.from(now)
                                );
                        } catch (Exception ignored) {
                                jdbcTemplate.update(sqlPlain,
                                                id,
                                                tenantId,
                                                conversationId,
                                                senderType,
                                                senderId,
                                                (clientMsgId == null || clientMsgId.isBlank()) ? null : clientMsgId,
                                                contentType,
                                                contentJson,
                                                Timestamp.from(now)
                                );
                        }
        } catch (DuplicateKeyException dup) {
            if (clientMsgId != null && !clientMsgId.isBlank()) {
                        var existing = findByClientMsgId(tenantId, senderId, clientMsgId)
                                .orElseThrow(() -> dup);
                        return new InsertResult(existing, false);
            }
            throw dup;
        }

                var row = new MessageRow(id, tenantId, conversationId, senderType, senderId,
                        (clientMsgId == null || clientMsgId.isBlank()) ? null : clientMsgId,
                        contentType, contentJson, now);
                return new InsertResult(row, true);
    }

    public InsertResult insertTextMessage(
            String tenantId,
            String conversationId,
            String senderType,
            String senderId,
            String clientMsgId,
            String contentJson
    ) {
        return insertMessage(tenantId, conversationId, senderType, senderId, clientMsgId, "text", contentJson);
    }

    public Optional<Marker> findMarker(String tenantId, String conversationId, String msgId) {
        var sql = """
                select id, created_at
                from message
                where tenant_id = ? and conversation_id = ? and id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new Marker(
                rs.getTimestamp("created_at").toInstant(),
                rs.getString("id")
        ), tenantId, conversationId, msgId);
        return list.stream().findFirst();
    }

    public List<MessageRow> listMessages(String tenantId, String conversationId, String afterMsgId, int limit) {
        Marker marker = null;
        if (afterMsgId != null && !afterMsgId.isBlank()) {
            marker = findMarker(tenantId, conversationId, afterMsgId)
                    .orElseThrow(() -> new IllegalArgumentException("after_msg_id_not_found"));
        }

        if (marker == null) {
            var sql = """
                    select id, tenant_id, conversation_id, sender_type, sender_id, client_msg_id, content_type, content_jsonb, created_at
                    from message
                    where tenant_id = ? and conversation_id = ?
                    order by created_at asc, id asc
                    limit ?
                    """;
            return jdbcTemplate.query(sql, (rs, rowNum) -> new MessageRow(
                    rs.getString("id"),
                    rs.getString("tenant_id"),
                    rs.getString("conversation_id"),
                    rs.getString("sender_type"),
                    rs.getString("sender_id"),
                    rs.getString("client_msg_id"),
                    rs.getString("content_type"),
                    rs.getString("content_jsonb"),
                    rs.getTimestamp("created_at").toInstant()
            ), tenantId, conversationId, limit);
        }

        var sql = """
                select id, tenant_id, conversation_id, sender_type, sender_id, client_msg_id, content_type, content_jsonb, created_at
                from message
                where tenant_id = ? and conversation_id = ?
                  and (created_at > ? or (created_at = ? and id > ?))
                order by created_at asc, id asc
                limit ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new MessageRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("conversation_id"),
                rs.getString("sender_type"),
                rs.getString("sender_id"),
                rs.getString("client_msg_id"),
                rs.getString("content_type"),
                rs.getString("content_jsonb"),
                rs.getTimestamp("created_at").toInstant()
        ), tenantId, conversationId, Timestamp.from(marker.createdAt()), Timestamp.from(marker.createdAt()), marker.id(), limit);
    }
}
