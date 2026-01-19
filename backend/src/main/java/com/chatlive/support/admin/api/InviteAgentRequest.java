package com.chatlive.support.admin.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record InviteAgentRequest(
        @NotBlank(message = "email_required") @Email(message = "invalid_email") String email,
        String role
) {
}
