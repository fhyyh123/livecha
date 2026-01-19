package com.chatlive.support.common.config;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class PublicRateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000L;

    // Keep limits conservative for demo; tighten later with config.
    private static final int LIMIT_BOOTSTRAP_PER_MINUTE = 60;
    private static final int LIMIT_CREATE_CONV_PER_MINUTE = 20;
    private static final int LIMIT_SEND_MSG_PER_MINUTE = 60;
    private static final int LIMIT_LIST_MSG_PER_MINUTE = 120;

    private final JwtService jwtService;

    private final ConcurrentHashMap<String, WindowCounter> counters = new ConcurrentHashMap<>();

    public PublicRateLimitFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        var path = request.getRequestURI();
        return path == null || !path.startsWith("/api/v1/public/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        var path = request.getRequestURI();
        var method = (request.getMethod() == null ? "" : request.getMethod().toUpperCase());

        // Only rate-limit endpoints that are typically called from browsers.
        int limit = 0;
        String bucket = "";

        if ("/api/v1/public/widget/bootstrap".equals(path)) {
            limit = LIMIT_BOOTSTRAP_PER_MINUTE;
            bucket = "bootstrap";
        } else if ("POST".equals(method) && "/api/v1/public/conversations".equals(path)) {
            limit = LIMIT_CREATE_CONV_PER_MINUTE;
            bucket = "create_conv";
        } else if ("POST".equals(method) && path != null && path.startsWith("/api/v1/public/conversations/") && path.contains("/messages")) {
            limit = LIMIT_SEND_MSG_PER_MINUTE;
            bucket = "send_msg";
        } else if ("GET".equals(method) && path != null && path.startsWith("/api/v1/public/conversations/") && path.endsWith("/messages")) {
            limit = LIMIT_LIST_MSG_PER_MINUTE;
            bucket = "list_msg";
        }

        if (limit > 0) {
            var key = buildKey(bucket, request);
            if (!allow(key, limit)) {
                writeRateLimited(response);
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String buildKey(String bucket, HttpServletRequest request) {
        var ip = extractClientIp(request);

        if ("bootstrap".equals(bucket)) {
            var siteKey = Optional.ofNullable(request.getParameter("site_key")).orElse("");
            return bucket + ":" + siteKey + ":" + ip;
        }

        // Most other public endpoints require visitor token.
        JwtClaims claims = null;
        try {
            var token = JwtService.extractBearerToken(request.getHeader("Authorization")).orElse(null);
            if (token != null && !token.isBlank()) {
                claims = jwtService.parse(token);
            }
        } catch (Exception ignore) {
            // ignore
        }

        if (claims != null && claims.siteId() != null && claims.userId() != null) {
            return bucket + ":" + claims.siteId() + ":" + claims.userId() + ":" + ip;
        }

        return bucket + ":" + ip;
    }

    private static String extractClientIp(HttpServletRequest request) {
        var xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            var first = xff.split(",")[0].trim();
            if (!first.isBlank()) return first;
        }
        return request.getRemoteAddr() == null ? "" : request.getRemoteAddr();
    }

    private boolean allow(String key, int limit) {
        final long now = System.currentTimeMillis();
        var c = counters.computeIfAbsent(key, k -> new WindowCounter(now));

        synchronized (c) {
            c.lastSeenMs = now;
            if (now - c.windowStartMs >= WINDOW_MS) {
                c.windowStartMs = now;
                c.count.set(0);
            }
            if (c.count.get() >= limit) {
                return false;
            }
            c.count.incrementAndGet();
            return true;
        }
    }

    private static void writeRateLimited(HttpServletResponse response) throws IOException {
        response.setStatus(429);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        var body = ApiResponse.error("rate_limited");
        // Keep JSON output minimal without pulling in ObjectMapper.
        var json = "{\"ok\":false,\"data\":null,\"error\":\"" + body.error() + "\"}";
        response.getWriter().write(json);
    }

    private static class WindowCounter {
        volatile long windowStartMs;
        final AtomicInteger count = new AtomicInteger(0);
        volatile long lastSeenMs;

        WindowCounter(long now) {
            this.windowStartMs = now;
            this.lastSeenMs = now;
        }
    }
}
