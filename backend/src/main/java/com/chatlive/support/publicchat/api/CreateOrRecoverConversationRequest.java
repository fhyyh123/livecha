package com.chatlive.support.publicchat.api;

public record CreateOrRecoverConversationRequest(
        String channel,
        String skill_group_id,
        String subject,
        String name,
        String email
) {
}
