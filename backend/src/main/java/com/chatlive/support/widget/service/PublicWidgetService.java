package com.chatlive.support.widget.service;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.geo.VisitorGeoUpdater;
import com.chatlive.support.common.geo.ClientIpResolver;
import com.chatlive.support.widget.api.WidgetBootstrapRequest;
import com.chatlive.support.widget.api.WidgetBootstrapResponse;
import com.chatlive.support.widget.api.WidgetConfigDto;
import com.chatlive.support.widget.repo.SiteBannedCustomerRepository;
import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.VisitorRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import com.chatlive.support.widget.repo.WidgetWelcomeGroupConfigRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Duration;

@Service
public class PublicWidgetService {

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
    private static final boolean DEFAULT_SHOW_WELCOME_SCREEN = true;

    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final SiteBannedCustomerRepository bannedCustomerRepository;
    private final WidgetConfigRepository widgetConfigRepository;
    private final VisitorRepository visitorRepository;
    private final VisitorGeoUpdater visitorGeoUpdater;
    private final JwtService jwtService;
    private final WidgetLogoUrlService widgetLogoUrlService;
    private final WidgetWelcomeGroupConfigRepository widgetWelcomeGroupConfigRepository;
    private final Duration visitorTtl;

    public PublicWidgetService(
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            SiteBannedCustomerRepository bannedCustomerRepository,
            WidgetConfigRepository widgetConfigRepository,
            VisitorRepository visitorRepository,
            VisitorGeoUpdater visitorGeoUpdater,
            JwtService jwtService,
            WidgetLogoUrlService widgetLogoUrlService,
            WidgetWelcomeGroupConfigRepository widgetWelcomeGroupConfigRepository,
            @Value("${app.jwt.visitor-ttl-seconds:7200}") long visitorTtlSeconds
    ) {
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.bannedCustomerRepository = bannedCustomerRepository;
        this.widgetConfigRepository = widgetConfigRepository;
        this.visitorRepository = visitorRepository;
        this.visitorGeoUpdater = visitorGeoUpdater;
        this.jwtService = jwtService;
        this.widgetLogoUrlService = widgetLogoUrlService;
        this.widgetWelcomeGroupConfigRepository = widgetWelcomeGroupConfigRepository;
        this.visitorTtl = Duration.ofSeconds(visitorTtlSeconds);
    }

