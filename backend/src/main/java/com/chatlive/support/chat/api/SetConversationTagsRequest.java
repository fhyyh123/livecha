package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SetConversationTagsRequest(
        @NotNull(message = "tags_required")
        @Size(max = 20, message = "too_many_tags")
        List<@Size(max = 32, message = "tag_too_long") String> tags
) {
}
