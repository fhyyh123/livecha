package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/sites")
public class AdminWidgetConfigController {

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final WidgetConfigRepository widgetConfigRepository;

    public AdminWidgetConfigController(
            JwtService jwtService,
            SiteRepository siteRepository,
            WidgetConfigRepository widgetConfigRepository
    ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.widgetConfigRepository = widgetConfigRepository;
    }

    @GetMapping("/{id}/widget-config")
    public ApiResponse<WidgetConfigDto> get(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId
    ) {
        var claims = requireAdminClaims(authorization);
        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var row = widgetConfigRepository.findBySiteId(site.id()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new WidgetConfigDto(false, null, null, null, null, null, null, null, false, false));
        }
        return ApiResponse.ok(new WidgetConfigDto(
                row.preChatEnabled(),
                row.themeColor(),
                row.welcomeText(),
                row.cookieDomain(),
                row.cookieSameSite(),
                row.preChatMessage(),
                row.preChatNameLabel(),
                row.preChatEmailLabel(),
                row.preChatNameRequired(),
                row.preChatEmailRequired()
        ));
    }

    @PutMapping("/{id}/widget-config")
    public ApiResponse<WidgetConfigDto> put(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @RequestBody WidgetConfigDto req
    ) {
        var claims = requireAdminClaims(authorization);
        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

            var preChatEnabled = req != null && req.pre_chat_enabled();
        var themeColor = emptyToNull(req == null ? null : req.theme_color());
        var welcomeText = emptyToNull(req == null ? null : req.welcome_text());
        var cookieDomain = emptyToNull(req == null ? null : req.cookie_domain());
        var cookieSameSite = normalizeSameSite(req == null ? null : req.cookie_samesite());
        var preChatMessage = emptyToNull(req == null ? null : req.pre_chat_message());
        var preChatNameLabel = emptyToNull(req == null ? null : req.pre_chat_name_label());
        var preChatEmailLabel = emptyToNull(req == null ? null : req.pre_chat_email_label());
        var preChatNameRequired = req != null && req.pre_chat_name_required();
        var preChatEmailRequired = req != null && req.pre_chat_email_required();

        widgetConfigRepository.upsert(
                site.id(),
        preChatEnabled,
                themeColor,
                welcomeText,
                cookieDomain,
            cookieSameSite,
            preChatMessage,
            preChatNameLabel,
            preChatEmailLabel,
            preChatNameRequired,
            preChatEmailRequired
        );

        var row = widgetConfigRepository.findBySiteId(site.id()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new WidgetConfigDto(false, null, null, null, null, null, null, null, false, false));
        }
        return ApiResponse.ok(new WidgetConfigDto(
                row.preChatEnabled(),
                row.themeColor(),
                row.welcomeText(),
                row.cookieDomain(),
                row.cookieSameSite(),
                row.preChatMessage(),
                row.preChatNameLabel(),
                row.preChatEmailLabel(),
                row.preChatNameRequired(),
                row.preChatEmailRequired()
        ));
    }

    private JwtClaims requireAdminClaims(String authorization) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        return claims;
    }

    private static String emptyToNull(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }

    private static String normalizeSameSite(String s) {
        var t = emptyToNull(s);
        if (t == null) return null;
        var v = t.trim().toLowerCase();
        return switch (v) {
            case "none" -> "None";
            case "strict" -> "Strict";
            case "lax" -> "Lax";
            default -> throw new IllegalArgumentException("invalid_cookie_samesite");
        };
    }
}
