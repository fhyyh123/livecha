package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Repository
public class AgentProfileRepository {

    public record AgentProfileRow(String userId, String status, int maxConcurrent) {
    }

        public record AgentProfileDetailsRow(
            String userId,
            String displayName,
            String jobTitle,
            String avatarBucket,
            String avatarObjectKey,
            String avatarContentType,
            java.time.Instant avatarUpdatedAt
        ) {
    }

    public record AgentCandidateRow(String userId, int maxConcurrent) {
    }

    private final JdbcTemplate jdbcTemplate;

    public AgentProfileRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<AgentProfileRow> findByUserId(String userId) {
        var sql = "select user_id, status, max_concurrent from agent_profile where user_id = ?";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new AgentProfileRow(
                rs.getString("user_id"),
                rs.getString("status"),
                rs.getInt("max_concurrent")
        ), userId);
        return list.stream().findFirst();
    }

    public void upsertStatus(String userId, String status, Integer maxConcurrent) {
        var pgUpsert = """
            insert into agent_profile(user_id, status, max_concurrent, created_at)
            values (?, ?, coalesce(?, 3), now())
                on conflict (user_id)
                do update set status = excluded.status,
                              max_concurrent = coalesce(excluded.max_concurrent, agent_profile.max_concurrent)
                """;

        var h2Merge = """
            merge into agent_profile (user_id, status, max_concurrent, display_name, job_title, created_at)
            key(user_id)
            values (?, ?, coalesce(?, 3), null, null, current_timestamp)
            """;

        try {
            jdbcTemplate.update(pgUpsert, userId, status, maxConcurrent);
        } catch (Exception ignored) {
            // H2 (dev) fallback
            jdbcTemplate.update(h2Merge, userId, status, maxConcurrent);
        }
    }

    public java.util.Optional<String> findDisplayNameByUserId(String userId) {
        var sql = "select display_name from agent_profile where user_id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("display_name"), userId);
        // jdbcTemplate RowMapper may return null if display_name is NULL; Stream#findFirst
        // wraps the element with Optional.of(...) and would throw NPE for null values.
        return list.stream().filter(Objects::nonNull).findFirst();
    }

    public void upsertDisplayName(String userId, String displayName) {
        var name = displayName == null ? null : displayName.trim();
        if (name != null && name.isBlank()) name = null;

        var pg = """
            insert into agent_profile(user_id, status, max_concurrent, display_name, created_at)
            values (?, 'offline', 3, ?, now())
                on conflict (user_id)
                do update set display_name = excluded.display_name
                """;

        var h2 = """
            merge into agent_profile (user_id, status, max_concurrent, display_name, job_title, created_at)
            key(user_id)
            values (?, 'offline', 3, ?, null, current_timestamp)
                """;

        try {
            jdbcTemplate.update(pg, userId, name);
        } catch (Exception ignored) {
            jdbcTemplate.update(h2, userId, name);
        }
    }

    public Optional<AgentProfileDetailsRow> findDetailsByUserId(String userId) {
        var sql = """
                select user_id, display_name, job_title,
                       avatar_bucket, avatar_object_key, avatar_content_type, avatar_updated_at
                from agent_profile
                where user_id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new AgentProfileDetailsRow(
                rs.getString("user_id"),
                rs.getString("display_name"),
                rs.getString("job_title"),
                rs.getString("avatar_bucket"),
                rs.getString("avatar_object_key"),
                rs.getString("avatar_content_type"),
                rs.getTimestamp("avatar_updated_at") == null ? null : rs.getTimestamp("avatar_updated_at").toInstant()
        ), userId);
        return list.stream().findFirst();
    }

    public void upsertAvatar(String userId, String bucket, String objectKey, String contentType) {
        var b = bucket == null ? null : bucket.trim();
        if (b != null && b.isBlank()) b = null;
        var k = objectKey == null ? null : objectKey.trim();
        if (k != null && k.isBlank()) k = null;
        var ct = contentType == null ? null : contentType.trim();
        if (ct != null && ct.isBlank()) ct = null;

        var pg = """
                insert into agent_profile(user_id, status, max_concurrent, avatar_bucket, avatar_object_key, avatar_content_type, avatar_updated_at, created_at)
                values (?, 'offline', 3, ?, ?, ?, now(), now())
                on conflict (user_id)
                do update set avatar_bucket = excluded.avatar_bucket,
                              avatar_object_key = excluded.avatar_object_key,
                              avatar_content_type = excluded.avatar_content_type,
                              avatar_updated_at = excluded.avatar_updated_at
                """;

        var h2 = """
                merge into agent_profile (user_id, status, max_concurrent, display_name, job_title, avatar_bucket, avatar_object_key, avatar_content_type, avatar_updated_at, created_at)
                key(user_id)
                values (?, 'offline', 3, null, null, ?, ?, ?, current_timestamp, current_timestamp)
                """;

        try {
            jdbcTemplate.update(pg, userId, b, k, ct);
        } catch (Exception ignored) {
            jdbcTemplate.update(h2, userId, b, k, ct);
        }
    }

    public void upsertDetails(String userId, String displayName, String jobTitle) {
        var name = displayName == null ? null : displayName.trim();
        if (name != null && name.isBlank()) name = null;

        var title = jobTitle == null ? null : jobTitle.trim();
        if (title != null && title.isBlank()) title = null;

        var pg = """
                insert into agent_profile(user_id, status, max_concurrent, display_name, job_title, created_at)
                values (?, 'offline', 3, ?, ?, now())
                on conflict (user_id)
                do update set display_name = excluded.display_name,
                              job_title = excluded.job_title
                """;

        var h2 = """
                merge into agent_profile (user_id, status, max_concurrent, display_name, job_title, created_at)
                key(user_id)
                values (?, 'offline', 3, ?, ?, current_timestamp)
                """;

        try {
            jdbcTemplate.update(pg, userId, name, title);
        } catch (Exception ignored) {
            jdbcTemplate.update(h2, userId, name, title);
        }
    }

    public List<AgentCandidateRow> listOnlineCandidatesForGroup(String tenantId, String skillGroupId) {
        var sql = """
                select m.agent_user_id as user_id, p.max_concurrent
                from skill_group_member m
                join user_account u on u.id = m.agent_user_id
                join agent_profile p on p.user_id = m.agent_user_id
                                join agent_session s on s.user_id = m.agent_user_id and s.expires_at > now()
                where u.tenant_id = ?
                  and m.group_id = ?
                  and u.status = 'active'
                  and p.status = 'online'
                order by m.weight desc, m.agent_user_id asc
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new AgentCandidateRow(
                rs.getString("user_id"),
                rs.getInt("max_concurrent")
        ), tenantId, skillGroupId);
    }

    public List<AgentCandidateRow> listOnlineCandidatesForTenant(String tenantId) {
        var sql = """
                select u.id as user_id, p.max_concurrent
                from user_account u
                join agent_profile p on p.user_id = u.id
                                join agent_session s on s.user_id = u.id and s.expires_at > now()
                where u.tenant_id = ?
                  and u.status = 'active'
                  and u.type in ('agent','admin')
                  and p.status = 'online'
                order by u.id asc
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new AgentCandidateRow(
                rs.getString("user_id"),
                rs.getInt("max_concurrent")
        ), tenantId);
    }
}
