package com.chatlive.support.widget.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class WidgetWelcomeGroupConfigRepository {

    public record Row(
            String siteId,
            String skillGroupId,
            String welcomeText,
            Boolean showWelcomeScreen
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public WidgetWelcomeGroupConfigRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Row> find(String siteId, String skillGroupId) {
        if (siteId == null || siteId.isBlank()) return Optional.empty();
        if (skillGroupId == null || skillGroupId.isBlank()) return Optional.empty();

        var sql = """
                select site_id, skill_group_id, welcome_text, show_welcome_screen
                from widget_welcome_group_config
                where site_id = ? and skill_group_id = ?
                limit 1
                """;

        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new Row(
                rs.getString("site_id"),
                rs.getString("skill_group_id"),
                rs.getString("welcome_text"),
                rs.getObject("show_welcome_screen", Boolean.class)
        ), siteId, skillGroupId);

        return list.stream().findFirst();
    }

    public void upsert(String siteId, String skillGroupId, String welcomeText, boolean showWelcomeScreen) {
        if (siteId == null || siteId.isBlank()) throw new IllegalArgumentException("site_id_required");
        if (skillGroupId == null || skillGroupId.isBlank()) throw new IllegalArgumentException("skill_group_id_required");

        var pg = """
                insert into widget_welcome_group_config(site_id, skill_group_id, welcome_text, show_welcome_screen, created_at, updated_at)
                values (?, ?, ?, ?, now(), now())
                on conflict (site_id, skill_group_id)
                do update set welcome_text = excluded.welcome_text,
                              show_welcome_screen = excluded.show_welcome_screen,
                              updated_at = now()
                """;

        var h2 = """
                merge into widget_welcome_group_config key(site_id, skill_group_id)
                values (?, ?, ?, ?, current_timestamp, current_timestamp)
                """;

        try {
            jdbcTemplate.update(pg, siteId, skillGroupId, welcomeText, showWelcomeScreen);
        } catch (Exception ignored) {
            jdbcTemplate.update(h2, siteId, skillGroupId, welcomeText, showWelcomeScreen);
        }
    }
}
