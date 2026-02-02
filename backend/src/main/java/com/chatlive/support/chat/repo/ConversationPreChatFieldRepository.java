package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class ConversationPreChatFieldRepository {

    public record PreChatFieldRow(
            String fieldKey,
            String fieldLabel,
            String fieldType,
            String valueJson
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public ConversationPreChatFieldRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<PreChatFieldRow> listByConversation(String tenantId, String conversationId) {
        var sql = """
                select field_key, field_label, field_type, value_json
                from conversation_pre_chat_field
                where tenant_id = ? and conversation_id = ?
                order by field_key asc
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new PreChatFieldRow(
                rs.getString("field_key"),
                rs.getString("field_label"),
                rs.getString("field_type"),
                rs.getString("value_json")
        ), tenantId, conversationId);
    }

    public void upsert(String tenantId, String conversationId, String fieldKey, String fieldLabel, String fieldType, String valueJson) {
        var sql = """
                insert into conversation_pre_chat_field(
                    tenant_id, conversation_id, field_key, field_label, field_type, value_json, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, now(), now())
                on conflict (tenant_id, conversation_id, field_key)
                do update set
                    field_label = excluded.field_label,
                    field_type = excluded.field_type,
                    value_json = excluded.value_json,
                    updated_at = now()
                """;
        jdbcTemplate.update(sql, tenantId, conversationId, fieldKey, fieldLabel, fieldType, valueJson);
    }
}
