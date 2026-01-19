package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

@Repository
public class TenantRepository {

    private final JdbcTemplate jdbcTemplate;

    public TenantRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public record TenantRow(String id, String name) {
    }

    public String createTenant(String name) {
        var tenantName = name == null ? "" : name.trim();
        if (tenantName.isBlank()) {
            throw new IllegalArgumentException("tenant_name_required");
        }

        var id = "t_" + UUID.randomUUID();
        var sql = "insert into tenant(id, name, created_at) values (?, ?, current_timestamp)";
        jdbcTemplate.update(sql, id, tenantName);
        return id;
    }

    public Optional<TenantRow> findById(String tenantId) {
        var sql = "select id, name from tenant where id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new TenantRow(
                rs.getString("id"),
                rs.getString("name")
        ), tenantId);
        return list.stream().findFirst();
    }

    public List<String> listTenantIds() {
        var sql = "select id from tenant order by id asc";
        return jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("id"));
    }
}
