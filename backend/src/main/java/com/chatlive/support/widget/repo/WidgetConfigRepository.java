package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class WidgetConfigRepository {

    public record WidgetConfigRow(
            String siteId,
            boolean preChatEnabled,
        String preChatFieldsJson,
            String themeColor,
            String welcomeText,
            String cookieDomain,
            String cookieSameSite,
            String preChatMessage,
            String preChatNameLabel,
            String preChatEmailLabel,
            boolean preChatNameRequired,
            boolean preChatEmailRequired
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public WidgetConfigRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<WidgetConfigRow> findBySiteId(String siteId) {
        var sql = "select site_id, pre_chat_enabled, pre_chat_fields_json, theme_color, welcome_text, cookie_domain, cookie_samesite, pre_chat_message, pre_chat_name_label, pre_chat_email_label, pre_chat_name_required, pre_chat_email_required from widget_config where site_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new WidgetConfigRow(
                rs.getString("site_id"),
            rs.getBoolean("pre_chat_enabled"),
            rs.getString("pre_chat_fields_json"),
                rs.getString("theme_color"),
                rs.getString("welcome_text"),
                rs.getString("cookie_domain"),
            rs.getString("cookie_samesite"),
            rs.getString("pre_chat_message"),
            rs.getString("pre_chat_name_label"),
            rs.getString("pre_chat_email_label"),
            rs.getBoolean("pre_chat_name_required"),
            rs.getBoolean("pre_chat_email_required")
        ), siteId);
        return list.stream().findFirst();
    }

    public void upsert(
            String siteId,
            boolean preChatEnabled,
            String preChatFieldsJson,
            String themeColor,
            String welcomeText,
            String cookieDomain,
            String cookieSameSite,
            String preChatMessage,
            String preChatNameLabel,
            String preChatEmailLabel,
            boolean preChatNameRequired,
            boolean preChatEmailRequired
    ) {
        var updateSql = "update widget_config set pre_chat_enabled = ?, pre_chat_fields_json = ?, theme_color = ?, welcome_text = ?, cookie_domain = ?, cookie_samesite = ?, pre_chat_message = ?, pre_chat_name_label = ?, pre_chat_email_label = ?, pre_chat_name_required = ?, pre_chat_email_required = ?, updated_at = current_timestamp where site_id = ?";
        var updated = jdbcTemplate.update(updateSql, preChatEnabled, preChatFieldsJson, themeColor, welcomeText, cookieDomain, cookieSameSite, preChatMessage, preChatNameLabel, preChatEmailLabel, preChatNameRequired, preChatEmailRequired, siteId);
        if (updated > 0) return;

        var insertSql = "insert into widget_config(site_id, pre_chat_enabled, pre_chat_fields_json, theme_color, welcome_text, cookie_domain, cookie_samesite, pre_chat_message, pre_chat_name_label, pre_chat_email_label, pre_chat_name_required, pre_chat_email_required, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?, ?, current_timestamp, current_timestamp)";
        jdbcTemplate.update(insertSql, siteId, preChatEnabled, preChatFieldsJson, themeColor, welcomeText, cookieDomain, cookieSameSite, preChatMessage, preChatNameLabel, preChatEmailLabel, preChatNameRequired, preChatEmailRequired);
    }
}
