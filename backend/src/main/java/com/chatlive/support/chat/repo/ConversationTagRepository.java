package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;

@Repository
public class ConversationTagRepository {

    private final JdbcTemplate jdbcTemplate;

    public ConversationTagRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<String> listTags(String tenantId, String conversationId) {
        var sql = """
                select tag
                from conversation_tag
                where tenant_id = ? and conversation_id = ?
                order by tag asc
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("tag"), tenantId, conversationId);
    }

    public void replaceTags(String tenantId, String conversationId, String actorUserId, List<String> tags) {
        var del = "delete from conversation_tag where tenant_id = ? and conversation_id = ?";
        jdbcTemplate.update(del, tenantId, conversationId);

        if (tags == null || tags.isEmpty()) {
            return;
        }

        var cleaned = new ArrayList<String>();
        for (var t : tags) {
            if (t == null) continue;
            var s = t.trim();
            if (s.isBlank()) continue;
            cleaned.add(s);
        }
        if (cleaned.isEmpty()) return;

        var ins = """
                insert into conversation_tag(tenant_id, conversation_id, tag, created_by, created_at)
                values (?, ?, ?, ?, now())
                on conflict do nothing
                """;
        for (var tag : cleaned) {
            jdbcTemplate.update(ins, tenantId, conversationId, tag, actorUserId);
        }
    }
}
