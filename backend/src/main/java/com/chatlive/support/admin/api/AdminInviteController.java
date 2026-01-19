package com.chatlive.support.admin.api;

import com.chatlive.support.auth.service.OnboardingAuthService;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/invites")
public class AdminInviteController {

    private final JwtService jwtService;
    private final OnboardingAuthService onboardingAuthService;

    public AdminInviteController(JwtService jwtService, OnboardingAuthService onboardingAuthService) {
        this.jwtService = jwtService;
        this.onboardingAuthService = onboardingAuthService;
    }

    @PostMapping("/agents")
    public ApiResponse<InviteAgentResponse> inviteAgent(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody InviteAgentRequest req
    ) {
        var claims = requireAdmin(authorization);
        var role = req == null ? null : req.role();
        var created = onboardingAuthService.createInviteAndSend(claims.tenantId(), claims.userId(), req.email(), role);
        return ApiResponse.ok(new InviteAgentResponse(created.inviteId(), req.email(), created.role(), created.devAcceptUrl()));
    }

    private JwtClaims requireAdmin(String authorization) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        return claims;
    }
}
