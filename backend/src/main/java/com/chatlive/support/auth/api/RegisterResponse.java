package com.chatlive.support.auth.api;

public record RegisterResponse(
        String access_token,
        long expires_in,
        String tenant_id,
        String user_id,
        boolean email_verified,
        String dev_verify_url
) {
}