    public WidgetBootstrapResponse bootstrap(HttpServletRequest request, WidgetBootstrapRequest req) {
        var host = extractHost(req.origin());

        var site = siteRepository.findByPublicKey(req.site_key())
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        if (!"active".equals(site.status())) {
            throw new IllegalArgumentException("site_disabled");
        }

        var ip = ClientIpResolver.resolve(request);
        if (ip != null && !ip.isBlank() && bannedCustomerRepository.isBannedNow(site.id(), ip.trim().toLowerCase())) {
            throw new IllegalArgumentException("banned_customer");
        }

        if (site.allowlistEnabled() && !allowlistRepository.isAllowed(site.id(), host)) {
            throw new IllegalArgumentException("origin_not_allowed");
        }

        var config = widgetConfigRepository.findBySiteId(site.id())
            .map(r -> new WidgetConfigDto(
                r.preChatEnabled(),
                r.preChatFieldsJson(),
                r.themeColor(),
                r.welcomeText(),
                r.showWelcomeScreen() != null ? r.showWelcomeScreen() : DEFAULT_SHOW_WELCOME_SCREEN,
                r.cookieDomain(),
                r.cookieSameSite(),
                r.widgetLanguage(),
                r.widgetPhrasesJson(),
                r.preChatMessage(),
                r.preChatNameLabel(),
                r.preChatEmailLabel(),
                r.preChatNameRequired(),
                r.preChatEmailRequired(),
                r.launcherStyle() != null && !r.launcherStyle().isBlank() ? r.launcherStyle() : DEFAULT_LAUNCHER_STYLE,
                r.themeMode() != null && !r.themeMode().isBlank() ? r.themeMode() : DEFAULT_THEME_MODE,
                r.colorSettingsMode() != null && !r.colorSettingsMode().isBlank() ? r.colorSettingsMode() : DEFAULT_COLOR_SETTINGS_MODE,
                r.colorOverridesJson(),
                r.position() != null && !r.position().isBlank() ? r.position() : DEFAULT_POSITION,
                r.zIndex() != null ? r.zIndex() : DEFAULT_Z_INDEX,
                r.launcherText() != null && !r.launcherText().isBlank() ? r.launcherText() : DEFAULT_LAUNCHER_TEXT,
                r.width() != null ? r.width() : DEFAULT_WIDTH,
                r.height() != null ? r.height() : DEFAULT_HEIGHT,
                r.autoHeight() != null ? r.autoHeight() : DEFAULT_AUTO_HEIGHT,
                r.autoHeightMode() != null && !r.autoHeightMode().isBlank() ? r.autoHeightMode() : DEFAULT_AUTO_HEIGHT_MODE,
                r.minHeight() != null ? r.minHeight() : DEFAULT_MIN_HEIGHT,
                r.maxHeightRatio() != null ? r.maxHeightRatio() : DEFAULT_MAX_HEIGHT_RATIO,
                r.mobileBreakpoint() != null ? r.mobileBreakpoint() : DEFAULT_MOBILE_BREAKPOINT,
                r.mobileFullscreen() != null ? r.mobileFullscreen() : DEFAULT_MOBILE_FULLSCREEN,
                r.offsetX() != null ? r.offsetX() : DEFAULT_OFFSET_X,
                r.offsetY() != null ? r.offsetY() : DEFAULT_OFFSET_Y,
                r.debug() != null ? r.debug() : DEFAULT_DEBUG,
                Boolean.TRUE.equals(r.showLogo()),
                Boolean.TRUE.equals(r.showLogo()) ? widgetLogoUrlService.presignGetUrl(r.logoBucket(), r.logoObjectKey()) : null,
                Boolean.TRUE.equals(r.showAgentPhoto())
            ))
            .orElseGet(() -> new WidgetConfigDto(
                    false,
                    null,
                    null,
                    null,
                    DEFAULT_SHOW_WELCOME_SCREEN,
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

        // Apply optional group-specific overrides (welcome screen only).
        try {
            var gid = req == null ? null : req.skill_group_id();
            if (gid != null && !gid.isBlank()) {
                var row = widgetWelcomeGroupConfigRepository.find(site.id(), gid.trim()).orElse(null);
                if (row != null) {
                    var nextWelcome = row.welcomeText() != null ? row.welcomeText() : config.welcome_text();
                    var nextShow = row.showWelcomeScreen() != null ? row.showWelcomeScreen() : config.show_welcome_screen();
                    config = new WidgetConfigDto(
                            config.pre_chat_enabled(),
                            config.pre_chat_fields_json(),
                            config.theme_color(),
                            nextWelcome,
                            nextShow,
                            config.cookie_domain(),
                            config.cookie_samesite(),
                            config.widget_language(),
                            config.widget_phrases_json(),
                            config.pre_chat_message(),
                            config.pre_chat_name_label(),
                            config.pre_chat_email_label(),
                            config.pre_chat_name_required(),
                            config.pre_chat_email_required(),
                            config.launcher_style(),
                            config.theme_mode(),
                            config.color_settings_mode(),
                            config.color_overrides_json(),
                            config.position(),
                            config.z_index(),
                            config.launcher_text(),
                            config.width(),
                            config.height(),
                            config.auto_height(),
                            config.auto_height_mode(),
                            config.min_height(),
                            config.max_height_ratio(),
                            config.mobile_breakpoint(),
                            config.mobile_fullscreen(),
                            config.offset_x(),
                            config.offset_y(),
                            config.debug(),
                            config.show_logo(),
                            config.logo_url(),
                            config.show_agent_photo()
                    );
                }
            }
        } catch (Exception ignore) {
            // ignore
        }
        String visitorId;
        if (req.visitor_id() != null && !req.visitor_id().isBlank()) {
            var existing = visitorRepository.findByIdAndSite(req.visitor_id(), site.id()).orElse(null);
            if (existing != null) {
                visitorId = existing.id();
                visitorRepository.touchLastSeen(visitorId);
            } else {
                visitorId = visitorRepository.createAnonymous(site.id());
            }
        } else {
            visitorId = visitorRepository.createAnonymous(site.id());
        }

        // Best-effort geo refresh (no IP stored or returned).
        visitorGeoUpdater.refreshGeoIfNeeded(visitorId, site.id(), request);

        var token = jwtService.issueVisitorToken(visitorId, site.tenantId(), site.id(), visitorTtl);

        return new WidgetBootstrapResponse(
                token,
                visitorId,
                site.tenantId(),
                site.id(),
                config
        );
    }

    /**
     * Lightweight check for the launcher (host page) so it can decide whether to render.
     * This must be safe to call from arbitrary origins and should not throw.
     */
    public boolean isBannedNow(HttpServletRequest request, String siteKey) {
        try {
            if (siteKey == null || siteKey.isBlank()) return false;

            var site = siteRepository.findByPublicKey(siteKey)
                    .orElse(null);
            if (site == null) return false;
            if (!"active".equals(site.status())) return false;

            var ip = ClientIpResolver.resolve(request);
            if (ip == null || ip.isBlank()) return false;

            return bannedCustomerRepository.isBannedNow(site.id(), ip.trim().toLowerCase());
        } catch (Exception ignore) {
            return false;
        }
    }

    private static String extractHost(String origin) {
        try {
            var uri = URI.create(origin);
            var host = uri.getHost();
            if (host == null || host.isBlank()) {
                throw new IllegalArgumentException("invalid_origin");
            }
            return host.toLowerCase();
        } catch (IllegalArgumentException ex) {
            if ("invalid_origin".equals(ex.getMessage())) throw ex;
            throw new IllegalArgumentException("invalid_origin");
        } catch (Exception ex) {
            throw new IllegalArgumentException("invalid_origin");
        }
    }
}
