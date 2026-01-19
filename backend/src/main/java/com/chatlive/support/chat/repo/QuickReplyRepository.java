package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class QuickReplyRepository {

    public record QuickReplyRow(
            String id,
            String tenantId,
            String title,
            String content,
            String createdBy,
            java.time.Instant createdAt,
            java.time.Instant updatedAt
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public QuickReplyRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<QuickReplyRow> listByTenant(String tenantId, int limit) {
        var sql = """
                select id, tenant_id, title, content, created_by, created_at, updated_at
                from quick_reply
                where tenant_id = ?
                order by updated_at desc
                limit ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new QuickReplyRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("title"),
                rs.getString("content"),
                rs.getString("created_by"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
        ), tenantId, Math.max(1, Math.min(limit, 200)));
    }

    public Optional<QuickReplyRow> findById(String tenantId, String id) {
        var sql = """
                select id, tenant_id, title, content, created_by, created_at, updated_at
                from quick_reply
                where tenant_id = ? and id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new QuickReplyRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("title"),
                rs.getString("content"),
                rs.getString("created_by"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()
        ), tenantId, id);
        return list.stream().findFirst();
    }

    public String create(String tenantId, String title, String content, String createdBy) {
        var id = "qr_" + UUID.randomUUID();
        var sql = """
                insert into quick_reply(id, tenant_id, title, content, created_by, created_at, updated_at)
                values (?, ?, ?, ?, ?, now(), now())
                """;
        jdbcTemplate.update(sql, id, tenantId, title, content, createdBy);
        return id;
    }

    public int update(String tenantId, String id, String title, String content) {
        var sql = """
                update quick_reply
                set title = ?, content = ?, updated_at = now()
                where tenant_id = ? and id = ?
                """;
        return jdbcTemplate.update(sql, title, content, tenantId, id);
    }

    public int delete(String tenantId, String id) {
        var sql = "delete from quick_reply where tenant_id = ? and id = ?";
        return jdbcTemplate.update(sql, tenantId, id);
    }
}
