package com.chatlive.support.common.geo;

import com.chatlive.support.widget.repo.VisitorRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class VisitorGeoUpdater {

    private final GeoIpService geoIpService;
    private final VisitorRepository visitorRepository;

    public VisitorGeoUpdater(GeoIpService geoIpService, VisitorRepository visitorRepository) {
        this.geoIpService = geoIpService;
        this.visitorRepository = visitorRepository;
    }

    public void refreshGeoIfNeeded(String visitorId, String siteId, HttpServletRequest request) {
        // Always record client info (best-effort) for Technology panel.
        touchClientInfo(visitorId, siteId, request);

        if (!geoIpService.isEnabled()) return;
        if (visitorId == null || visitorId.isBlank()) return;
        if (siteId == null || siteId.isBlank()) return;

        var row = visitorRepository.findByIdAndSite(visitorId, siteId).orElse(null);
        if (row == null) return;
        if (!geoIpService.shouldRefresh(row.geoUpdatedAt())) return;

        var ip = ClientIpResolver.resolve(request);
        if (ip == null || ip.isBlank()) return;

        geoIpService.lookup(ip).ifPresent(res -> {
            visitorRepository.updateGeo(
                    visitorId,
                    siteId,
                    res.country(),
                    res.region(),
                    res.city(),
                    res.lat(),
                    res.lon(),
                    res.timezone()
            );
        });
    }

    private void touchClientInfo(String visitorId, String siteId, HttpServletRequest request) {
        try {
            if (visitorId == null || visitorId.isBlank()) return;
            if (siteId == null || siteId.isBlank()) return;
            if (request == null) return;

            var ip = Optional.ofNullable(ClientIpResolver.resolve(request)).map(String::trim).orElse("");
            var ua = Optional.ofNullable(request.getHeader("User-Agent")).map(String::trim).orElse("");

            if (ip.isBlank() && ua.isBlank()) return;

            if (ip.length() > 128) ip = ip.substring(0, 128);
            if (ua.length() > 2048) ua = ua.substring(0, 2048);

            visitorRepository.updateClientInfo(visitorId, siteId, ip.isBlank() ? null : ip, ua.isBlank() ? null : ua);
        } catch (Exception ignored) {
            // best-effort
        }
    }
}
