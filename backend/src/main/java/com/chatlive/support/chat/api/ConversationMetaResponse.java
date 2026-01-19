package com.chatlive.support.chat.api;

import java.util.List;

public record ConversationMetaResponse(
        List<String> tags,
        String note
) {
}
