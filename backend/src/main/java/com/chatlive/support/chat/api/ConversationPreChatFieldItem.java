package com.chatlive.support.chat.api;

public record ConversationPreChatFieldItem(
        String field_key,
        String field_label,
        String field_type,
        String value_json
) {
}
