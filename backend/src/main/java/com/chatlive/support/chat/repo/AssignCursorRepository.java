package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class AssignCursorRepository {

    public record CursorRow(String tenantId, String groupKey, String lastAgentUserId) {
    }

    private final JdbcTemplate jdbcTemplate;

    public AssignCursorRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public CursorRow lockForUpdate(String tenantId, String groupKey) {
        // Ensure row exists
        var pgInsert = """
            insert into agent_assign_cursor(tenant_id, group_key, last_agent_user_id, updated_at)
            values (?, ?, null, now())
            on conflict (tenant_id, group_key) do nothing
            """;
        var h2Merge = """
            merge into agent_assign_cursor key(tenant_id, group_key)
            values (?, ?, null, current_timestamp)
            """;
        try {
            jdbcTemplate.update(pgInsert, tenantId, groupKey);
        } catch (Exception ignored) {
            jdbcTemplate.update(h2Merge, tenantId, groupKey);
        }

        var select = """
                select tenant_id, group_key, last_agent_user_id
                from agent_assign_cursor
                where tenant_id = ? and group_key = ?
                for update
                """;
        return jdbcTemplate.query(select, (rs) -> {
            if (!rs.next()) {
                throw new IllegalStateException("cursor_row_missing");
            }
            return new CursorRow(
                    rs.getString("tenant_id"),
                    rs.getString("group_key"),
                    rs.getString("last_agent_user_id")
            );
        }, tenantId, groupKey);
    }

    public void updateLastAgent(String tenantId, String groupKey, String lastAgentUserId) {
        var sql = """
                update agent_assign_cursor
                set last_agent_user_id = ?, updated_at = now()
                where tenant_id = ? and group_key = ?
                """;
        jdbcTemplate.update(sql, lastAgentUserId, tenantId, groupKey);
    }

    public Optional<String> getLastAgent(String tenantId, String groupKey) {
        var sql = "select last_agent_user_id from agent_assign_cursor where tenant_id = ? and group_key = ?";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("last_agent_user_id"), tenantId, groupKey);
        return list.stream().findFirst();
    }
}
