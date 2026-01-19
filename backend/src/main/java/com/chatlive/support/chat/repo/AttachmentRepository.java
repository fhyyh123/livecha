package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

@Repository
public class AttachmentRepository {

    public record AttachmentRow(
            String id,
            String tenantId,
            String conversationId,
            String uploaderUserId,
            String bucket,
            String objectKey,
            String filename,
            String contentType,
            long sizeBytes,
            String status,
            String linkedMsgId,
            Instant createdAt
    ) {
    }

    private final JdbcTemplate jdbcTemplate;

    public AttachmentRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insertPending(
            String id,
            String tenantId,
            String conversationId,
            String uploaderUserId,
            String bucket,
            String objectKey,
            String filename,
            String contentType,
            long sizeBytes
    ) {
        var sql = """
                insert into attachment(
                    id, tenant_id, conversation_id, uploader_user_id,
                    bucket, object_key, filename, content_type, size_bytes,
                    status, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
                """;
        jdbcTemplate.update(sql,
                id,
                tenantId,
                conversationId,
                uploaderUserId,
                bucket,
                objectKey,
                filename,
                contentType,
                sizeBytes,
                Timestamp.from(Instant.now())
        );
    }

    public Optional<AttachmentRow> findById(String tenantId, String id) {
        var sql = """
                select id, tenant_id, conversation_id, uploader_user_id,
                       bucket, object_key, filename, content_type, size_bytes,
                       status, linked_msg_id, created_at
                from attachment
                where tenant_id = ? and id = ?
                limit 1
                """;

        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new AttachmentRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("conversation_id"),
                rs.getString("uploader_user_id"),
                rs.getString("bucket"),
                rs.getString("object_key"),
                rs.getString("filename"),
                rs.getString("content_type"),
                rs.getLong("size_bytes"),
                rs.getString("status"),
                rs.getString("linked_msg_id"),
                rs.getTimestamp("created_at").toInstant()
        ), tenantId, id);
        return list.stream().findFirst();
    }

    public int markLinked(String tenantId, String attachmentId, String msgId) {
        var sql = """
                update attachment
                set status = 'linked', linked_msg_id = ?
                where tenant_id = ? and id = ?
                """;
        return jdbcTemplate.update(sql, msgId, tenantId, attachmentId);
    }
}
