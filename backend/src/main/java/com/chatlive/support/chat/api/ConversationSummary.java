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
        long last_message_created_at
) {
}
