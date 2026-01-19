package com.chatlive.support.admin.api;

public record InviteAgentResponse(
        String invite_id,
        String email,
        String role,
        String dev_accept_url
) {
}
