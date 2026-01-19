package com.chatlive.support.publicchat.api;

import jakarta.validation.constraints.NotBlank;

public record PublicSendTextMessageRequest(
        @NotBlank(message = "text_required") String text,
        String client_msg_id
) {
}
