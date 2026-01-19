package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;

public record AgentStatusRequest(
        @NotBlank(message = "status_required") String status,
        Integer max_concurrent
) {
}
