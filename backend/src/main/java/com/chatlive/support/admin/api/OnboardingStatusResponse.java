package com.chatlive.support.admin.api;

public record OnboardingStatusResponse(
        boolean email_verified,
        boolean has_site,
        String first_site_id
) {
}
