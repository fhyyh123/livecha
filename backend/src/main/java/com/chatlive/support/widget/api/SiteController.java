package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import com.chatlive.support.widget.service.WidgetLogoUrlService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/sites")
public class SiteController {

        private static final String DEFAULT_LAUNCHER_STYLE = "bubble";
        private static final String DEFAULT_THEME_MODE = "light";
        private static final String DEFAULT_COLOR_SETTINGS_MODE = "theme";
        private static final String DEFAULT_POSITION = "bottom-right";
        private static final int DEFAULT_Z_INDEX = 2147483647;
        private static final String DEFAULT_LAUNCHER_TEXT = "Chat";
        private static final int DEFAULT_WIDTH = 380;
        private static final int DEFAULT_HEIGHT = 560;
        private static final boolean DEFAULT_AUTO_HEIGHT = true;
        private static final String DEFAULT_AUTO_HEIGHT_MODE = "fixed";
        private static final int DEFAULT_MIN_HEIGHT = 320;
        private static final double DEFAULT_MAX_HEIGHT_RATIO = 0.85;
        private static final int DEFAULT_MOBILE_BREAKPOINT = 640;
        private static final boolean DEFAULT_MOBILE_FULLSCREEN = true;
        private static final int DEFAULT_OFFSET_X = 20;
        private static final int DEFAULT_OFFSET_Y = 20;
        private static final boolean DEFAULT_DEBUG = false;

    public record SiteItem(String id, String name, String public_key, String status) {
    }

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final WidgetConfigRepository widgetConfigRepository;
        private final WidgetLogoUrlService widgetLogoUrlService;

        public SiteController(
                        JwtService jwtService,
                        SiteRepository siteRepository,
                        WidgetConfigRepository widgetConfigRepository,
                        WidgetLogoUrlService widgetLogoUrlService
        ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.widgetConfigRepository = widgetConfigRepository;
                this.widgetLogoUrlService = widgetLogoUrlService;
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
                return ApiResponse.ok(new WidgetConfigDto(
                        false,
                        null,
                        null,
                        null,
                        null,
                        null,
                        "en",
                        null,
                        null,
                        null,
                        null,
                        false,
                        false,
                        DEFAULT_LAUNCHER_STYLE,
                        DEFAULT_THEME_MODE,
                        DEFAULT_COLOR_SETTINGS_MODE,
                        null,
                        DEFAULT_POSITION,
                        DEFAULT_Z_INDEX,
                        DEFAULT_LAUNCHER_TEXT,
                        DEFAULT_WIDTH,
                        DEFAULT_HEIGHT,
                        DEFAULT_AUTO_HEIGHT,
                        DEFAULT_AUTO_HEIGHT_MODE,
                        DEFAULT_MIN_HEIGHT,
                        DEFAULT_MAX_HEIGHT_RATIO,
                        DEFAULT_MOBILE_BREAKPOINT,
                        DEFAULT_MOBILE_FULLSCREEN,
                        DEFAULT_OFFSET_X,
                        DEFAULT_OFFSET_Y,
                        DEFAULT_DEBUG,
                        false,
                        null,
                        false
                ));
        }

        var showLogo = Boolean.TRUE.equals(row.showLogo());
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
                row.preChatEmailRequired(),
                row.launcherStyle() != null && !row.launcherStyle().isBlank() ? row.launcherStyle() : DEFAULT_LAUNCHER_STYLE,
                row.themeMode() != null && !row.themeMode().isBlank() ? row.themeMode() : DEFAULT_THEME_MODE,
                row.colorSettingsMode() != null && !row.colorSettingsMode().isBlank() ? row.colorSettingsMode() : DEFAULT_COLOR_SETTINGS_MODE,
                row.colorOverridesJson(),
                row.position() != null && !row.position().isBlank() ? row.position() : DEFAULT_POSITION,
                row.zIndex() != null ? row.zIndex() : DEFAULT_Z_INDEX,
                row.launcherText() != null && !row.launcherText().isBlank() ? row.launcherText() : DEFAULT_LAUNCHER_TEXT,
                row.width() != null ? row.width() : DEFAULT_WIDTH,
                row.height() != null ? row.height() : DEFAULT_HEIGHT,
                row.autoHeight() != null ? row.autoHeight() : DEFAULT_AUTO_HEIGHT,
                row.autoHeightMode() != null && !row.autoHeightMode().isBlank() ? row.autoHeightMode() : DEFAULT_AUTO_HEIGHT_MODE,
                row.minHeight() != null ? row.minHeight() : DEFAULT_MIN_HEIGHT,
                row.maxHeightRatio() != null ? row.maxHeightRatio() : DEFAULT_MAX_HEIGHT_RATIO,
                row.mobileBreakpoint() != null ? row.mobileBreakpoint() : DEFAULT_MOBILE_BREAKPOINT,
                row.mobileFullscreen() != null ? row.mobileFullscreen() : DEFAULT_MOBILE_FULLSCREEN,
                row.offsetX() != null ? row.offsetX() : DEFAULT_OFFSET_X,
                row.offsetY() != null ? row.offsetY() : DEFAULT_OFFSET_Y,
                row.debug() != null ? row.debug() : DEFAULT_DEBUG,
                showLogo,
                showLogo ? widgetLogoUrlService.presignGetUrl(row.logoBucket(), row.logoObjectKey()) : null,
                Boolean.TRUE.equals(row.showAgentPhoto())
        ));
    }
}
