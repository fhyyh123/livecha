package com.chatlive.support.chat.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Repository
public class ConversationEventRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public ConversationEventRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public record ConversationEventRow(
            String id,
            String tenantId,
            String conversationId,
            String eventKey,
            Instant createdAt,
            JsonNode data
    ) {
    }

    public void insertEvent(
            String id,
            String tenantId,
            String conversationId,
            String eventKey,
            String dataJson,
            Instant createdAt
    ) {
        var sqlCastJsonb = """
            insert into conversation_event(id, tenant_id, conversation_id, event_key, data_jsonb, created_at)
            values (?, ?, ?, ?, cast(? as jsonb), ?)
            """;

        var sqlPlain = """
            insert into conversation_event(id, tenant_id, conversation_id, event_key, data_jsonb, created_at)
            values (?, ?, ?, ?, ?, ?)
            """;

        try {
            try {
                jdbcTemplate.update(sqlCastJsonb,
                        id,
                        tenantId,
                        conversationId,
                        eventKey,
                        dataJson,
                        Timestamp.from(createdAt)
                );
            } catch (Exception ignored) {
                jdbcTemplate.update(sqlPlain,
                        id,
                        tenantId,
                        conversationId,
                        eventKey,
                        dataJson,
                        Timestamp.from(createdAt)
                );
            }
        } catch (DuplicateKeyException dup) {
            // idempotent
        }
    }

    public List<ConversationEventRow> listByConversation(String tenantId, String conversationId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 1000));
        var sql = """
            select id, tenant_id, conversation_id, event_key, created_at, data_jsonb
            from conversation_event
            where tenant_id = ?
              and conversation_id = ?
            order by created_at asc
            limit ?
            """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            JsonNode data;
            try {
                data = objectMapper.readTree(rs.getString("data_jsonb"));
            } catch (Exception ignored) {
                data = objectMapper.createObjectNode();
            }
            return new ConversationEventRow(
                    rs.getString("id"),
                    rs.getString("tenant_id"),
                    rs.getString("conversation_id"),
                    rs.getString("event_key"),
                    rs.getTimestamp("created_at").toInstant(),
                    data
            );
        }, tenantId, conversationId, safeLimit);
    }
}
