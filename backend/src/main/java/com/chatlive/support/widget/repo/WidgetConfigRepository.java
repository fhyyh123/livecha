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
            Boolean showWelcomeScreen,
            String cookieDomain,
            String cookieSameSite,
            String widgetLanguage,
            String widgetPhrasesJson,
            String preChatMessage,
            String preChatNameLabel,
            String preChatEmailLabel,
            boolean preChatNameRequired,
            boolean preChatEmailRequired,
            String launcherStyle,
            String themeMode,
            String colorSettingsMode,
            String colorOverridesJson,
            String position,
            Integer zIndex,
            String launcherText,
            Integer width,
            Integer height,
            Boolean autoHeight,
            String autoHeightMode,
            Integer minHeight,
            Double maxHeightRatio,
            Integer mobileBreakpoint,
            Boolean mobileFullscreen,
            Integer offsetX,
            Integer offsetY,
            Boolean debug,
            Boolean showLogo,
            String logoBucket,
            String logoObjectKey,
            String logoContentType,
            Boolean showAgentPhoto
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public WidgetConfigRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<WidgetConfigRow> findBySiteId(String siteId) {
        var sql = "select site_id, pre_chat_enabled, pre_chat_fields_json, theme_color, welcome_text, show_welcome_screen, cookie_domain, cookie_samesite, widget_language, widget_phrases_json, pre_chat_message, pre_chat_name_label, pre_chat_email_label, pre_chat_name_required, pre_chat_email_required, launcher_style, theme_mode, color_settings_mode, color_overrides_json, position, z_index, launcher_text, width, height, auto_height, auto_height_mode, min_height, max_height_ratio, mobile_breakpoint, mobile_fullscreen, offset_x, offset_y, debug, show_logo, logo_bucket, logo_object_key, logo_content_type, show_agent_photo from widget_config where site_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new WidgetConfigRow(
                rs.getString("site_id"),
            rs.getBoolean("pre_chat_enabled"),
            rs.getString("pre_chat_fields_json"),
                rs.getString("theme_color"),
                rs.getString("welcome_text"),
                rs.getObject("show_welcome_screen", Boolean.class),
                rs.getString("cookie_domain"),
            rs.getString("cookie_samesite"),
            rs.getString("widget_language"),
            rs.getString("widget_phrases_json"),
            rs.getString("pre_chat_message"),
            rs.getString("pre_chat_name_label"),
            rs.getString("pre_chat_email_label"),
            rs.getBoolean("pre_chat_name_required"),
            rs.getBoolean("pre_chat_email_required"),
            rs.getString("launcher_style"),
            rs.getString("theme_mode"),
            rs.getString("color_settings_mode"),
            rs.getString("color_overrides_json"),
            rs.getString("position"),
            rs.getObject("z_index", Integer.class),
            rs.getString("launcher_text"),
            rs.getObject("width", Integer.class),
            rs.getObject("height", Integer.class),
            rs.getObject("auto_height", Boolean.class),
            rs.getString("auto_height_mode"),
            rs.getObject("min_height", Integer.class),
            rs.getObject("max_height_ratio", Double.class),
            rs.getObject("mobile_breakpoint", Integer.class),
            rs.getObject("mobile_fullscreen", Boolean.class),
            rs.getObject("offset_x", Integer.class),
            rs.getObject("offset_y", Integer.class),
            rs.getObject("debug", Boolean.class),
            rs.getObject("show_logo", Boolean.class),
            rs.getString("logo_bucket"),
            rs.getString("logo_object_key"),
            rs.getString("logo_content_type"),
            rs.getObject("show_agent_photo", Boolean.class)
        ), siteId);
        return list.stream().findFirst();
    }

    public void upsert(
            String siteId,
            boolean preChatEnabled,
            String preChatFieldsJson,
            String themeColor,
            String welcomeText,
            boolean showWelcomeScreen,
            String cookieDomain,
            String cookieSameSite,
            String widgetLanguage,
            String widgetPhrasesJson,
            String preChatMessage,
            String preChatNameLabel,
            String preChatEmailLabel,
            boolean preChatNameRequired,
            boolean preChatEmailRequired,
            String launcherStyle,
            String themeMode,
            String colorSettingsMode,
            String colorOverridesJson,
            String position,
            Integer zIndex,
            String launcherText,
            Integer width,
            Integer height,
            Boolean autoHeight,
            String autoHeightMode,
            Integer minHeight,
            Double maxHeightRatio,
            Integer mobileBreakpoint,
            Boolean mobileFullscreen,
            Integer offsetX,
            Integer offsetY,
            Boolean debug,
            boolean showLogo,
            Boolean showAgentPhoto
    ) {
        var updateSql = "update widget_config set pre_chat_enabled = ?, pre_chat_fields_json = ?, theme_color = ?, welcome_text = ?, show_welcome_screen = ?, cookie_domain = ?, cookie_samesite = ?, widget_language = ?, widget_phrases_json = ?, pre_chat_message = ?, pre_chat_name_label = ?, pre_chat_email_label = ?, pre_chat_name_required = ?, pre_chat_email_required = ?, launcher_style = ?, theme_mode = ?, color_settings_mode = ?, color_overrides_json = ?, position = ?, z_index = ?, launcher_text = ?, width = ?, height = ?, auto_height = ?, auto_height_mode = ?, min_height = ?, max_height_ratio = ?, mobile_breakpoint = ?, mobile_fullscreen = ?, offset_x = ?, offset_y = ?, debug = ?, show_logo = ?, show_agent_photo = ?, updated_at = current_timestamp where site_id = ?";
        var updated = jdbcTemplate.update(updateSql,
            preChatEnabled,
            preChatFieldsJson,
            themeColor,
            welcomeText,
            showWelcomeScreen,
            cookieDomain,
            cookieSameSite,
            widgetLanguage,
            widgetPhrasesJson,
            preChatMessage,
            preChatNameLabel,
            preChatEmailLabel,
            preChatNameRequired,
            preChatEmailRequired,
            launcherStyle,
            themeMode,
            colorSettingsMode,
            colorOverridesJson,
            position,
            zIndex,
            launcherText,
            width,
            height,
            autoHeight,
            autoHeightMode,
            minHeight,
            maxHeightRatio,
            mobileBreakpoint,
            mobileFullscreen,
            offsetX,
            offsetY,
            debug,
            showLogo,
            showAgentPhoto,
            siteId);
        if (updated > 0) return;

        var insertSql = "insert into widget_config(site_id, pre_chat_enabled, pre_chat_fields_json, theme_color, welcome_text, show_welcome_screen, cookie_domain, cookie_samesite, widget_language, widget_phrases_json, pre_chat_message, pre_chat_name_label, pre_chat_email_label, pre_chat_name_required, pre_chat_email_required, launcher_style, theme_mode, color_settings_mode, color_overrides_json, position, z_index, launcher_text, width, height, auto_height, auto_height_mode, min_height, max_height_ratio, mobile_breakpoint, mobile_fullscreen, offset_x, offset_y, debug, show_logo, show_agent_photo, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?, current_timestamp, current_timestamp)";
        jdbcTemplate.update(insertSql,
            siteId,
            preChatEnabled,
            preChatFieldsJson,
            themeColor,
            welcomeText,
            showWelcomeScreen,
            cookieDomain,
            cookieSameSite,
            widgetLanguage,
            widgetPhrasesJson,
            preChatMessage,
            preChatNameLabel,
            preChatEmailLabel,
            preChatNameRequired,
            preChatEmailRequired,
            launcherStyle,
            themeMode,
            colorSettingsMode,
            colorOverridesJson,
            position,
            zIndex,
            launcherText,
            width,
            height,
            autoHeight,
            autoHeightMode,
            minHeight,
            maxHeightRatio,
            mobileBreakpoint,
            mobileFullscreen,
            offsetX,
            offsetY,
            debug,
            showLogo,
            showAgentPhoto);
    }

    public void upsertLogo(String siteId, boolean showLogo, String bucket, String objectKey, String contentType) {
        var updateSql = "update widget_config set show_logo = ?, logo_bucket = ?, logo_object_key = ?, logo_content_type = ?, logo_updated_at = current_timestamp, updated_at = current_timestamp where site_id = ?";
        var updated = jdbcTemplate.update(updateSql,
                showLogo,
                bucket,
                objectKey,
                contentType,
                siteId);
        if (updated > 0) return;

        var insertSql = "insert into widget_config(site_id, show_logo, logo_bucket, logo_object_key, logo_content_type, logo_updated_at, created_at, updated_at) values (?,?,?,?,?, current_timestamp, current_timestamp, current_timestamp)";
        jdbcTemplate.update(insertSql,
                siteId,
                showLogo,
                bucket,
                objectKey,
                contentType);
    }
}

