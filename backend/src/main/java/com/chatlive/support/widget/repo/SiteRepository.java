package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;
import java.util.Optional;

@Repository
public class SiteRepository {

    public record SiteRow(String id, String tenantId, String status) {
    }

    public record SiteAdminRow(String id, String tenantId, String name, String publicKey, String status) {
    }

    private final JdbcTemplate jdbcTemplate;

    public SiteRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<SiteRow> findByPublicKey(String publicKey) {
        var sql = "select id, tenant_id, status from site where public_key = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new SiteRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("status")
        ), publicKey);
        return list.stream().findFirst();
    }

    public Optional<SiteAdminRow> findById(String tenantId, String siteId) {
        var sql = "select id, tenant_id, name, public_key, status from site where tenant_id = ? and id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new SiteAdminRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("name"),
                rs.getString("public_key"),
                rs.getString("status")
        ), tenantId, siteId);
        return list.stream().findFirst();
    }

    public java.util.List<SiteAdminRow> listByTenant(String tenantId) {
        var sql = "select id, tenant_id, name, public_key, status from site where tenant_id = ? order by created_at desc";
        return jdbcTemplate.query(sql, (rs, rowNum) -> new SiteAdminRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("name"),
                rs.getString("public_key"),
                rs.getString("status")
        ), tenantId);
    }

    public SiteAdminRow create(String tenantId, String name, String publicKey) {
        var id = "site_" + UUID.randomUUID();
        var siteName = name == null ? "" : name.trim();
        if (siteName.isBlank()) throw new IllegalArgumentException("site_name_required");
        if (publicKey == null || publicKey.trim().isBlank()) throw new IllegalArgumentException("site_key_required");

        var sql = """
                insert into site(id, tenant_id, name, public_key, status, created_at)
                values (?, ?, ?, ?, 'active', current_timestamp)
                """;
        jdbcTemplate.update(sql, id, tenantId, siteName, publicKey.trim());
        return new SiteAdminRow(id, tenantId, siteName, publicKey.trim(), "active");
    }
}
