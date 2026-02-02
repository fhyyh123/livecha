package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteInstallationRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/sites")
public class AdminSiteInstallWizardController {

    public record AllowlistAddRequest(@NotBlank(message = "domain_required") String domain) {
    }

    public record InstallStatusResponse(
            boolean installed,
            Instant last_seen_at,
            String last_origin,
            String last_page_url
    ) {
    }

        public record AllowlistConfigResponse(boolean enabled) {
        }

        public record AllowlistConfigUpdateRequest(boolean enabled) {
        }

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final SiteInstallationRepository installationRepository;

    public AdminSiteInstallWizardController(
            JwtService jwtService,
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            SiteInstallationRepository installationRepository
    ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.installationRepository = installationRepository;
    }

    @GetMapping("/{id}/allowlist")
    public ApiResponse<List<String>> listAllowlist(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));
        return ApiResponse.ok(allowlistRepository.listDomains(siteId));
    }

    @PostMapping("/{id}/allowlist")
    public ApiResponse<List<String>> addAllowlist(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @Valid @RequestBody AllowlistAddRequest req
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var domain = normalizeDomain(req.domain());
        allowlistRepository.addDomain(siteId, domain);
        return ApiResponse.ok(allowlistRepository.listDomains(siteId));
    }

    @DeleteMapping("/{id}/allowlist/{domain}")
    public ApiResponse<List<String>> deleteAllowlist(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @PathVariable("domain") String domain
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var normalized = normalizeDomain(domain);
        allowlistRepository.deleteDomain(siteId, normalized);
        return ApiResponse.ok(allowlistRepository.listDomains(siteId));
    }

    @GetMapping("/{id}/install-status")
    public ApiResponse<InstallStatusResponse> installStatus(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var row = installationRepository.findBySiteId(siteId).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new InstallStatusResponse(false, null, null, null));
        }

        // Installed means we saw it at least once (ever).
        var installed = row.lastSeenAt() != null;
        return ApiResponse.ok(new InstallStatusResponse(installed, row.lastSeenAt(), row.lastOrigin(), row.lastPageUrl()));
    }

        @GetMapping("/{id}/allowlist-config")
        public ApiResponse<AllowlistConfigResponse> getAllowlistConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId
        ) {
        var claims = requireAdmin(authorization);
        var site = siteRepository.findById(claims.tenantId(), siteId)
            .orElseThrow(() -> new IllegalArgumentException("site_not_found"));
        return ApiResponse.ok(new AllowlistConfigResponse(site.allowlistEnabled()));
        }

        @PostMapping("/{id}/allowlist-config")
        public ApiResponse<AllowlistConfigResponse> updateAllowlistConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @RequestBody AllowlistConfigUpdateRequest req
        ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId)
            .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var enabled = req != null && req.enabled();
        var ok = siteRepository.setAllowlistEnabled(claims.tenantId(), siteId, enabled);
        if (!ok) throw new IllegalArgumentException("site_not_found");
        return ApiResponse.ok(new AllowlistConfigResponse(enabled));
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

    private static String normalizeDomain(String raw) {
        if (raw == null) throw new IllegalArgumentException("invalid_domain");
        var s = raw.trim();
        if (s.isBlank()) throw new IllegalArgumentException("invalid_domain");

        String host = null;
        try {
            // Accept full URL, origin, or host[:port].
            if (s.contains("://")) {
                host = URI.create(s).getHost();
            } else {
                // If it contains a port or path, parse as URL by adding a dummy scheme.
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

        // Basic RFC-ish hostname validation.
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
