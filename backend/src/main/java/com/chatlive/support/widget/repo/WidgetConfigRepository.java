package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class WidgetConfigRepository {

    public record WidgetConfigRow(
            String siteId,
            boolean anonymousEnabled,
            String themeColor,
            String welcomeText,
            String cookieDomain,
            String cookieSameSite
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public WidgetConfigRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<WidgetConfigRow> findBySiteId(String siteId) {
        var sql = "select site_id, anonymous_enabled, theme_color, welcome_text, cookie_domain, cookie_samesite from widget_config where site_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new WidgetConfigRow(
                rs.getString("site_id"),
                rs.getBoolean("anonymous_enabled"),
                rs.getString("theme_color"),
                rs.getString("welcome_text"),
                rs.getString("cookie_domain"),
                rs.getString("cookie_samesite")
        ), siteId);
        return list.stream().findFirst();
    }

    public void upsert(
            String siteId,
            boolean anonymousEnabled,
            String themeColor,
            String welcomeText,
            String cookieDomain,
            String cookieSameSite
    ) {
        var updateSql = "update widget_config set anonymous_enabled = ?, theme_color = ?, welcome_text = ?, cookie_domain = ?, cookie_samesite = ?, updated_at = current_timestamp where site_id = ?";
        var updated = jdbcTemplate.update(updateSql, anonymousEnabled, themeColor, welcomeText, cookieDomain, cookieSameSite, siteId);
        if (updated > 0) return;

        var insertSql = "insert into widget_config(site_id, anonymous_enabled, theme_color, welcome_text, cookie_domain, cookie_samesite, created_at, updated_at) values (?,?,?,?,?,?, current_timestamp, current_timestamp)";
        jdbcTemplate.update(insertSql, siteId, anonymousEnabled, themeColor, welcomeText, cookieDomain, cookieSameSite);
    }
}
