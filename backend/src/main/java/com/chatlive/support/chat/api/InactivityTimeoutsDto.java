package com.chatlive.support.chat.api;

public record InactivityTimeoutsDto(
        boolean visitor_idle_enabled,
        int visitor_idle_minutes,
        boolean inactivity_archive_enabled,
        int inactivity_archive_minutes
) {
}
