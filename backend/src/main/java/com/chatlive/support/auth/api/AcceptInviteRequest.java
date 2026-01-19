package com.chatlive.support.auth.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AcceptInviteRequest(
        @NotBlank(message = "token_required") String token,
        @NotBlank(message = "password_required") @Size(min = 12, max = 72, message = "invalid_password") String password
) {
}
