package com.chatlive.support.widget.service;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.widget.api.WidgetBootstrapRequest;
import com.chatlive.support.widget.api.WidgetBootstrapResponse;
import com.chatlive.support.widget.api.WidgetConfigDto;
import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.VisitorRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Duration;

@Service
public class PublicWidgetService {

    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final WidgetConfigRepository widgetConfigRepository;
    private final VisitorRepository visitorRepository;
    private final JwtService jwtService;
    private final Duration visitorTtl;

    public PublicWidgetService(
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            WidgetConfigRepository widgetConfigRepository,
            VisitorRepository visitorRepository,
            JwtService jwtService,
            @Value("${app.jwt.visitor-ttl-seconds:7200}") long visitorTtlSeconds
    ) {
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.widgetConfigRepository = widgetConfigRepository;
        this.visitorRepository = visitorRepository;
        this.jwtService = jwtService;
        this.visitorTtl = Duration.ofSeconds(visitorTtlSeconds);
    }

    public WidgetBootstrapResponse bootstrap(WidgetBootstrapRequest req) {
        var host = extractHost(req.origin());

        var site = siteRepository.findByPublicKey(req.site_key())
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        if (!"active".equals(site.status())) {
            throw new IllegalArgumentException("site_disabled");
        }

        if (!allowlistRepository.isAllowed(site.id(), host)) {
            throw new IllegalArgumentException("origin_not_allowed");
        }

        var config = widgetConfigRepository.findBySiteId(site.id())
            .map(r -> new WidgetConfigDto(
                r.anonymousEnabled(),
                r.themeColor(),
                r.welcomeText(),
                r.cookieDomain(),
                r.cookieSameSite()
            ))
            .orElseGet(() -> new WidgetConfigDto(true, null, null, null, null));

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
