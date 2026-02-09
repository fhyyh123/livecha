package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class SiteBannedCustomerRepository {

    public record BannedCustomerRow(
            String id,
            String siteId,
            String ip,
            Instant expiresAt,
            Instant createdAt,
            String createdBy
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public SiteBannedCustomerRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<BannedCustomerRow> listActive(String siteId) {
        var sql = """
                select id, site_id, ip, expires_at, created_at, created_by
                from site_banned_customer
                where site_id = ? and (expires_at is null or expires_at > current_timestamp)
                order by created_at desc
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new BannedCustomerRow(
                rs.getString("id"),
                rs.getString("site_id"),
                rs.getString("ip"),
                Optional.ofNullable(rs.getTimestamp("expires_at")).map(Timestamp::toInstant).orElse(null),
                Optional.ofNullable(rs.getTimestamp("created_at")).map(Timestamp::toInstant).orElse(null),
                rs.getString("created_by")
        ), siteId);
    }

    public boolean isBannedNow(String siteId, String ip) {
        var sql = """
                select count(1)
                from site_banned_customer
                where site_id = ? and ip = ? and (expires_at is null or expires_at > current_timestamp)
                """;
        Integer n = jdbcTemplate.queryForObject(sql, Integer.class, siteId, ip);
        return n != null && n > 0;
    }

    public void banOrExtend(String siteId, String ip, Instant expiresAt, String createdBy) {
        var id = "ban_" + UUID.randomUUID();

        // Postgres upsert.
        var pg = """
                insert into site_banned_customer(id, site_id, ip, expires_at, created_by)
                values (?, ?, ?, ?, ?)
                on conflict (site_id, ip)
                do update set
                    expires_at = excluded.expires_at,
                    created_at = now(),
                    created_by = excluded.created_by
                """;

        // H2 merge: keep it simple, overwrite by unique constraint.
        var h2 = """
                merge into site_banned_customer(site_id, ip, id, expires_at, created_at, created_by)
                values (?, ?, ?, ?, current_timestamp, ?)
                """;

        try {
            jdbcTemplate.update(pg, siteId, ip, Timestamp.from(expiresAt), createdBy);
        } catch (Exception ignored) {
            try {
                jdbcTemplate.update(h2, siteId, ip, id, Timestamp.from(expiresAt), createdBy);
            } catch (Exception ignored2) {
                // ignore
            }
        }
    }

    public int unban(String siteId, String ip) {
        var sql = "delete from site_banned_customer where site_id = ? and ip = ?";
        return jdbcTemplate.update(sql, siteId, ip);
    }
}
