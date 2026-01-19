package com.chatlive.support.auth.api;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "username_required") String username,
        @NotBlank(message = "password_required") String password,
        String client
) {
}
