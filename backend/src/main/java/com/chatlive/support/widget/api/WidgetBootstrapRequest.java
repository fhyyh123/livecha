package com.chatlive.support.widget.api;

import jakarta.validation.constraints.NotBlank;

public record WidgetBootstrapRequest(
        @NotBlank(message = "site_key_required") String site_key,
        @NotBlank(message = "origin_required") String origin,
        String visitor_id
) {
}
