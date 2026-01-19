package com.chatlive.support.admin.api;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.user.repo.UserAccountRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/onboarding")
public class AdminOnboardingController {

    private final JwtService jwtService;
    private final UserAccountRepository userAccountRepository;
    private final SiteRepository siteRepository;

    public AdminOnboardingController(JwtService jwtService, UserAccountRepository userAccountRepository, SiteRepository siteRepository) {
        this.jwtService = jwtService;
        this.userAccountRepository = userAccountRepository;
        this.siteRepository = siteRepository;
    }

    @GetMapping("/status")
    public ApiResponse<OnboardingStatusResponse> status(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdmin(authorization);
        var me = userAccountRepository.findMeById(claims.userId()).orElse(null);
        var emailVerified = me != null && me.emailVerified();

        var sites = siteRepository.listByTenant(claims.tenantId());
        var firstSiteId = sites.isEmpty() ? null : sites.getFirst().id();
        return ApiResponse.ok(new OnboardingStatusResponse(emailVerified, !sites.isEmpty(), firstSiteId));
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
