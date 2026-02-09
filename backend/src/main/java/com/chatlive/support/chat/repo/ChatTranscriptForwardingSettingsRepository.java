package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class ChatTranscriptForwardingSettingsRepository {

    public record Row(
            String tenantId,
            String forwardToEmail
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public ChatTranscriptForwardingSettingsRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Row> findByTenantId(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) return Optional.empty();
        var sql = "select tenant_id, forward_to_email from chat_transcript_forwarding_settings where tenant_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new Row(
                rs.getString("tenant_id"),
                rs.getString("forward_to_email")
        ), tenantId);
        return list.stream().findFirst();
    }

    public void upsert(String tenantId, String forwardToEmail) {
        if (tenantId == null || tenantId.isBlank()) throw new IllegalArgumentException("tenant_required");

        String email = forwardToEmail == null ? null : forwardToEmail.trim();
        if (email != null && email.isBlank()) email = null;

        var updateSql = "update chat_transcript_forwarding_settings set forward_to_email = ?, updated_at = current_timestamp where tenant_id = ?";
        var updated = jdbcTemplate.update(updateSql, email, tenantId);
        if (updated > 0) return;

        var insertSql = "insert into chat_transcript_forwarding_settings(tenant_id, forward_to_email, updated_at) values (?,?, current_timestamp)";
        jdbcTemplate.update(insertSql, tenantId, email);
    }
}
