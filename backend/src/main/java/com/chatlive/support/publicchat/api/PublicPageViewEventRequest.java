package com.chatlive.support.publicchat.api;

import jakarta.validation.constraints.Size;

public record PublicPageViewEventRequest(
        @Size(max = 4096) String url,
        @Size(max = 512) String title,
        @Size(max = 4096) String referrer
) {
}
