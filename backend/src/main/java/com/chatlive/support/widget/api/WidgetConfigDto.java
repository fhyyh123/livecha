package com.chatlive.support.widget.api;

public record WidgetConfigDto(
        boolean pre_chat_enabled,
        String pre_chat_fields_json,
        String theme_color,
        String welcome_text,
        String cookie_domain,
        String cookie_samesite,
        String pre_chat_message,
        String pre_chat_name_label,
        String pre_chat_email_label,
        boolean pre_chat_name_required,
        boolean pre_chat_email_required
) {
}
