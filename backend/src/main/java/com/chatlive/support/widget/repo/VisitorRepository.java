package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public class VisitorRepository {

    public record VisitorRow(
            String id,
            String siteId,
            String name,
            String email,
            String geoCountry,
            String geoRegion,
            String geoCity,
            Double geoLat,
            Double geoLon,
            String geoTimezone,
            Instant geoUpdatedAt
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public VisitorRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<VisitorRow> findByIdAndSite(String visitorId, String siteId) {
        var sql = "select id, site_id, name, email, geo_country, geo_region, geo_city, geo_lat, geo_lon, geo_timezone, geo_updated_at " +
            "from visitor where id = ? and site_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new VisitorRow(
                rs.getString("id"),
                rs.getString("site_id"),
                rs.getString("name"),
            rs.getString("email"),
            rs.getString("geo_country"),
            rs.getString("geo_region"),
            rs.getString("geo_city"),
            getDouble(rs.getObject("geo_lat")),
            getDouble(rs.getObject("geo_lon")),
            rs.getString("geo_timezone"),
            toInstant(rs.getTimestamp("geo_updated_at"))
        ), visitorId, siteId);
        return list.stream().findFirst();
    }

        public void updateGeo(String visitorId, String siteId, String country, String region, String city, Double lat, Double lon, String timezone) {
        var sql = "update visitor set geo_country = ?, geo_region = ?, geo_city = ?, geo_lat = ?, geo_lon = ?, geo_timezone = ?, geo_updated_at = now() " +
            "where id = ? and site_id = ?";
        jdbcTemplate.update(sql, country, region, city, lat, lon, timezone, visitorId, siteId);
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

    private static Double getDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Double d) return d;
        if (o instanceof Float f) return (double) f;
        if (o instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(o.toString());
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Instant toInstant(Timestamp ts) {
        if (ts == null) return null;
        try {
            return ts.toInstant();
        } catch (Exception ignore) {
            return null;
        }
    }
}
