package com.chatlive.support.common.geo;

import jakarta.servlet.http.HttpServletRequest;

public final class ClientIpResolver {

    private ClientIpResolver() {
    }

    public static String resolve(HttpServletRequest req) {
        if (req == null) return null;

        // Standard de-facto header.
        var xff = firstHeader(req, "X-Forwarded-For");
        var ip = firstIpFromXff(xff);
        if (isUsableIp(ip)) return ip;

        ip = normalizeIp(firstHeader(req, "X-Real-IP"));
        if (isUsableIp(ip)) return ip;

        // RFC 7239: Forwarded: for=1.2.3.4;proto=https;host=...
        ip = firstIpFromForwarded(firstHeader(req, "Forwarded"));
        if (isUsableIp(ip)) return ip;

        ip = normalizeIp(req.getRemoteAddr());
        return isUsableIp(ip) ? ip : null;
    }

    private static String firstHeader(HttpServletRequest req, String name) {
        try {
            var v = req.getHeader(name);
            if (v == null) return null;
            var t = v.trim();
            return t.isEmpty() ? null : t;
        } catch (Exception ignore) {
            return null;
        }
    }

    private static String firstIpFromXff(String xff) {
        if (xff == null || xff.isBlank()) return null;
        // XFF: client, proxy1, proxy2
        var parts = xff.split(",");
        for (var p : parts) {
            var ip = normalizeIp(p);
            if (isUsableIp(ip)) return ip;
        }
        return null;
    }

    private static String firstIpFromForwarded(String forwarded) {
        if (forwarded == null || forwarded.isBlank()) return null;
        // Could be multiple entries separated by comma.
        var entries = forwarded.split(",");
        for (var entry : entries) {
            var e = entry.trim();
            if (e.isEmpty()) continue;
            // find for=...
            var parts = e.split(";");
            for (var part : parts) {
                var kv = part.trim();
                if (kv.isEmpty()) continue;
                if (!kv.toLowerCase().startsWith("for=")) continue;
                var raw = kv.substring(4).trim();
                // Strip quotes.
                if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length() >= 2) {
                    raw = raw.substring(1, raw.length() - 1);
                }
                // Strip IPv6 brackets.
                if (raw.startsWith("[") && raw.contains("]")) {
                    raw = raw.substring(1, raw.indexOf(']'));
                }
                var ip = normalizeIp(raw);
                if (isUsableIp(ip)) return ip;
            }
        }
        return null;
    }

    private static String normalizeIp(String raw) {
        if (raw == null) return null;
        var ip = raw.trim();
        if (ip.isEmpty()) return null;
        if ("unknown".equalsIgnoreCase(ip)) return null;

        // Remove port if present (best-effort, for IPv4 like 1.2.3.4:5678).
        var colon = ip.indexOf(':');
        var dot = ip.indexOf('.');
        if (colon > 0 && dot >= 0) {
            // Looks like IPv4 with port.
            var candidate = ip.substring(0, colon);
            if (candidate.chars().filter(ch -> ch == '.').count() == 3) {
                ip = candidate;
            }
        }

        return ip;
    }

    private static boolean isUsableIp(String ip) {
        if (ip == null || ip.isBlank()) return false;
        if ("unknown".equalsIgnoreCase(ip)) return false;
        return true;
    }
}
