package com.chatlive.support.auth.api;

public record MeResponse(
        String user_id,
        String role,
        String tenant_id,
        String username,
        String email,
        boolean email_verified
) {
}
