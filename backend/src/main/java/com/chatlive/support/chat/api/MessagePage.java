package com.chatlive.support.chat.api;

import java.util.List;

public record MessagePage(
        List<MessageItem> messages,
        boolean has_more,
        String next_after_msg_id,
        boolean reset
) {
}
