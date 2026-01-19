package com.chatlive.support.chat.api;

public record QuickReplyItem(
        String id,
        String title,
        String content,
        long updated_at
) {
}
