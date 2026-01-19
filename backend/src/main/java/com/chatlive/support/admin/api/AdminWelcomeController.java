package com.chatlive.support.admin.api;

import com.chatlive.support.admin.repo.TenantOnboardingRepository;
import com.chatlive.support.auth.service.OnboardingAuthService;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.user.repo.UserAccountRepository;
import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.service.SiteWizardService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/welcome")
public class AdminWelcomeController {

    public record WelcomeStatusResponse(
            boolean email_verified,
            boolean has_site,
            String first_site_id,
            String display_name,
            String website,
            boolean installation_acknowledged,
            String company_size,
            List<String> integrations,
            boolean completed
    ) {
    }

    public record SetNameRequest(@NotBlank(message = "display_name_required") String display_name) {
    }

    public record SetWebsiteRequest(@NotBlank(message = "website_required") String website) {
    }

    public record SetWebsiteResponse(String site_id) {
    }

    public record SetIntegrationsRequest(List<String> integrations) {
    }

    public record SetCompanySizeRequest(@NotBlank(message = "company_size_required") String company_size) {
    }

    public record InviteTeamRequest(List<String> emails) {
    }

    public record InvitedItem(String invite_id, String email, String role, String dev_accept_url) {
    }

    public record InviteTeamResponse(List<InvitedItem> invited) {
    }

    private final JwtService jwtService;
    private final AgentProfileRepository agentProfileRepository;
    private final UserAccountRepository userAccountRepository;
    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final SiteWizardService siteWizardService;
    private final TenantOnboardingRepository tenantOnboardingRepository;
    private final OnboardingAuthService onboardingAuthService;
    private final ObjectMapper objectMapper;

