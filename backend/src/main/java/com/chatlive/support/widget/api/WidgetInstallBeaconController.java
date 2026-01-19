package com.chatlive.support.widget.api;

import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteInstallationRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Duration;

@RestController
@RequestMapping("/chatlive")
public class WidgetInstallBeaconController {

    // 1x1 transparent GIF
    private static final byte[] GIF_1X1 = new byte[]{
            71, 73, 70, 56, 57, 97, 1, 0, 1, 0, -128, 0, 0, -1, -1, -1, 0, 0, 0,
            33, -7, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59
    };

    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final SiteInstallationRepository installationRepository;

    public WidgetInstallBeaconController(
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            SiteInstallationRepository installationRepository
    ) {
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.installationRepository = installationRepository;
    }

    @GetMapping(value = "/ping.gif", produces = MediaType.IMAGE_GIF_VALUE)
    public ResponseEntity<byte[]> ping(
            @RequestParam("site_key") String siteKey,
            @RequestParam(value = "origin", required = false) String origin,
            @RequestParam(value = "page", required = false) String pageUrl,
            HttpServletRequest request
    ) {
        upsertBestEffort(siteKey, origin, pageUrl, request);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ZERO).mustRevalidate().cachePrivate())
                .contentType(MediaType.IMAGE_GIF)
                .body(GIF_1X1);
    }

    // Alternative endpoint to avoid adblock rules that target "ping.gif".
    @GetMapping(value = "/ping")
    public ResponseEntity<Void> pingNoExt(
            @RequestParam("site_key") String siteKey,
            @RequestParam(value = "origin", required = false) String origin,
            @RequestParam(value = "page", required = false) String pageUrl,
            HttpServletRequest request
    ) {
        upsertBestEffort(siteKey, origin, pageUrl, request);
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.maxAge(Duration.ZERO).mustRevalidate().cachePrivate())
                .build();
    }

        @PostMapping(value = "/ping")
        public ResponseEntity<Void> pingNoExtPost(
            @RequestParam("site_key") String siteKey,
            @RequestParam(value = "origin", required = false) String origin,
            @RequestParam(value = "page", required = false) String pageUrl,
            HttpServletRequest request
        ) {
        upsertBestEffort(siteKey, origin, pageUrl, request);
        return ResponseEntity.noContent()
            .cacheControl(CacheControl.maxAge(Duration.ZERO).mustRevalidate().cachePrivate())
            .build();
        }

    private void upsertBestEffort(String siteKey, String origin, String pageUrl, HttpServletRequest request) {
        try {
            if (siteKey != null && !siteKey.isBlank() && origin != null && !origin.isBlank()) {
                var host = extractHost(origin);
                var site = siteRepository.findByPublicKey(siteKey).orElse(null);
                if (site != null && "active".equals(site.status()) && allowlistRepository.isAllowed(site.id(), host)) {
                    var ua = request.getHeader("User-Agent");
                    var ip = extractClientIp(request);
                    var safeOrigin = truncate(origin, 300);
                    var safePage = truncate(pageUrl, 900);
                    var safeUa = truncate(ua, 300);
                    var safeIp = truncate(ip, 80);
                    installationRepository.upsertLastSeen(site.id(), safeOrigin, safePage, safeUa, safeIp);
                }
            }
        } catch (Exception ignored) {
            // ignore
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
        } catch (Exception ex) {
            throw new IllegalArgumentException("invalid_origin");
        }
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return null;
        var t = s.trim();
        if (t.isEmpty()) return null;
        if (t.length() <= maxLen) return t;
        return t.substring(0, maxLen);
    }

    private static String extractClientIp(HttpServletRequest request) {
        try {
            var xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                var first = xff.split(",")[0].trim();
                if (!first.isBlank()) return first;
            }
        } catch (Exception ignored) {
            // ignore
        }
        return request.getRemoteAddr();
    }
}
