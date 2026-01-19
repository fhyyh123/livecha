package com.chatlive.support.common.config;

import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.net.URI;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Configuration
public class CorsConfig {

    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final Set<String> allowedEmbedOrigins;

    public CorsConfig(
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            @Value("${app.widget.public-embed-url:http://localhost:5173/visitor/embed}") String publicEmbedUrl,
            @Value("${app.ws.public-allowed-origins:}") String extraAllowedOriginsCsv
    ) {
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.allowedEmbedOrigins = buildAllowedEmbedOrigins(publicEmbedUrl, extraAllowedOriginsCsv);
    }

    /**
     * Public endpoints are called from the visitor embed app (iframe). We still want to avoid
     * advertising these APIs to arbitrary origins, especially for preflight requests.
     */
    @Bean
    public FilterRegistrationBean<CorsFilter> publicCorsFilter() {
        CorsConfigurationSource source = this::buildCorsConfiguration;
        var bean = new FilterRegistrationBean<>(new CorsFilter(source));
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return bean;
    }

    private CorsConfiguration buildCorsConfiguration(HttpServletRequest request) {
        var path = request.getRequestURI();
        if (path == null || !path.startsWith("/api/v1/public/")) {
            return null;
        }

        var origin = request.getHeader("Origin");
        if (origin == null || origin.isBlank()) {
            return null;
        }

        var originHost = extractHost(origin);
        if (originHost == null || originHost.isBlank()) {
            return null;
        }

        boolean allowed = false;

        // Primary rule: allow the official embed app origin(s).
        if (allowedEmbedOrigins.contains(origin)) {
            allowed = true;
        }

        // Secondary rule: for bootstrap only, also allow the customer site origins (site allowlist).
        // This supports future variants where the host page calls bootstrap directly.
        if (!allowed && "/api/v1/public/widget/bootstrap".equals(path)) {
            var siteKey = request.getParameter("site_key");
            if (siteKey != null && !siteKey.isBlank()) {
                var site = siteRepository.findByPublicKey(siteKey).orElse(null);
                if (site != null && "active".equals(site.status())) {
                    allowed = allowlistRepository.isAllowed(site.id(), originHost);
                }
            } else {
                allowed = allowlistRepository.isAllowedByAnyActiveSite(originHost);
            }
        }

        if (!allowed) {
            return null;
        }

        var cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(List.of(origin));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setMaxAge(3600L);
        cfg.setAllowCredentials(false);
        return cfg;
    }

    private static String extractHost(String origin) {
        try {
            var uri = URI.create(origin);
            var host = uri.getHost();
            return host == null ? null : host.toLowerCase();
        } catch (Exception ex) {
            return null;
        }
    }

    private static Set<String> buildAllowedEmbedOrigins(String publicEmbedUrl, String extraAllowedOriginsCsv) {
        var out = new HashSet<String>();

        var embedOrigin = safeOriginFromUrl(publicEmbedUrl);
        if (embedOrigin != null && !embedOrigin.isBlank()) {
            out.add(embedOrigin);
        }
        if (extraAllowedOriginsCsv != null && !extraAllowedOriginsCsv.isBlank()) {
            for (var raw : extraAllowedOriginsCsv.split(",")) {
                var t = raw == null ? "" : raw.trim();
                if (!t.isBlank()) out.add(t);
            }
        }
        return out;
    }

    private static String safeOriginFromUrl(String url) {
        try {
            return URI.create(url).resolve("/").toString().replaceAll("/$", "");
        } catch (Exception ex) {
            return null;
        }
    }
}
