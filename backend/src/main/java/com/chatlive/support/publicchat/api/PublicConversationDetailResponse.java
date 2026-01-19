package com.chatlive.support.publicchat.api;

public record PublicConversationDetailResponse(
        String id,
        String status,
        String channel,
        String subject,
        String assigned_agent_user_id,
        long created_at,
        long last_msg_at
) {
}
