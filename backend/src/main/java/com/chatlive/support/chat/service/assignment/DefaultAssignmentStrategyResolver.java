package com.chatlive.support.chat.service.assignment;

import com.chatlive.support.chat.repo.AssignmentStrategyConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class DefaultAssignmentStrategyResolver implements AssignmentStrategyResolver {

    private static final Logger log = LoggerFactory.getLogger(DefaultAssignmentStrategyResolver.class);

    private final Map<String, AssignmentStrategy> strategies;
    private final AssignmentStrategyConfigRepository configRepository;
    private final String globalDefaultKey;

    private static final long CACHE_TTL_MS = 5_000;

    private record CacheEntry(String key, long expiresAtMs) {
    }

    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public DefaultAssignmentStrategyResolver(
            Map<String, AssignmentStrategy> strategies,
            AssignmentStrategyConfigRepository configRepository,
            @Value("${app.assignment.strategy:round_robin}") String globalDefaultKey
    ) {
        this.strategies = strategies;
        this.configRepository = configRepository;
        this.globalDefaultKey = globalDefaultKey;
    }

    @Override
    public AssignmentStrategy resolve(AssignmentContext ctx) {
        if (ctx == null) throw new IllegalArgumentException("ctx_required");

        var tenantId = ctx.tenantId();
        var groupKey = ctx.groupKey();

        var key = resolveStrategyKey(tenantId, groupKey);
        var picked = strategies == null ? null : strategies.get(key);
        if (picked != null) return picked;

        var fallback = strategies == null ? null : strategies.get("round_robin");
        if (fallback != null) {
            log.warn("unknown_assignment_strategy strategy={} fallback=round_robin", key);
            return fallback;
        }

        throw new IllegalStateException("assignment_strategy_not_found");
    }

    private String resolveStrategyKey(String tenantId, String groupKey) {
        if (tenantId == null || tenantId.isBlank()) {
            return normalizeStrategyKey(globalDefaultKey);
        }
        var gk = (groupKey == null || groupKey.isBlank()) ? "__default__" : groupKey;
        var cacheKey = tenantId + "|" + gk;

        var now = System.currentTimeMillis();
        var cached = cache.get(cacheKey);
        if (cached != null && cached.expiresAtMs() > now) {
            return cached.key();
        }

        var dbKey = configRepository.findStrategyKey(tenantId, gk).orElse(null);
        var resolved = normalizeStrategyKey(dbKey != null ? dbKey : globalDefaultKey);
        cache.put(cacheKey, new CacheEntry(resolved, now + CACHE_TTL_MS));
        return resolved;
    }

    private String normalizeStrategyKey(String raw) {
        var key = (raw == null ? "" : raw.trim().toLowerCase()).replace('-', '_');
        if (key.isBlank()) return "round_robin";
        return switch (key) {
            case "roundrobin" -> "round_robin";
            case "leastopen" -> "least_open";
            default -> key;
        };
    }
}
