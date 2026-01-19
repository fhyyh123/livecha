package com.chatlive.support.auth.api;

public record LoginResponse(
        String access_token,
        String refresh_token,
        long expires_in,
        String agent_session_id,
        long heartbeat_interval_seconds,
        long heartbeat_ttl_seconds
) {
}
