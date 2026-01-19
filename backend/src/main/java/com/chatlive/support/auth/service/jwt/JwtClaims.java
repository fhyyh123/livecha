package com.chatlive.support.auth.service.jwt;

public record JwtClaims(
        String userId,
        String tenantId,
        String role,
        String username,
        String siteId
) {
}
