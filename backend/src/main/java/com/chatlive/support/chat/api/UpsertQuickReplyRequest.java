package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpsertQuickReplyRequest(
        @NotBlank(message = "title_required") @Size(max = 100, message = "title_too_long") String title,
        @NotBlank(message = "content_required") @Size(max = 2000, message = "content_too_long") String content
) {
}
