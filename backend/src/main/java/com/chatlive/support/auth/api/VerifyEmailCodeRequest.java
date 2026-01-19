package com.chatlive.support.auth.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record VerifyEmailCodeRequest(
        @NotBlank(message = "code_required")
        @Pattern(regexp = "^\\d{6}$", message = "invalid_code")
        String code
) {
}
