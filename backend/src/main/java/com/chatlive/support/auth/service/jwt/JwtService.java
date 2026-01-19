package com.chatlive.support.auth.service.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.Optional;

@Service
public class JwtService {

    private final SecretKey key;

    public JwtService(@Value("${app.jwt.secret:dev-secret-change-me-please-32bytes-min}") String secret) {
        var bytes = secret.getBytes(StandardCharsets.UTF_8);
        this.key = Keys.hmacShaKeyFor(bytes);
    }

    public String issueAccessToken(String userId, String tenantId, String role, Duration ttl) {
        return issueToken(userId, tenantId, role, Map.of(), ttl);
    }

    public String issueVisitorToken(String visitorId, String tenantId, String siteId, Duration ttl) {
        return issueToken(visitorId, tenantId, "visitor", Map.of("site_id", siteId), ttl);
    }

    private String issueToken(String subject, String tenantId, String role, Map<String, Object> extraClaims, Duration ttl) {
        var now = Instant.now();
        var exp = now.plus(ttl);

        var builder = Jwts.builder()
                .setSubject(subject)
                .setIssuedAt(Date.from(now))
                .setExpiration(Date.from(exp))
                .claim("tenant_id", tenantId)
                .claim("role", role);

        if (extraClaims != null) {
            for (var e : extraClaims.entrySet()) {
                builder = builder.claim(e.getKey(), e.getValue());
            }
        }

        return builder
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    public JwtClaims parse(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(key)
                .build()
                .parseClaimsJws(token)
                .getBody();

        var userId = claims.getSubject();
        var tenantId = String.valueOf(claims.get("tenant_id"));
        var role = String.valueOf(claims.get("role"));
        var username = String.valueOf(claims.getOrDefault("username", ""));
        var siteId = String.valueOf(claims.getOrDefault("site_id", ""));
        return new JwtClaims(userId, tenantId, role, username, siteId);
    }

    public static Optional<String> extractBearerToken(String authorization) {
        if (authorization == null || authorization.isBlank()) return Optional.empty();
        var prefix = "Bearer ";
        if (!authorization.startsWith(prefix)) return Optional.empty();
        var token = authorization.substring(prefix.length()).trim();
        return token.isEmpty() ? Optional.empty() : Optional.of(token);
    }
}
