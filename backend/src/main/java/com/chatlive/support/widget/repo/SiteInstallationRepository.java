package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public class SiteInstallationRepository {

    public record SiteInstallationRow(
            String siteId,
            Instant lastSeenAt,
            String lastOrigin,
            String lastPageUrl,
            String lastUserAgent,
            String lastIp
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public SiteInstallationRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<SiteInstallationRow> findBySiteId(String siteId) {
        var sql = """
                select site_id, last_seen_at, last_origin, last_page_url, last_user_agent, last_ip
                from site_installation
                where site_id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new SiteInstallationRow(
                rs.getString("site_id"),
                rs.getTimestamp("last_seen_at").toInstant(),
                rs.getString("last_origin"),
                rs.getString("last_page_url"),
                rs.getString("last_user_agent"),
                rs.getString("last_ip")
        ), siteId);
        return list.stream().findFirst();
    }

    public void upsertLastSeen(
            String siteId,
            String origin,
            String pageUrl,
            String userAgent,
            String ip
    ) {
        var pg = """
                insert into site_installation(site_id, last_seen_at, last_origin, last_page_url, last_user_agent, last_ip)
                values (?, now(), ?, ?, ?, ?)
                on conflict (site_id)
                do update set last_seen_at = excluded.last_seen_at,
                              last_origin = excluded.last_origin,
                              last_page_url = excluded.last_page_url,
                              last_user_agent = excluded.last_user_agent,
                              last_ip = excluded.last_ip
                """;

        var h2 = """
                merge into site_installation key(site_id)
                values (?, current_timestamp, ?, ?, ?, ?)
                """;

        try {
            jdbcTemplate.update(pg, siteId, origin, pageUrl, userAgent, ip);
        } catch (Exception ignored) {
            // H2 fallback
            jdbcTemplate.update(h2, siteId, origin, pageUrl, userAgent, ip);
        }
    }
}
