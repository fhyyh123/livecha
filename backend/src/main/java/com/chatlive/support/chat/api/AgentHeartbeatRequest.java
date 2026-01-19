package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;

public record AgentHeartbeatRequest(
        @NotBlank(message = "session_id_required") String session_id
) {
}
