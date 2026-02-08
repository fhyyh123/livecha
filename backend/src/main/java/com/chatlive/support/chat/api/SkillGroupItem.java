package com.chatlive.support.chat.api;

public record SkillGroupItem(
        String id,
        String name,
        boolean enabled,
        String group_type,
        boolean is_fallback,
        String system_key
) {
}
