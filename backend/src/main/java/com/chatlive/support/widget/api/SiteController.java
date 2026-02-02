package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/sites")
public class SiteController {

    public record SiteItem(String id, String name, String public_key, String status) {
    }

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final WidgetConfigRepository widgetConfigRepository;

    public SiteController(JwtService jwtService, SiteRepository siteRepository, WidgetConfigRepository widgetConfigRepository) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.widgetConfigRepository = widgetConfigRepository;
    }

    @GetMapping
    public ApiResponse<List<SiteItem>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);

        var role = String.valueOf(claims.role());
        if (!("admin".equals(role) || "agent".equals(role))) {
            throw new IllegalArgumentException("forbidden");
        }

        var rows = siteRepository.listByTenant(claims.tenantId());
        var items = rows.stream()
                .map(r -> new SiteItem(r.id(), r.name(), r.publicKey(), r.status()))
                .toList();

        return ApiResponse.ok(items);
    }

    @GetMapping("/{id}/widget-config")
    public ApiResponse<WidgetConfigDto> getWidgetConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);

        var role = String.valueOf(claims.role());
        if (!("admin".equals(role) || "agent".equals(role))) {
            throw new IllegalArgumentException("forbidden");
        }

        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var row = widgetConfigRepository.findBySiteId(site.id()).orElse(null);
        if (row == null) {
                return ApiResponse.ok(new WidgetConfigDto(false, null, null, null, null, null, "en", null, null, null, null, false, false));
        }

        return ApiResponse.ok(new WidgetConfigDto(
                row.preChatEnabled(),
                row.preChatFieldsJson(),
                row.themeColor(),
                row.welcomeText(),
                row.cookieDomain(),
                row.cookieSameSite(),
                row.widgetLanguage(),
                row.widgetPhrasesJson(),
                row.preChatMessage(),
                row.preChatNameLabel(),
                row.preChatEmailLabel(),
                row.preChatNameRequired(),
                row.preChatEmailRequired()
        ));
    }
}
