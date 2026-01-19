package com.chatlive.support.auth.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

@Repository
public class AgentInviteRepository {

    public record InviteRow(
            String id,
            String tenantId,
            String email,
            String role,
            String inviterUserId,
            String tokenHash,
            Instant expiresAt,
            Instant acceptedAt,
            String acceptedUserId
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public AgentInviteRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(
            String id,
            String tenantId,
            String email,
            String role,
            String inviterUserId,
            String tokenHash,
            Instant expiresAt
    ) {
        var sql = """
                insert into agent_invite(id, tenant_id, email, role, inviter_user_id, token_hash, expires_at, accepted_at, accepted_user_id, created_at)
                values (?, ?, ?, ?, ?, ?, ?, null, null, current_timestamp)
                """;
        jdbcTemplate.update(sql, id, tenantId, email, role, inviterUserId, tokenHash, Timestamp.from(expiresAt));
    }

    public Optional<InviteRow> findByTokenHash(String tokenHash) {
        var sql = """
                select id, tenant_id, email, role, inviter_user_id, token_hash, expires_at, accepted_at, accepted_user_id
                from agent_invite
                where token_hash = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new InviteRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("email"),
                rs.getString("role"),
                rs.getString("inviter_user_id"),
                rs.getString("token_hash"),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("accepted_at") == null ? null : rs.getTimestamp("accepted_at").toInstant(),
                rs.getString("accepted_user_id")
        ), tokenHash);
        return list.stream().findFirst();
    }

    public void markAccepted(String id, Instant acceptedAt, String acceptedUserId) {
        var sql = "update agent_invite set accepted_at = ?, accepted_user_id = ? where id = ?";
        jdbcTemplate.update(sql, Timestamp.from(acceptedAt), acceptedUserId, id);
    }
}
