package com.chatlive.support.user.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class UserAccountRepository {

    public record UserAccountRow(String id, String tenantId, String type, String username, String passwordHash, String email, boolean emailVerified) {
    }

    public record UserPublicRow(String id, String tenantId, String type, String username, String phone, String email) {
    }

    public record UserMeRow(String id, String tenantId, String type, String username, String email, boolean emailVerified) {
    }

    public record AgentDirectoryRow(String id, String type, String username, String email, String agentStatus, Integer maxConcurrent) {
    }

    private final JdbcTemplate jdbcTemplate;

    public UserAccountRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<UserAccountRow> findByUsername(String username) {
        var sql = "select id, tenant_id, type, username, password_hash, email, email_verified from user_account where username = ? and status = 'active'";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new UserAccountRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("type"),
                rs.getString("username"),
            rs.getString("password_hash"),
            rs.getString("email"),
            rs.getBoolean("email_verified")
        ), username);
        return list.stream().findFirst();
    }

    public Optional<UserAccountRow> findById(String userId) {
        var sql = "select id, tenant_id, type, username, password_hash, email, email_verified from user_account where id = ? and status = 'active'";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new UserAccountRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("type"),
                rs.getString("username"),
                rs.getString("password_hash"),
                rs.getString("email"),
                rs.getBoolean("email_verified")
        ), userId);
        return list.stream().findFirst();
    }

    public Optional<UserMeRow> findMeById(String userId) {
        var sql = "select id, tenant_id, type, username, email, email_verified from user_account where id = ? and status = 'active'";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new UserMeRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("type"),
                rs.getString("username"),
                rs.getString("email"),
                rs.getBoolean("email_verified")
        ), userId);
        return list.stream().findFirst();
    }

    public boolean existsUsername(String username) {
        var sql = "select 1 from user_account where username = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> 1, username);
        return !list.isEmpty();
    }

    public String createUser(
            String tenantId,
            String type,
            String username,
            String phone,
            String email,
            String passwordHash,
            boolean emailVerified
    ) {
        var id = "u_" + UUID.randomUUID();
        var sql = """
                insert into user_account(id, tenant_id, type, username, phone, email, password_hash, email_verified, status, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, 'active', current_timestamp)
                """;
        jdbcTemplate.update(sql, id, tenantId, type, username, phone, email, passwordHash, emailVerified);
        return id;
    }

    public void setEmailVerified(String userId, boolean verified) {
        var sql = "update user_account set email_verified = ? where id = ?";
        jdbcTemplate.update(sql, verified, userId);
    }

    public void ensureVisitorCustomerExists(String tenantId, String userId, String email, String passwordHash) {
        if (findById(userId).isPresent()) {
            return;
        }

        // Use userId as username to satisfy unique(tenant_id, username)
        var sql = """
            insert into user_account(id, tenant_id, type, username, phone, email, password_hash, email_verified, status, created_at)
            values (?, ?, 'customer', ?, null, ?, ?, false, 'active', current_timestamp)
                """;
        jdbcTemplate.update(sql, userId, tenantId, userId, email, passwordHash);
    }

    public Optional<UserPublicRow> findPublicById(String userId) {
        var sql = "select id, tenant_id, type, username, phone, email from user_account where id = ? and status = 'active'";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new UserPublicRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("type"),
                rs.getString("username"),
                rs.getString("phone"),
                rs.getString("email")
        ), userId);
        return list.stream().findFirst();
    }

        public List<AgentDirectoryRow> listAgentsByTenant(String tenantId) {
                    var sql = """
                        select u.id, u.type, u.username, u.email,
                               case
                                   when coalesce(s.active_sessions, 0) > 0 then coalesce(p.status, 'offline')
                                   else 'offline'
                               end as agent_status,
                               p.max_concurrent
                        from user_account u
                        left join agent_profile p on p.user_id = u.id
                        left join (
                            select user_id, count(*) as active_sessions
                            from agent_session
                            where expires_at > now()
                            group by user_id
                        ) s on s.user_id = u.id
                        where u.tenant_id = ?
                          and u.status = 'active'
                          and u.type in ('agent','admin')
                        order by u.username asc
                        """;
                return jdbcTemplate.query(sql, (rs, rowNum) -> new AgentDirectoryRow(
                                rs.getString("id"),
                    rs.getString("type"),
                                rs.getString("username"),
                                rs.getString("email"),
                                rs.getString("agent_status"),
                                rs.getObject("max_concurrent") == null ? null : rs.getInt("max_concurrent")
                ), tenantId);
        }
}
