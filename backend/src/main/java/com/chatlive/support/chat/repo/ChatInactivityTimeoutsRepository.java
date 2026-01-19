package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class ChatInactivityTimeoutsRepository {

    public record Row(
            String tenantId,
        boolean visitorIdleEnabled,
            int visitorIdleMinutes,
        boolean inactivityArchiveEnabled,
            int inactivityArchiveMinutes
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public ChatInactivityTimeoutsRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Row> findByTenantId(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) return Optional.empty();
        var sql = "select tenant_id, visitor_idle_enabled, visitor_idle_minutes, inactivity_archive_enabled, inactivity_archive_minutes from chat_inactivity_timeouts where tenant_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new Row(
                rs.getString("tenant_id"),
                rs.getBoolean("visitor_idle_enabled"),
                rs.getInt("visitor_idle_minutes"),
                rs.getBoolean("inactivity_archive_enabled"),
                rs.getInt("inactivity_archive_minutes")
        ), tenantId);
        return list.stream().findFirst();
    }

    public void upsert(String tenantId, boolean visitorIdleEnabled, int visitorIdleMinutes, boolean inactivityArchiveEnabled, int inactivityArchiveMinutes) {
        var updateSql = "update chat_inactivity_timeouts set visitor_idle_enabled = ?, visitor_idle_minutes = ?, inactivity_archive_enabled = ?, inactivity_archive_minutes = ?, updated_at = current_timestamp where tenant_id = ?";
        var updated = jdbcTemplate.update(updateSql, visitorIdleEnabled, visitorIdleMinutes, inactivityArchiveEnabled, inactivityArchiveMinutes, tenantId);
        if (updated > 0) return;

        var insertSql = "insert into chat_inactivity_timeouts(tenant_id, visitor_idle_enabled, visitor_idle_minutes, inactivity_archive_enabled, inactivity_archive_minutes, updated_at) values (?,?,?,?,?, current_timestamp)";
        jdbcTemplate.update(insertSql, tenantId, visitorIdleEnabled, visitorIdleMinutes, inactivityArchiveEnabled, inactivityArchiveMinutes);
    }
}
