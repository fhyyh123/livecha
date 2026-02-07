package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Objects;
import java.util.Optional;

@Repository
public class ConversationNoteRepository {

    private final JdbcTemplate jdbcTemplate;

    public ConversationNoteRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<String> findNote(String tenantId, String conversationId, String userId) {
        var sql = """
                select note
                from conversation_note
                where tenant_id = ? and conversation_id = ? and user_id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("note"), tenantId, conversationId, userId);
        // note is nullable; avoid Optional.of(null) inside findFirst().
        return list.stream().filter(Objects::nonNull).findFirst();
    }

    public void upsertNote(String tenantId, String conversationId, String userId, String note) {
        var sql = """
                insert into conversation_note(tenant_id, conversation_id, user_id, note, updated_at)
                values (?, ?, ?, ?, now())
                on conflict (conversation_id, user_id)
                do update set note = excluded.note, updated_at = now()
                """;
        jdbcTemplate.update(sql, tenantId, conversationId, userId, note);
    }
}
