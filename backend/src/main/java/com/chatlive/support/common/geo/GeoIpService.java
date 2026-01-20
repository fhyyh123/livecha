package com.chatlive.support.common.geo;

import com.maxmind.geoip2.DatabaseReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@Component
public class GeoIpService {

    private static final Logger log = LoggerFactory.getLogger(GeoIpService.class);

    private final String dbPath;
    private final Duration refreshTtl;

    private volatile DatabaseReader reader;
    private volatile boolean disabled;

    public GeoIpService(
            @Value("${app.geoip.db-path:}") String dbPath,
            @Value("${app.geoip.refresh-ttl-seconds:21600}") long refreshTtlSeconds
    ) {
        this.dbPath = dbPath == null ? "" : dbPath.trim();
        this.refreshTtl = Duration.ofSeconds(Math.max(60, refreshTtlSeconds));
        this.disabled = this.dbPath.isEmpty();
    }

    public Duration refreshTtl() {
        return refreshTtl;
    }

    public boolean isEnabled() {
        return !disabled;
    }

    public Optional<GeoIpResult> lookup(String ip) {
        if (disabled) return Optional.empty();
        var safeIp = ip == null ? "" : ip.trim();
        if (safeIp.isEmpty()) return Optional.empty();

        try {
            var r = ensureReader();
            if (r == null) return Optional.empty();

            var addr = InetAddress.getByName(safeIp);
            var cityResp = r.city(addr);

            var country = trimToNull(cityResp.getCountry() == null ? null : cityResp.getCountry().getName());
            var region = trimToNull(cityResp.getMostSpecificSubdivision() == null ? null : cityResp.getMostSpecificSubdivision().getName());
            var city = trimToNull(cityResp.getCity() == null ? null : cityResp.getCity().getName());

            Double lat = null;
            Double lon = null;
            String tz = null;
            if (cityResp.getLocation() != null) {
                try {
                    lat = cityResp.getLocation().getLatitude();
                    lon = cityResp.getLocation().getLongitude();
                } catch (Exception ignore) {
                    // ignore
                }
                tz = trimToNull(cityResp.getLocation().getTimeZone());
            }

            if (country == null && region == null && city == null && lat == null && lon == null && tz == null) {
                return Optional.empty();
            }

            return Optional.of(new GeoIpResult(country, region, city, lat, lon, tz));
        } catch (Exception e) {
            // Do not fail user flows if geo lookup fails.
            log.debug("geoip lookup failed: {}", e.toString());
            return Optional.empty();
        }
    }

    public boolean shouldRefresh(Instant updatedAt) {
        if (updatedAt == null) return true;
        return updatedAt.isBefore(Instant.now().minus(refreshTtl));
    }

    private DatabaseReader ensureReader() {
        if (disabled) return null;
        var existing = reader;
        if (existing != null) return existing;

        synchronized (this) {
            if (disabled) return null;
            if (reader != null) return reader;
            try {
                var f = new File(dbPath);
                if (!f.exists() || !f.isFile()) {
                    log.warn("GeoIP database file not found; disabling geoip. path={}", dbPath);
                    disabled = true;
                    return null;
                }
                reader = new DatabaseReader.Builder(f).build();
                log.info("GeoIP database loaded: {}", f.getAbsolutePath());
                return reader;
            } catch (Exception e) {
                log.warn("Failed to load GeoIP database; disabling geoip. err={}", e.toString());
                disabled = true;
                return null;
            }
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
