package com.chatlive.support.chat.api;

public record AgentListItem(
        String user_id,
        String role,
        String username,
        String email,
        String status,
        Integer max_concurrent
) {
}
