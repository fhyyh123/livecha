package com.chatlive.support.chat.api;

public record InactivityTimeoutsDto(
        boolean agent_no_reply_transfer_enabled,
        int agent_no_reply_transfer_minutes,
        boolean visitor_idle_enabled,
        int visitor_idle_minutes,
        boolean inactivity_archive_enabled,
        int inactivity_archive_minutes
) {
}
