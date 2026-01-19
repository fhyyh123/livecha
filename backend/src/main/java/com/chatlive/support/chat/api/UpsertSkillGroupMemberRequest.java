package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;

public record UpsertSkillGroupMemberRequest(
        @NotBlank(message = "agent_user_id_required") String agent_user_id,
        Integer weight
) {
}
