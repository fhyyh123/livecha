package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class SkillGroupRepository {

    public record SkillGroupRow(String id, String tenantId, String name, boolean enabled) {
    }

    public record SkillGroupMemberRow(String groupId, String agentUserId, int weight) {
    }

    private final JdbcTemplate jdbcTemplate;

    public SkillGroupRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String create(String tenantId, String name, Boolean enabled) {
        var id = "sg_" + UUID.randomUUID();
        var sql = """
                insert into skill_group(id, tenant_id, name, enabled, created_at)
                values (?, ?, ?, coalesce(?, true), now())
                """;
        try {
            jdbcTemplate.update(sql, id, tenantId, name, enabled);
        } catch (Exception ignored) {
            // H2 fallback
            var h2 = """
                    insert into skill_group(id, tenant_id, name, enabled, created_at)
                    values (?, ?, ?, coalesce(?, true), current_timestamp)
                    """;
            jdbcTemplate.update(h2, id, tenantId, name, enabled);
        }
        return id;
    }

    public Optional<SkillGroupRow> findById(String tenantId, String groupId) {
        var sql = "select id, tenant_id, name, enabled from skill_group where tenant_id = ? and id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new SkillGroupRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("name"),
                rs.getBoolean("enabled")
        ), tenantId, groupId);
        return list.stream().findFirst();
    }

    public List<SkillGroupRow> listByTenant(String tenantId) {
        var sql = """
                select id, tenant_id, name, enabled
                from skill_group
                where tenant_id = ?
                order by created_at desc
                limit 200
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new SkillGroupRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("name"),
                rs.getBoolean("enabled")
        ), tenantId);
    }

        public List<SkillGroupRow> listForAgent(String tenantId, String agentUserId) {
        var sql = """
            select g.id, g.tenant_id, g.name, g.enabled
            from skill_group g
            join skill_group_member m on m.group_id = g.id
            where g.tenant_id = ?
              and m.agent_user_id = ?
            order by g.name asc
            limit 200
            """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new SkillGroupRow(
            rs.getString("id"),
            rs.getString("tenant_id"),
            rs.getString("name"),
            rs.getBoolean("enabled")
        ), tenantId, agentUserId);
        }

    public void upsertMember(String groupId, String agentUserId, Integer weight) {
        var pg = """
                insert into skill_group_member(group_id, agent_user_id, weight, created_at)
                values (?, ?, coalesce(?, 0), now())
                on conflict (group_id, agent_user_id)
                do update set weight = excluded.weight
                """;

        var h2 = """
                merge into skill_group_member key(group_id, agent_user_id)
                values (?, ?, coalesce(?, 0), current_timestamp)
                """;

        try {
            jdbcTemplate.update(pg, groupId, agentUserId, weight);
        } catch (Exception ignored) {
            jdbcTemplate.update(h2, groupId, agentUserId, weight);
        }
    }

    public int removeMember(String groupId, String agentUserId) {
        var sql = "delete from skill_group_member where group_id = ? and agent_user_id = ?";
        return jdbcTemplate.update(sql, groupId, agentUserId);
    }

    public List<SkillGroupMemberRow> listMembers(String groupId) {
        var sql = """
                select group_id, agent_user_id, weight
                from skill_group_member
                where group_id = ?
                order by weight desc, agent_user_id asc
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new SkillGroupMemberRow(
                rs.getString("group_id"),
                rs.getString("agent_user_id"),
                rs.getInt("weight")
        ), groupId);
    }
}
