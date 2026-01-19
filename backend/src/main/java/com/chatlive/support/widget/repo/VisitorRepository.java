package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class VisitorRepository {

    public record VisitorRow(String id, String siteId, String name, String email) {
    }

    private final JdbcTemplate jdbcTemplate;

    public VisitorRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<VisitorRow> findByIdAndSite(String visitorId, String siteId) {
        var sql = "select id, site_id, name, email from visitor where id = ? and site_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new VisitorRow(
                rs.getString("id"),
                rs.getString("site_id"),
                rs.getString("name"),
                rs.getString("email")
        ), visitorId, siteId);
        return list.stream().findFirst();
    }

    public String createAnonymous(String siteId) {
        var id = "v_" + UUID.randomUUID();
        var sql = "insert into visitor(id, site_id, name, email, created_at, last_seen_at) values (?, ?, null, null, now(), now())";
        jdbcTemplate.update(sql, id, siteId);
        return id;
    }

    public void createAnonymousWithId(String siteId, String visitorId) {
        var sql = "insert into visitor(id, site_id, name, email, created_at, last_seen_at) values (?, ?, null, null, now(), now())";
        jdbcTemplate.update(sql, visitorId, siteId);
    }

    public void updateIdentity(String visitorId, String name, String email) {
        var sql = "update visitor set name = ?, email = ? where id = ?";
        jdbcTemplate.update(sql, name, email, visitorId);
    }

    public void touchLastSeen(String visitorId) {
        var sql = "update visitor set last_seen_at = now() where id = ?";
        jdbcTemplate.update(sql, visitorId);
    }
}
