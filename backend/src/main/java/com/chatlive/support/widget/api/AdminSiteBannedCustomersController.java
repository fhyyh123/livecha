package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.chatlive.support.widget.repo.SiteBannedCustomerRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

import java.net.InetAddress;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/sites")
public class AdminSiteBannedCustomersController {

    public record BanCustomerRequest(
            @NotBlank(message = "ip_required") String ip,
            @NotNull(message = "duration_required") Long duration_seconds
    ) {
    }

    public record BannedCustomerItem(
            String ip,
            Instant expires_at,
            Instant created_at
    ) {
    }

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final SiteBannedCustomerRepository bannedCustomerRepository;
    private final WsBroadcaster wsBroadcaster;

    public AdminSiteBannedCustomersController(
            JwtService jwtService,
            SiteRepository siteRepository,
            SiteBannedCustomerRepository bannedCustomerRepository,
            WsBroadcaster wsBroadcaster
    ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.bannedCustomerRepository = bannedCustomerRepository;
        this.wsBroadcaster = wsBroadcaster;
    }

    @GetMapping("/{id}/banned-customers")
    public ApiResponse<List<BannedCustomerItem>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var rows = bannedCustomerRepository.listActive(siteId);
        var items = rows.stream().map(r -> new BannedCustomerItem(r.ip(), r.expiresAt(), r.createdAt())).toList();
        return ApiResponse.ok(items);
    }

    @PostMapping("/{id}/banned-customers")
    public ApiResponse<List<BannedCustomerItem>> ban(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @Valid @RequestBody BanCustomerRequest req
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var ip = normalizeIp(req.ip());
        var seconds = req.duration_seconds() == null ? 0L : req.duration_seconds();
        if (seconds <= 0) throw new IllegalArgumentException("invalid_duration");
        // Keep it bounded (10 years) to avoid absurd values.
        if (seconds > 10L * 365L * 24L * 3600L) throw new IllegalArgumentException("invalid_duration");

        var expiresAt = Instant.now().plusSeconds(seconds);
        bannedCustomerRepository.banOrExtend(siteId, ip, expiresAt, claims.userId());

        // Immediately disconnect existing visitor WS sessions for this site+ip.
        try {
            wsBroadcaster.kickVisitorSessionsBySiteAndIp(siteId, ip, "banned_customer");
        } catch (Exception ignore) {
            // best-effort
        }

        var rows = bannedCustomerRepository.listActive(siteId);
        var items = rows.stream().map(r -> new BannedCustomerItem(r.ip(), r.expiresAt(), r.createdAt())).toList();
        return ApiResponse.ok(items);
    }

    @DeleteMapping("/{id}/banned-customers/{ip}")
    public ApiResponse<List<BannedCustomerItem>> unban(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @PathVariable("ip") String ip
    ) {
        var claims = requireAdmin(authorization);
        siteRepository.findById(claims.tenantId(), siteId).orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var normalized = normalizeIp(ip);
        bannedCustomerRepository.unban(siteId, normalized);

        var rows = bannedCustomerRepository.listActive(siteId);
        var items = rows.stream().map(r -> new BannedCustomerItem(r.ip(), r.expiresAt(), r.createdAt())).toList();
        return ApiResponse.ok(items);
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

    private static String normalizeIp(String raw) {
        if (raw == null) throw new IllegalArgumentException("invalid_ip");
        var s = raw.trim();
        if (s.isBlank()) throw new IllegalArgumentException("invalid_ip");

        // Strip quotes
        if (s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2) {
            s = s.substring(1, s.length() - 1).trim();
        }

        // Strip IPv6 brackets (and ignore any :port after ])
        if (s.startsWith("[") && s.contains("]")) {
            s = s.substring(1, s.indexOf(']')).trim();
        }

        // Strip port for IPv4 like 1.2.3.4:5678
        var colon = s.indexOf(':');
        var dot = s.indexOf('.');
        if (colon > 0 && dot >= 0) {
            var candidate = s.substring(0, colon);
            long dots = candidate.chars().filter(ch -> ch == '.').count();
            if (dots == 3) {
                s = candidate;
            }
        }

        if (s.length() > 128) throw new IllegalArgumentException("invalid_ip");

        // Basic validation: must parse as IP address (no hostnames).
        try {
            InetAddress.getByName(s);
        } catch (Exception ex) {
            throw new IllegalArgumentException("invalid_ip");
        }

        return s.toLowerCase();
    }
}
