package com.chatlive.support.chat.api;

public record AgentSessionResponse(
        String session_id,
        long heartbeat_interval_seconds,
        long heartbeat_ttl_seconds
) {
}
