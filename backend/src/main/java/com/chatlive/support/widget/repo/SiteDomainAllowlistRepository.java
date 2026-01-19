package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class SiteDomainAllowlistRepository {

    private final JdbcTemplate jdbcTemplate;

    public SiteDomainAllowlistRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean isAllowed(String siteId, String domain) {
        var sql = "select count(1) from site_domain_allowlist where site_id = ? and domain = ?";
        Integer n = jdbcTemplate.queryForObject(sql, Integer.class, siteId, domain);
        return n != null && n > 0;
    }

    public List<String> listDomains(String siteId) {
        var sql = "select domain from site_domain_allowlist where site_id = ? order by created_at desc";
        return jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("domain"), siteId);
    }

    public void addDomain(String siteId, String domain) {
        // Idempotent-ish: ignore duplicates.
        var pg = "insert into site_domain_allowlist(site_id, domain) values (?, ?) on conflict do nothing";
        var h2 = "merge into site_domain_allowlist key(site_id, domain) values (?, ?, current_timestamp)";
        try {
            jdbcTemplate.update(pg, siteId, domain);
        } catch (Exception ignored) {
            try {
                jdbcTemplate.update(h2, siteId, domain);
            } catch (Exception ignored2) {
                // ignore
            }
        }
    }

    public int deleteDomain(String siteId, String domain) {
        var sql = "delete from site_domain_allowlist where site_id = ? and domain = ?";
        return jdbcTemplate.update(sql, siteId, domain);
    }

    /**
     * Used for CORS preflight where site_id is not always available.
     * Limits public endpoints to origins that are allowlisted by at least one active site.
     */
    public boolean isAllowedByAnyActiveSite(String domain) {
        var sql = """
                select count(1)
                from site_domain_allowlist a
                join site s on s.id = a.site_id
                where a.domain = ? and s.status = 'active'
                """;
        Integer n = jdbcTemplate.queryForObject(sql, Integer.class, domain);
        return n != null && n > 0;
    }
}
