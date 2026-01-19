package com.chatlive.support.chat.api;

import com.fasterxml.jackson.databind.JsonNode;

public record MessageItem(
        String id,
        String sender_type,
        String sender_id,
        String content_type,
        JsonNode content,
        long created_at
) {
}
