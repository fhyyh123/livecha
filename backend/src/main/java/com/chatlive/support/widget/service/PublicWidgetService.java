package com.chatlive.support.widget.service;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.geo.VisitorGeoUpdater;
import com.chatlive.support.widget.api.WidgetBootstrapRequest;
import com.chatlive.support.widget.api.WidgetBootstrapResponse;
import com.chatlive.support.widget.api.WidgetConfigDto;
import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.VisitorRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
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

    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final WidgetConfigRepository widgetConfigRepository;
    private final VisitorRepository visitorRepository;
    private final VisitorGeoUpdater visitorGeoUpdater;
    private final JwtService jwtService;
    private final WidgetLogoUrlService widgetLogoUrlService;
    private final Duration visitorTtl;

    public PublicWidgetService(
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            WidgetConfigRepository widgetConfigRepository,
            VisitorRepository visitorRepository,
            VisitorGeoUpdater visitorGeoUpdater,
            JwtService jwtService,
            WidgetLogoUrlService widgetLogoUrlService,
            @Value("${app.jwt.visitor-ttl-seconds:7200}") long visitorTtlSeconds
    ) {
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.widgetConfigRepository = widgetConfigRepository;
        this.visitorRepository = visitorRepository;
        this.visitorGeoUpdater = visitorGeoUpdater;
        this.jwtService = jwtService;
        this.widgetLogoUrlService = widgetLogoUrlService;
        this.visitorTtl = Duration.ofSeconds(visitorTtlSeconds);
    }

    public WidgetBootstrapResponse bootstrap(HttpServletRequest request, WidgetBootstrapRequest req) {
        var host = extractHost(req.origin());

        var site = siteRepository.findByPublicKey(req.site_key())
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        if (!"active".equals(site.status())) {
            throw new IllegalArgumentException("site_disabled");
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
