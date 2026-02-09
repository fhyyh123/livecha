package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record CreateSkillGroupRequest(
        @NotBlank(message = "name_required") String name,
        Boolean enabled,
        @NotEmpty(message = "members_required") List<@NotBlank(message = "member_required") String> member_user_ids
) {
}
