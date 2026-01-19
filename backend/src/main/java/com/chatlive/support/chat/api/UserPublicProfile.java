package com.chatlive.support.chat.api;

public record UserPublicProfile(
        String id,
        String username,
        String phone,
        String email
) {
}
