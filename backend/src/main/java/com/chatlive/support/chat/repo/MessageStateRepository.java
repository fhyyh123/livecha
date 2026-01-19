package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;

@Repository
public class MessageStateRepository {

    private final JdbcTemplate jdbcTemplate;

    public MessageStateRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long upsertLastReadAndGetUpdatedAtSeconds(String conversationId, String userId, String lastReadMsgId) {
        var sql = """
                insert into message_state(conversation_id, user_id, last_read_msg_id, updated_at)
                values (?, ?, ?, now())
                on conflict (conversation_id, user_id)
                do update set last_read_msg_id = excluded.last_read_msg_id, updated_at = now()
                returning updated_at
                """;
        Timestamp ts = jdbcTemplate.queryForObject(sql, Timestamp.class, conversationId, userId, lastReadMsgId);
        if (ts == null) return System.currentTimeMillis() / 1000;
        return ts.toInstant().getEpochSecond();
    }
}
