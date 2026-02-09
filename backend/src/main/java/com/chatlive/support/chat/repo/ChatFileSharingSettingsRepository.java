package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class ChatFileSharingSettingsRepository {

    public record Row(
            String tenantId,
            boolean visitorFileEnabled,
            boolean agentFileEnabled
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public ChatFileSharingSettingsRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Row> findByTenantId(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) return Optional.empty();
        var sql = "select tenant_id, visitor_file_enabled, agent_file_enabled from chat_file_sharing_settings where tenant_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new Row(
                rs.getString("tenant_id"),
                rs.getBoolean("visitor_file_enabled"),
                rs.getBoolean("agent_file_enabled")
        ), tenantId);
        return list.stream().findFirst();
    }

    public void upsert(String tenantId, boolean visitorFileEnabled, boolean agentFileEnabled) {
        var updateSql = "update chat_file_sharing_settings set visitor_file_enabled = ?, agent_file_enabled = ?, updated_at = current_timestamp where tenant_id = ?";
        var updated = jdbcTemplate.update(updateSql, visitorFileEnabled, agentFileEnabled, tenantId);
        if (updated > 0) return;

        var insertSql = "insert into chat_file_sharing_settings(tenant_id, visitor_file_enabled, agent_file_enabled, updated_at) values (?,?,?, current_timestamp)";
        jdbcTemplate.update(insertSql, tenantId, visitorFileEnabled, agentFileEnabled);
    }
}
