package com.chatlive.support.chat.api;

public record AgentHeartbeatResponse(
        String status,
        String effective_status,
        long ttl_seconds,
        long server_time
) {
}
