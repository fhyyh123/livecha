package com.chatlive.support.chat.api;

public record ConversationSummary(
        String id,
        String status,
        String channel,
        String subject,
        String assigned_agent_user_id,
        String site_id,
        String visitor_id,
        String visitor_name,
        String visitor_email,
        boolean starred,
        int unread_count,
        String last_message_sender_type,
        String last_message_content_type,
        String last_message_text,
        long last_message_created_at,
        long created_at,
        long last_msg_at,
        Long closed_at,
        Long last_customer_msg_at,
        Long last_idle_event_at,
        String last_archived_reason,
        Long last_archived_inactivity_minutes
) {
}
