package com.chatlive.support.common.geo;

import com.chatlive.support.widget.repo.VisitorRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class VisitorGeoUpdater {

    private final GeoIpService geoIpService;
    private final VisitorRepository visitorRepository;

    public VisitorGeoUpdater(GeoIpService geoIpService, VisitorRepository visitorRepository) {
        this.geoIpService = geoIpService;
        this.visitorRepository = visitorRepository;
    }

    public void refreshGeoIfNeeded(String visitorId, String siteId, HttpServletRequest request) {
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
}
