package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class AgentSessionRepository {

    public record AgentSessionRow(String sessionId, String tenantId, String userId, Instant lastSeenAt, Instant expiresAt) {
    }

    private final JdbcTemplate jdbcTemplate;

    public AgentSessionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void createSession(String sessionId, String tenantId, String userId, Instant expiresAt) {
        var sql = """
            insert into agent_session(session_id, tenant_id, user_id, created_at, last_seen_at, expires_at)
            values (?, ?, ?, now(), now(), ?)
            """;
        jdbcTemplate.update(sql, sessionId, tenantId, userId, java.sql.Timestamp.from(expiresAt));
    }

    public boolean touchSession(String sessionId, String userId, Instant expiresAt) {
        var sql = """
            update agent_session
            set last_seen_at = now(),
                expires_at = ?
            where session_id = ?
              and user_id = ?
            """;
        var updated = jdbcTemplate.update(sql, java.sql.Timestamp.from(expiresAt), sessionId, userId);
        return updated > 0;
    }

    public void deleteSession(String sessionId, String userId) {
        var sql = "delete from agent_session where session_id = ? and user_id = ?";
        jdbcTemplate.update(sql, sessionId, userId);
    }

    public Optional<AgentSessionRow> findBySessionId(String sessionId) {
        var sql = "select session_id, tenant_id, user_id, last_seen_at, expires_at from agent_session where session_id = ?";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new AgentSessionRow(
                rs.getString("session_id"),
                rs.getString("tenant_id"),
                rs.getString("user_id"),
                rs.getTimestamp("last_seen_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant()
        ), sessionId);
        return list.stream().findFirst();
    }

    public boolean hasActiveSession(String userId) {
        var sql = """
            select exists(
                select 1 from agent_session
                where user_id = ?
                  and expires_at > now()
            )
            """;
        Boolean exists = jdbcTemplate.queryForObject(sql, Boolean.class, userId);
        return Boolean.TRUE.equals(exists);
    }

    public List<AgentSessionRow> listExpiredSessions(String tenantId, int limit) {
        var sql = """
            select session_id, tenant_id, user_id, last_seen_at, expires_at
            from agent_session
            where tenant_id = ?
              and expires_at <= now()
            order by expires_at asc
            limit ?
            """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new AgentSessionRow(
                rs.getString("session_id"),
                rs.getString("tenant_id"),
                rs.getString("user_id"),
                rs.getTimestamp("last_seen_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant()
        ), tenantId, limit);
    }

    public void deleteSessions(List<String> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) return;
        var placeholders = String.join(",", sessionIds.stream().map((x) -> "?").toList());
        var sql = "delete from agent_session where session_id in (" + placeholders + ")";
        jdbcTemplate.update(sql, sessionIds.toArray());
    }
}
