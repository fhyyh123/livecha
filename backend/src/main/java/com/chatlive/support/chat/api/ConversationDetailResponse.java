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
        String skill_group_id,
        String skill_group_name,
        long created_at,
        long last_msg_at,
        Long closed_at,
        Long active_duration_seconds,
        UserPublicProfile customer,
        VisitorPublicProfile visitor,
        java.util.List<ConversationPreChatFieldItem> pre_chat_fields,
        boolean starred
) {
}
