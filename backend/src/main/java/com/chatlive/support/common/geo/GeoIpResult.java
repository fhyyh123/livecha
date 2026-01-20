package com.chatlive.support.common.geo;

public record GeoIpResult(
        String country,
        String region,
        String city,
        Double lat,
        Double lon,
        String timezone
) {
}
