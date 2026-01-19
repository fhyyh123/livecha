package com.chatlive.support.publicchat.api;

import jakarta.validation.constraints.NotBlank;

public record PublicSendFileMessageRequest(
        String client_msg_id,
        @NotBlank(message = "attachment_id_required") String attachment_id
) {
}