    public AdminWelcomeController(
            JwtService jwtService,
            AgentProfileRepository agentProfileRepository,
            UserAccountRepository userAccountRepository,
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            SiteWizardService siteWizardService,
            TenantOnboardingRepository tenantOnboardingRepository,
            OnboardingAuthService onboardingAuthService,
            ObjectMapper objectMapper
    ) {
        this.jwtService = jwtService;
        this.agentProfileRepository = agentProfileRepository;
        this.userAccountRepository = userAccountRepository;
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.siteWizardService = siteWizardService;
        this.tenantOnboardingRepository = tenantOnboardingRepository;
        this.onboardingAuthService = onboardingAuthService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/status")
    public ApiResponse<WelcomeStatusResponse> status(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdmin(authorization);

        var meRow = userAccountRepository.findMeById(claims.userId()).orElse(null);
        var emailVerified = meRow != null && meRow.emailVerified();

        var me = agentProfileRepository.findDisplayNameByUserId(claims.userId()).orElse(null);

        var sites = siteRepository.listByTenant(claims.tenantId());
        var firstSiteId = sites.isEmpty() ? null : sites.getFirst().id();
        var hasSite = !sites.isEmpty();

        var onboarding = tenantOnboardingRepository.findByTenantId(claims.tenantId()).orElse(null);
        var website = onboarding == null ? null : onboarding.website();
        var installationAcknowledged = onboarding != null && onboarding.installationAckAt() != null;
        var companySize = onboarding == null ? null : onboarding.companySize();
        var integrationsRaw = onboarding == null ? null : onboarding.integrations();

        var completed = onboarding != null && onboarding.completedAt() != null;

        var integrations = parseIntegrations(integrationsRaw);

        return ApiResponse.ok(new WelcomeStatusResponse(emailVerified, hasSite, firstSiteId, me, website, installationAcknowledged, companySize, integrations, completed));
    }

    @PostMapping("/installation/ack")
    public ApiResponse<Void> acknowledgeInstallation(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdmin(authorization);
        tenantOnboardingRepository.markInstallationAcknowledged(claims.tenantId());
        return ApiResponse.ok(null);
    }

    @PostMapping("/name")
    public ApiResponse<Void> setName(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody SetNameRequest req
    ) {
        var claims = requireAdmin(authorization);
        agentProfileRepository.upsertDisplayName(claims.userId(), req == null ? null : req.display_name());
        return ApiResponse.ok(null);
    }

    @PostMapping("/website")
    public ApiResponse<SetWebsiteResponse> setWebsite(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody SetWebsiteRequest req
    ) {
        var claims = requireAdmin(authorization);
        var raw = req == null ? null : req.website();
        var normalizedHost = normalizeDomain(raw);

        tenantOnboardingRepository.upsertWebsite(claims.tenantId(), safeTrim(raw));

        var sites = siteRepository.listByTenant(claims.tenantId());
        if (sites.isEmpty()) {
            var created = siteWizardService.createWizard(
                    claims.tenantId(),
                    normalizedHost,
                    normalizedHost,
                    null,
                    null,
                    null,
                    null
            );
            return ApiResponse.ok(new SetWebsiteResponse(created.siteId()));
        }

        var firstSiteId = sites.getFirst().id();
        allowlistRepository.addDomain(firstSiteId, normalizedHost);
        return ApiResponse.ok(new SetWebsiteResponse(firstSiteId));
    }

    @PostMapping("/integrations")
    public ApiResponse<Void> setIntegrations(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody SetIntegrationsRequest req
    ) {
        var claims = requireAdmin(authorization);
        var list = req == null || req.integrations() == null ? List.<String>of() : req.integrations();
        var cleaned = new ArrayList<String>();
        for (var s : list) {
            var t = safeTrim(s);
            if (t != null) cleaned.add(t);
        }

        try {
            var json = objectMapper.writeValueAsString(cleaned);
            tenantOnboardingRepository.upsertIntegrations(claims.tenantId(), json);
        } catch (Exception e) {
            throw new IllegalArgumentException("invalid_integrations");
        }
        return ApiResponse.ok(null);
    }

    @PostMapping("/company-size")
    public ApiResponse<Void> setCompanySize(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody SetCompanySizeRequest req
    ) {
        var claims = requireAdmin(authorization);
        tenantOnboardingRepository.upsertCompanySize(claims.tenantId(), safeTrim(req == null ? null : req.company_size()));
        return ApiResponse.ok(null);
    }

    @PostMapping("/team")
    public ApiResponse<InviteTeamResponse> inviteTeam(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody InviteTeamRequest req
    ) {
        var claims = requireAdmin(authorization);
        var emails = req == null || req.emails() == null ? List.<String>of() : req.emails();

        var invited = new ArrayList<InvitedItem>();
        for (var email : emails) {
            var trimmed = safeTrim(email);
            if (trimmed == null) continue;
            var created = onboardingAuthService.createInviteAndSend(claims.tenantId(), claims.userId(), trimmed, "agent");
            invited.add(new InvitedItem(created.inviteId(), trimmed, created.role(), created.devAcceptUrl()));
        }

        // Treat team step as completed even if no emails were provided (skip/empty).
        tenantOnboardingRepository.markCompleted(claims.tenantId());

        return ApiResponse.ok(new InviteTeamResponse(invited));
    }

    @PostMapping("/complete")
    public ApiResponse<Void> complete(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdmin(authorization);
        tenantOnboardingRepository.markCompleted(claims.tenantId());
        return ApiResponse.ok(null);
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

    private List<String> parseIntegrations(String raw) {
        // Distinguish "not started" (null) from "completed with no selections" ([]).
        // Frontend uses this to support LiveChat-like flow where users can continue without selecting.
        if (raw == null || raw.isBlank()) return null;
        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {
            });
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private static String safeTrim(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }

    private static String normalizeDomain(String raw) {
        var s = safeTrim(raw);
        if (s == null) throw new IllegalArgumentException("invalid_domain");

        String host;
        try {
            if (s.contains("://")) {
                host = URI.create(s).getHost();
            } else {
                if (s.contains(":" ) || s.contains("/") || s.contains("?") || s.contains("#")) {
                    host = URI.create("http://" + s).getHost();
                } else {
                    host = s;
                }
            }
        } catch (Exception ignored) {
            host = null;
        }

        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("invalid_domain");
        }

        host = host.trim().toLowerCase();
        if (host.endsWith(".")) host = host.substring(0, host.length() - 1);

        if (!isValidHost(host)) {
            throw new IllegalArgumentException("invalid_domain");
        }
        return host;
    }

    private static boolean isValidHost(String host) {
        if (host.equals("localhost")) return true;
        if (isValidIpv4(host)) return true;

        if (host.length() > 253) return false;
        var labels = host.split("\\.");
        if (labels.length < 2) return false;
        for (var label : labels) {
            if (label.isEmpty() || label.length() > 63) return false;
            if (!label.matches("[a-z0-9-]+")) return false;
            if (label.startsWith("-") || label.endsWith("-")) return false;
        }
        return true;
    }

    private static boolean isValidIpv4(String s) {
        var parts = s.split("\\.");
        if (parts.length != 4) return false;
        for (var p : parts) {
            if (p.isEmpty() || p.length() > 3) return false;
            if (!p.matches("\\d+")) return false;
            int n;
            try {
                n = Integer.parseInt(p);
            } catch (Exception e) {
                return false;
            }
            if (n < 0 || n > 255) return false;
        }
        return true;
    }
}
