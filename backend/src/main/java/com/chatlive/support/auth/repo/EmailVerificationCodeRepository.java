package com.chatlive.support.auth.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

@Repository
public class EmailVerificationCodeRepository {

    public record CodeRow(
            String id,
            String userId,
            String codeHash,
            Instant expiresAt,
            Instant usedAt,
            Instant createdAt
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public EmailVerificationCodeRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(String id, String userId, String codeHash, Instant expiresAt) {
        var sql = """
                insert into email_verification_code(id, user_id, code_hash, expires_at, used_at, created_at)
                values (?, ?, ?, ?, null, current_timestamp)
                """;
        jdbcTemplate.update(sql, id, userId, codeHash, Timestamp.from(expiresAt));
    }

    public Optional<CodeRow> findLatestActiveByUserId(String userId) {
        var sql = """
                select id, user_id, code_hash, expires_at, used_at, created_at
                from email_verification_code
                where user_id = ?
                  and used_at is null
              and expires_at > current_timestamp
                order by created_at desc
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new CodeRow(
                rs.getString("id"),
                rs.getString("user_id"),
                rs.getString("code_hash"),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("used_at") == null ? null : rs.getTimestamp("used_at").toInstant(),
                rs.getTimestamp("created_at").toInstant()
        ), userId);
        return list.stream().findFirst();
    }

    public void markUsed(String id, Instant usedAt) {
        var sql = "update email_verification_code set used_at = ? where id = ?";
        jdbcTemplate.update(sql, Timestamp.from(usedAt), id);
    }
}
