package com.chatlive.support.widget.api;

public record WidgetConfigDto(
        boolean anonymous_enabled,
        String theme_color,
        String welcome_text,
        String cookie_domain,
        String cookie_samesite
) {
}
