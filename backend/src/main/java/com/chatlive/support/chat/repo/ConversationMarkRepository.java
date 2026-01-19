package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class ConversationMarkRepository {

    private final JdbcTemplate jdbcTemplate;

    public ConversationMarkRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void upsertStarred(String tenantId, String conversationId, String userId, boolean starred) {
        var sql = """
                insert into conversation_mark(tenant_id, conversation_id, user_id, starred, updated_at)
                values (?, ?, ?, ?, now())
                on conflict (conversation_id, user_id)
                do update set starred = excluded.starred, updated_at = now()
                """;
        jdbcTemplate.update(sql, tenantId, conversationId, userId, starred);
    }

    public Optional<Boolean> findStarred(String tenantId, String conversationId, String userId) {
        var sql = """
                select starred
                from conversation_mark
                where tenant_id = ? and conversation_id = ? and user_id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getBoolean("starred"), tenantId, conversationId, userId);
        return list.stream().findFirst();
    }
}
