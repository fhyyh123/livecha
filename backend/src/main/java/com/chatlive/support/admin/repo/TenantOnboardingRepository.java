package com.chatlive.support.admin.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class TenantOnboardingRepository {

    public record TenantOnboardingRow(
            String tenantId,
            String website,
            String companySize,
            String integrations,
            java.time.Instant installationAckAt,
            java.time.Instant completedAt
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public TenantOnboardingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<TenantOnboardingRow> findByTenantId(String tenantId) {
        var sql = "select tenant_id, website, company_size, integrations, installation_ack_at, completed_at from tenant_onboarding where tenant_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new TenantOnboardingRow(
                rs.getString("tenant_id"),
                rs.getString("website"),
                rs.getString("company_size"),
                rs.getString("integrations"),
                rs.getTimestamp("installation_ack_at") == null ? null : rs.getTimestamp("installation_ack_at").toInstant(),
                rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant()
        ), tenantId);
        return list.stream().findFirst();
    }

    public void markInstallationAcknowledged(String tenantId) {
        var sql = "update tenant_onboarding set installation_ack_at = coalesce(installation_ack_at, current_timestamp), updated_at = current_timestamp where tenant_id = ?";
        var updated = jdbcTemplate.update(sql, tenantId);
        if (updated > 0) return;

        // If row doesn't exist yet, create it.
        var insert = "insert into tenant_onboarding(tenant_id, installation_ack_at, updated_at) values (?, current_timestamp, current_timestamp)";
        try {
            jdbcTemplate.update(insert, tenantId);
        } catch (Exception ignored) {
            jdbcTemplate.update(sql, tenantId);
        }
    }

    public void markCompleted(String tenantId) {
        var sql = "update tenant_onboarding set completed_at = coalesce(completed_at, current_timestamp), updated_at = current_timestamp where tenant_id = ?";
        var updated = jdbcTemplate.update(sql, tenantId);
        if (updated > 0) return;

        // If row doesn't exist yet, create it.
        var insert = "insert into tenant_onboarding(tenant_id, completed_at, updated_at) values (?, current_timestamp, current_timestamp)";
        try {
            jdbcTemplate.update(insert, tenantId);
        } catch (Exception ignored) {
            jdbcTemplate.update(sql, tenantId);
        }
    }

    public void upsertWebsite(String tenantId, String website) {
        upsert(tenantId, website, null, null);
    }

    public void upsertCompanySize(String tenantId, String companySize) {
        upsert(tenantId, null, companySize, null);
    }

    public void upsertIntegrations(String tenantId, String integrations) {
        upsert(tenantId, null, null, integrations);
    }

    private void upsert(String tenantId, String website, String companySize, String integrations) {
        var update = """
                update tenant_onboarding
                set website = coalesce(?, website),
                    company_size = coalesce(?, company_size),
                    integrations = coalesce(?, integrations),
                    updated_at = current_timestamp
                where tenant_id = ?
                """;
        var updated = jdbcTemplate.update(update, website, companySize, integrations, tenantId);
        if (updated > 0) return;

        var insert = """
                insert into tenant_onboarding(tenant_id, website, company_size, integrations, updated_at)
                values (?, ?, ?, ?, current_timestamp)
                """;
        try {
            jdbcTemplate.update(insert, tenantId, website, companySize, integrations);
        } catch (Exception ignored) {
            // concurrent insert; best effort
            jdbcTemplate.update(update, website, companySize, integrations, tenantId);
        }
    }
}
