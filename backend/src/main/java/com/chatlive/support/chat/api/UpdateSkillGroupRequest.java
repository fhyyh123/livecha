package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UpdateSkillGroupRequest(
        @NotBlank(message = "name_required") String name,
        @NotNull(message = "enabled_required") Boolean enabled
) {
}
