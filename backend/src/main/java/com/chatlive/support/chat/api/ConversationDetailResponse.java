package com.chatlive.support.chat.api;

public record ConversationDetailResponse(
        String id,
        String status,
        String channel,
        String subject,
        String customer_user_id,
        String assigned_agent_user_id,
        String site_id,
        String visitor_id,
        long created_at,
        long last_msg_at,
        Long closed_at,
        UserPublicProfile customer,
        VisitorPublicProfile visitor,
        boolean starred
) {
}
