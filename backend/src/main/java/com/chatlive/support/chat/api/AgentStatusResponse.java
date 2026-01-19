package com.chatlive.support.chat.api;

public record AgentStatusResponse(
        String user_id,
        String status,
        String effective_status,
        int max_concurrent,
        int assigned_active,
        int remaining_capacity,
        boolean can_accept
) {
}
