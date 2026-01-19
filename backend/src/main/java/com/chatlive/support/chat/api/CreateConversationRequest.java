package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;

public record CreateConversationRequest(
        String skill_group_id,
        String subject,
        @NotBlank(message = "channel_required") String channel
) {
}
