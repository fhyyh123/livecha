package com.chatlive.support.widget.api;

public record WidgetWelcomeGroupConfigDto(
        String skill_group_id,
        String welcome_text,
        Boolean show_welcome_screen
) {
}
