package com.chatlive.support.auth.api;

public record AcceptInviteResponse(
        String access_token,
        long expires_in,
        String tenant_id,
        String user_id,
        String username
) {
}
