package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;

public record CreateSkillGroupRequest(
        @NotBlank(message = "name_required") String name,
        Boolean enabled
) {
}
