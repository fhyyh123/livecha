package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import com.chatlive.support.widget.service.WidgetLogoService;
import com.chatlive.support.widget.service.WidgetLogoUrlService;
import org.springframework.web.bind.annotation.PostMapping;
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

    private static final String DEFAULT_POSITION = "bottom-right";
    private static final int DEFAULT_Z_INDEX = 2147483647;
    private static final String DEFAULT_LAUNCHER_TEXT = "Chat";
    private static final String DEFAULT_LAUNCHER_STYLE = "bubble";
    private static final String DEFAULT_THEME_MODE = "light";
    private static final String DEFAULT_COLOR_SETTINGS_MODE = "theme";
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

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final WidgetConfigRepository widgetConfigRepository;
    private final WidgetLogoService widgetLogoService;
    private final WidgetLogoUrlService widgetLogoUrlService;

    public AdminWidgetConfigController(
            JwtService jwtService,
            SiteRepository siteRepository,
            WidgetConfigRepository widgetConfigRepository,
            WidgetLogoService widgetLogoService,
            WidgetLogoUrlService widgetLogoUrlService
    ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.widgetConfigRepository = widgetConfigRepository;
        this.widgetLogoService = widgetLogoService;
        this.widgetLogoUrlService = widgetLogoUrlService;
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
            normalizeLauncherStyle(row.launcherStyle()),
            normalizeThemeMode(row.themeMode()),
            normalizeColorSettingsMode(row.colorSettingsMode()),
            normalizeJson(row.colorOverridesJson()),
            normalizePosition(row.position()),
            normalizeZIndex(row.zIndex()),
            normalizeLauncherText(row.launcherText()),
            normalizeWidth(row.width()),
            normalizeHeight(row.height()),
            normalizeAutoHeight(row.autoHeight()),
            normalizeAutoHeightMode(row.autoHeightMode()),
            normalizeMinHeight(row.minHeight()),
            normalizeMaxHeightRatio(row.maxHeightRatio()),
            normalizeMobileBreakpoint(row.mobileBreakpoint()),
            normalizeMobileFullscreen(row.mobileFullscreen()),
            normalizeOffsetX(row.offsetX()),
            normalizeOffsetY(row.offsetY()),
            normalizeDebug(row.debug()),
            showLogo,
            showLogo ? widgetLogoUrlService.presignGetUrl(row.logoBucket(), row.logoObjectKey()) : null,
            Boolean.TRUE.equals(row.showAgentPhoto())
        ));
    }

    public record PresignWidgetLogoUploadRequest(String filename, String content_type, Long size_bytes) {
    }

    @PostMapping("/{id}/widget-logo/presign-upload")
    public ApiResponse<WidgetLogoService.PresignWidgetLogoUploadResult> presignWidgetLogoUpload(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @RequestBody PresignWidgetLogoUploadRequest req
    ) {
        var claims = requireAdminClaims(authorization);
        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var filename = req == null ? null : req.filename();
        var contentType = req == null ? null : req.content_type();
        var sizeBytes = req == null || req.size_bytes() == null ? 0 : req.size_bytes();

        var res = widgetLogoService.presignUpload(claims, site.id(), filename, contentType, sizeBytes);
        return ApiResponse.ok(res);
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
        var preChatFieldsJson = emptyToNull(req == null ? null : req.pre_chat_fields_json());
        var themeColor = emptyToNull(req == null ? null : req.theme_color());
        var welcomeText = emptyToNull(req == null ? null : req.welcome_text());
        var cookieDomain = emptyToNull(req == null ? null : req.cookie_domain());
        var cookieSameSite = normalizeSameSite(req == null ? null : req.cookie_samesite());

        var widgetLanguage = normalizeWidgetLanguage(req == null ? null : req.widget_language());
        var widgetPhrasesJson = emptyToNull(req == null ? null : req.widget_phrases_json());
        var preChatMessage = emptyToNull(req == null ? null : req.pre_chat_message());
        var preChatNameLabel = emptyToNull(req == null ? null : req.pre_chat_name_label());
        var preChatEmailLabel = emptyToNull(req == null ? null : req.pre_chat_email_label());
        var preChatNameRequired = req != null && req.pre_chat_name_required();
        var preChatEmailRequired = req != null && req.pre_chat_email_required();

        var launcherStyle = normalizeLauncherStyle(req == null ? null : req.launcher_style());
        var themeMode = normalizeThemeMode(req == null ? null : req.theme_mode());
        var colorSettingsMode = normalizeColorSettingsMode(req == null ? null : req.color_settings_mode());
        var colorOverridesJson = normalizeJson(req == null ? null : req.color_overrides_json());

        var position = normalizePosition(req == null ? null : req.position());
        var zIndex = normalizeZIndex(req == null ? null : req.z_index());
        var launcherText = normalizeLauncherText(req == null ? null : req.launcher_text());
        var width = normalizeWidth(req == null ? null : req.width());
        var height = normalizeHeight(req == null ? null : req.height());
        var autoHeight = normalizeAutoHeight(req == null ? null : req.auto_height());
        var autoHeightMode = normalizeAutoHeightMode(req == null ? null : req.auto_height_mode());
        var minHeight = normalizeMinHeight(req == null ? null : req.min_height());
        var maxHeightRatio = normalizeMaxHeightRatio(req == null ? null : req.max_height_ratio());
        var mobileBreakpoint = normalizeMobileBreakpoint(req == null ? null : req.mobile_breakpoint());
        var mobileFullscreen = normalizeMobileFullscreen(req == null ? null : req.mobile_fullscreen());
        var offsetX = normalizeOffsetX(req == null ? null : req.offset_x());
        var offsetY = normalizeOffsetY(req == null ? null : req.offset_y());
        var debug = normalizeDebug(req == null ? null : req.debug());
        var showLogo = req != null && req.show_logo();
        var showAgentPhoto = req != null && req.show_agent_photo();

        widgetConfigRepository.upsert(
                site.id(),
        preChatEnabled,
        preChatFieldsJson,
                themeColor,
                welcomeText,
                cookieDomain,
            cookieSameSite,
            widgetLanguage,
            widgetPhrasesJson,
            preChatMessage,
            preChatNameLabel,
            preChatEmailLabel,
            preChatNameRequired,
            preChatEmailRequired,
            launcherStyle,
            themeMode,
            colorSettingsMode,
            colorOverridesJson,
            position,
            zIndex,
            launcherText,
            width,
            height,
            autoHeight,
            autoHeightMode,
            minHeight,
            maxHeightRatio,
            mobileBreakpoint,
            mobileFullscreen,
            offsetX,
            offsetY,
            debug,
            showLogo,
            showAgentPhoto
        );

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
        var outShowLogo = Boolean.TRUE.equals(row.showLogo());
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
            normalizeLauncherStyle(row.launcherStyle()),
            normalizeThemeMode(row.themeMode()),
            normalizeColorSettingsMode(row.colorSettingsMode()),
            normalizeJson(row.colorOverridesJson()),
            normalizePosition(row.position()),
            normalizeZIndex(row.zIndex()),
            normalizeLauncherText(row.launcherText()),
            normalizeWidth(row.width()),
            normalizeHeight(row.height()),
            normalizeAutoHeight(row.autoHeight()),
            normalizeAutoHeightMode(row.autoHeightMode()),
            normalizeMinHeight(row.minHeight()),
            normalizeMaxHeightRatio(row.maxHeightRatio()),
            normalizeMobileBreakpoint(row.mobileBreakpoint()),
            normalizeMobileFullscreen(row.mobileFullscreen()),
            normalizeOffsetX(row.offsetX()),
            normalizeOffsetY(row.offsetY()),
            normalizeDebug(row.debug()),
            outShowLogo,
            outShowLogo ? widgetLogoUrlService.presignGetUrl(row.logoBucket(), row.logoObjectKey()) : null,
            Boolean.TRUE.equals(row.showAgentPhoto())
        ));
    }

    private static String normalizeLauncherStyle(String s) {
        if (s == null) return DEFAULT_LAUNCHER_STYLE;
        var t = s.trim().toLowerCase();
        if (t.isBlank()) return DEFAULT_LAUNCHER_STYLE;
        if ("bar".equals(t)) return "bar";
        if ("bubble".equals(t)) return "bubble";
        return DEFAULT_LAUNCHER_STYLE;
    }

    private static String normalizeThemeMode(String s) {
        if (s == null) return DEFAULT_THEME_MODE;
        var t = s.trim().toLowerCase();
        if (t.isBlank()) return DEFAULT_THEME_MODE;
        if ("dark".equals(t)) return "dark";
        if ("light".equals(t)) return "light";
        return DEFAULT_THEME_MODE;
    }

    private static String normalizeColorSettingsMode(String s) {
        if (s == null) return DEFAULT_COLOR_SETTINGS_MODE;
        var t = s.trim().toLowerCase();
        if (t.isBlank()) return DEFAULT_COLOR_SETTINGS_MODE;
        if ("advanced".equals(t)) return "advanced";
        if ("theme".equals(t)) return "theme";
        return DEFAULT_COLOR_SETTINGS_MODE;
    }

    private static String normalizeJson(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
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

    private static String normalizeWidgetLanguage(String s) {
        if (s == null) return "en";
        var t = s.trim();
        if (t.isBlank()) return "en";
        if ("en".equalsIgnoreCase(t)) return "en";
        if ("zh-CN".equalsIgnoreCase(t) || "zh-cn".equalsIgnoreCase(t)) return "zh-CN";
        return "en";
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

    private static String normalizePosition(String s) {
        var t = emptyToNull(s);
        if (t == null) return DEFAULT_POSITION;
        var v = t.trim().toLowerCase();
        return switch (v) {
            case "bottom-right", "bottom_left", "bottom-left", "top-right", "top-left" -> v.replace("_", "-");
            default -> DEFAULT_POSITION;
        };
    }

    private static Integer normalizeZIndex(Integer v) {
        if (v == null) return DEFAULT_Z_INDEX;
        if (v < 1) return 1;
        // Clamp to int32 max (CSS z-index in browsers is effectively bounded).
        return Math.min(v, 2147483647);
    }

    private static String normalizeLauncherText(String s) {
        var t = emptyToNull(s);
        if (t == null) return DEFAULT_LAUNCHER_TEXT;
        // Keep it short to avoid breaking launcher layout.
        if (t.length() > 40) return t.substring(0, 40);
        return t;
    }

    private static Integer normalizeWidth(Integer v) {
        if (v == null) return DEFAULT_WIDTH;
        if (v < 280) return 280;
        return Math.min(v, 640);
    }

    private static Integer normalizeHeight(Integer v) {
        if (v == null) return DEFAULT_HEIGHT;
        if (v < 320) return 320;
        return Math.min(v, 900);
    }

    private static Boolean normalizeAutoHeight(Boolean v) {
        if (v == null) return DEFAULT_AUTO_HEIGHT;
        return v;
    }

    private static String normalizeAutoHeightMode(String s) {
        var t = emptyToNull(s);
        if (t == null) return DEFAULT_AUTO_HEIGHT_MODE;
        var v = t.trim().toLowerCase();
        return switch (v) {
            case "fixed", "grow-only", "dynamic" -> v;
            default -> DEFAULT_AUTO_HEIGHT_MODE;
        };
    }

    private static Integer normalizeMinHeight(Integer v) {
        if (v == null) return DEFAULT_MIN_HEIGHT;
        if (v < 240) return 240;
        return Math.min(v, 900);
    }

    private static Double normalizeMaxHeightRatio(Double v) {
        if (v == null) return DEFAULT_MAX_HEIGHT_RATIO;
        if (v < 0.2) return 0.2;
        if (v > 1.0) return 1.0;
        return v;
    }

    private static Integer normalizeMobileBreakpoint(Integer v) {
        if (v == null) return DEFAULT_MOBILE_BREAKPOINT;
        if (v < 320) return 320;
        return Math.min(v, 2000);
    }

    private static Boolean normalizeMobileFullscreen(Boolean v) {
        if (v == null) return DEFAULT_MOBILE_FULLSCREEN;
        return v;
    }

    private static Integer normalizeOffsetX(Integer v) {
        if (v == null) return DEFAULT_OFFSET_X;
        if (v < 0) return 0;
        return Math.min(v, 200);
    }

    private static Integer normalizeOffsetY(Integer v) {
        if (v == null) return DEFAULT_OFFSET_Y;
        if (v < 0) return 0;
        return Math.min(v, 200);
    }

    private static Boolean normalizeDebug(Boolean v) {
        if (v == null) return DEFAULT_DEBUG;
        return v;
    }
}
