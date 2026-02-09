package com.chatlive.support.chat.api;

public record FileSharingDto(
        boolean visitor_file_enabled,
        boolean agent_file_enabled
) {
}
