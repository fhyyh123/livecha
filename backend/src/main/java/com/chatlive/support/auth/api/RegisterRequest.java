package com.chatlive.support.auth.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "tenant_name_required") String tenant_name,
        @NotBlank(message = "email_required") @Email(message = "invalid_email") String email,
        @NotBlank(message = "phone_required")
        @Pattern(regexp = "^\\+[1-9]\\d{7,14}$", message = "invalid_phone")
        String phone,
        @NotBlank(message = "password_required") @Size(min = 12, max = 72, message = "invalid_password") String password
) {
}
