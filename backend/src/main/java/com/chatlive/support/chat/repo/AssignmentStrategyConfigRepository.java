package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class AssignmentStrategyConfigRepository {

    private final JdbcTemplate jdbcTemplate;

    public AssignmentStrategyConfigRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Lookup order:
     *  1) exact match (tenant_id, group_key)
     *  2) tenant wildcard match (tenant_id, '*')
     */
    public Optional<String> findStrategyKey(String tenantId, String groupKey) {
        if (tenantId == null || tenantId.isBlank()) return Optional.empty();
        var gk = groupKey == null ? "" : groupKey.trim();
        if (gk.isBlank()) gk = "__default__";

        var sqlExact = "select strategy_key from assignment_strategy_config where tenant_id = ? and group_key = ? limit 1";
        var list = jdbcTemplate.query(sqlExact, (rs, rowNum) -> rs.getString("strategy_key"), tenantId, gk);
        if (!list.isEmpty()) return Optional.ofNullable(list.get(0));

        var sqlWildcard = "select strategy_key from assignment_strategy_config where tenant_id = ? and group_key = '*' limit 1";
        var list2 = jdbcTemplate.query(sqlWildcard, (rs, rowNum) -> rs.getString("strategy_key"), tenantId);
        if (!list2.isEmpty()) return Optional.ofNullable(list2.get(0));

        return Optional.empty();
    }

    public Optional<String> findExactStrategyKey(String tenantId, String groupKey) {
        if (tenantId == null || tenantId.isBlank()) return Optional.empty();
        var gk = normalizeGroupKey(groupKey);

        var sql = "select strategy_key from assignment_strategy_config where tenant_id = ? and group_key = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("strategy_key"), tenantId, gk);
        if (!list.isEmpty()) return Optional.ofNullable(list.get(0));
        return Optional.empty();
    }

    public void upsert(String tenantId, String groupKey, String strategyKey) {
        if (tenantId == null || tenantId.isBlank()) throw new IllegalArgumentException("tenant_required");
        var gk = normalizeGroupKey(groupKey);
        var sk = normalizeStrategyKey(strategyKey);

        var updateSql = "update assignment_strategy_config set strategy_key = ?, updated_at = current_timestamp where tenant_id = ? and group_key = ?";
        var updated = jdbcTemplate.update(updateSql, sk, tenantId, gk);
        if (updated > 0) return;

        var insertSql = "insert into assignment_strategy_config(tenant_id, group_key, strategy_key, updated_at) values (?,?,?, current_timestamp)";
        jdbcTemplate.update(insertSql, tenantId, gk, sk);
    }

    private static String normalizeGroupKey(String groupKey) {
        var gk = groupKey == null ? "" : groupKey.trim();
        if (gk.isBlank()) return "__default__";
        return gk;
    }

    private static String normalizeStrategyKey(String raw) {
        var key = (raw == null ? "" : raw.trim().toLowerCase()).replace('-', '_');
        if (key.isBlank()) return "round_robin";
        return switch (key) {
            case "roundrobin" -> "round_robin";
            case "leastopen" -> "least_open";
            default -> key;
        };
    }
}
