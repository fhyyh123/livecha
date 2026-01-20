package com.chatlive.support.chat.api;

public record VisitorPublicProfile(
        String id,
        String site_id,
        String name,
        String email,
        String geo_country,
        String geo_region,
        String geo_city,
        Double geo_lat,
        Double geo_lon,
        String geo_timezone,
        Long geo_updated_at
) {
}
