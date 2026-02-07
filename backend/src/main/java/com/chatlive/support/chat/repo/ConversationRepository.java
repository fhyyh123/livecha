package com.chatlive.support.chat.repo;

import com.chatlive.support.chat.api.ConversationSummary;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Repository
public class ConversationRepository {

    public record InactiveConversationRow(String id, Instant lastMsgAt) {
    }

        public record IdleCandidateRow(
            String id,
            Instant createdAt,
            Instant lastCustomerMsgAt,
            Instant lastIdleEventAt
        ) {
        }

    public record ConversationAccessRow(
            String id,
            String tenantId,
            String customerUserId,
            String assignedAgentUserId,
        String status,
        String siteId,
        String visitorId
    ) {
    }

        public record ConversationDetailRow(
            String id,
            String tenantId,
            String customerUserId,
            String assignedAgentUserId,
            String channel,
            String subject,
            String status,
            java.time.Instant createdAt,
            java.time.Instant lastMsgAt,
            java.time.Instant closedAt,
            String skillGroupId
        ) {
        }

        public record QueuedConversationRow(
            String id,
            String skillGroupId
        ) {
        }

    private final JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper;

    public ConversationRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    private String toLastMessagePreview(String contentType, String contentJson) {
        if (contentType == null || contentType.isBlank()) return "";
        if (contentJson == null || contentJson.isBlank()) return "";

        try {
            JsonNode node = objectMapper.readTree(contentJson);
            if ("text".equals(contentType)) {
                var s = node.path("text").asText("");
                return s == null ? "" : s.replaceAll("\\s+", " ").trim();
            }
            // Best-effort for file/attachment-like messages.
            var filename = node.path("filename").asText("");
            if (filename != null && !filename.isBlank()) {
                return ("[附件] " + filename).trim();
            }
            return ("[" + contentType + "]").trim();
        } catch (Exception ignored) {
            // Do not fail list endpoint due to malformed content.
            return "";
        }
    }

    private long toEpochSeconds(java.time.Instant instant) {
        if (instant == null) return 0L;
        return instant.getEpochSecond();
    }

    public String create(String tenantId, String customerUserId, String channel, String skillGroupId, String subject) {
        var id = "c_" + UUID.randomUUID();
        var sql = """
                insert into conversation(
                    id, tenant_id, customer_user_id, channel, skill_group_id, subject, status, created_at, last_msg_at
                                ) values (?, ?, ?, ?, ?, ?, 'queued', now(), now())
                """;
        jdbcTemplate.update(sql, id, tenantId, customerUserId, channel, skillGroupId, subject);
        return id;
    }

    public String createForVisitor(String tenantId, String visitorCustomerUserId, String channel, String skillGroupId, String subject, String siteId, String visitorId) {
        var id = "c_" + UUID.randomUUID();
        var sql = """
                insert into conversation(
                    id, tenant_id, customer_user_id, channel, skill_group_id, subject, status, created_at, last_msg_at, site_id, visitor_id
                                ) values (?, ?, ?, ?, ?, ?, 'queued', now(), now(), ?, ?)
                """;
        jdbcTemplate.update(sql, id, tenantId, visitorCustomerUserId, channel, skillGroupId, subject, siteId, visitorId);
        return id;
    }

    public java.util.Optional<String> findActiveBySiteVisitor(String tenantId, String siteId, String visitorId) {
        var sql = """
                select id
                from conversation
                where tenant_id = ?
                  and site_id = ?
                  and visitor_id = ?
                  and status <> 'closed'
                  and closed_at is null
                order by last_msg_at desc
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("id"), tenantId, siteId, visitorId);
        return list.stream().filter(java.util.Objects::nonNull).findFirst();
    }

        /**
         * Find the latest conversation for a visitor under a site, including closed ones.
         *
         * Product behavior: widget should keep showing the same conversation thread; if it's closed,
         * the first inbound message will reopen it.
         */
        public java.util.Optional<String> findLatestBySiteVisitor(String tenantId, String siteId, String visitorId) {
                var sql = """
                                select id
                                from conversation
                                where tenant_id = ?
                                    and site_id = ?
                                    and visitor_id = ?
                                order by last_msg_at desc
                                limit 1
                                """;
                var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("id"), tenantId, siteId, visitorId);
                return list.stream().filter(java.util.Objects::nonNull).findFirst();
        }

        public int tryAssignToAgent(String tenantId, String conversationId, String agentUserId) {
                var sql = """
                                update conversation
                                set assigned_agent_user_id = ?, status = 'assigned'
                                where tenant_id = ? and id = ?
                                    and assigned_agent_user_id is null
                                """;
                return jdbcTemplate.update(sql, agentUserId, tenantId, conversationId);
        }

        public int forceAssign(String tenantId, String conversationId, String agentUserId) {
                var sql = """
                                update conversation
                                set assigned_agent_user_id = ?, status = 'assigned'
                                where tenant_id = ? and id = ?
                                """;
                return jdbcTemplate.update(sql, agentUserId, tenantId, conversationId);
        }

        public int tryClaim(String tenantId, String conversationId, String agentUserId) {
                var sql = """
                                update conversation
                                set assigned_agent_user_id = ?, status = 'assigned'
                                where tenant_id = ? and id = ?
                                    and (assigned_agent_user_id is null or assigned_agent_user_id = ?)
                                """;
                return jdbcTemplate.update(sql, agentUserId, tenantId, conversationId, agentUserId);
        }

        public int countActiveAssignedToAgent(String tenantId, String agentUserId) {
                var sql = """
                                select count(1)
                                from conversation
                                where tenant_id = ?
                                    and assigned_agent_user_id = ?
                                    and status = 'assigned'
                                    and closed_at is null
                                """;
                Integer n = jdbcTemplate.queryForObject(sql, Integer.class, tenantId, agentUserId);
                return n == null ? 0 : n;
        }

        public Map<String, Integer> countActiveAssignedByAgents(String tenantId, List<String> agentUserIds) {
            if (agentUserIds == null || agentUserIds.isEmpty()) {
                return Map.of();
            }

            var sql = new StringBuilder();
            sql.append("select assigned_agent_user_id as user_id, count(1) as active ");
            sql.append("from conversation ");
            sql.append("where tenant_id = ? ");
            sql.append("  and status = 'assigned' ");
            sql.append("  and closed_at is null ");
            sql.append("  and assigned_agent_user_id in (");
            sql.append(String.join(",", java.util.Collections.nCopies(agentUserIds.size(), "?")));
            sql.append(") ");
            sql.append("group by assigned_agent_user_id");

            var args = new ArrayList<Object>();
            args.add(tenantId);
            args.addAll(agentUserIds);

            var map = new HashMap<String, Integer>();
            jdbcTemplate.query(sql.toString(), rs -> {
                map.put(rs.getString("user_id"), rs.getInt("active"));
            }, args.toArray());
            return map;
        }

            public List<QueuedConversationRow> listQueuedForAssignment(String tenantId, int limit) {
                var sql = """
                        select id, skill_group_id
                        from conversation
                        where tenant_id = ?
                          and status = 'queued'
                          and assigned_agent_user_id is null
                        order by created_at asc
                        limit ?
                        """;
                return jdbcTemplate.query(sql, (rs, rowNum) -> new QueuedConversationRow(
                        rs.getString("id"),
                        rs.getString("skill_group_id")
                ), tenantId, limit);
            }

                public List<QueuedConversationRow> listQueuedForAgent(String tenantId, String agentUserId, int limit) {
                var sql = """
                    select c.id, c.skill_group_id
                    from conversation c
                    where c.tenant_id = ?
                      and c.status = 'queued'
                      and c.assigned_agent_user_id is null
                      and (
                        c.skill_group_id is null
                         or c.skill_group_id = ''
                         or exists (
                          select 1
                          from skill_group_member m
                          where m.group_id = c.skill_group_id
                            and m.agent_user_id = ?
                         )
                      )
                    order by c.created_at asc
                    limit ?
                    """;
                return jdbcTemplate.query(sql, (rs, rowNum) -> new QueuedConversationRow(
                    rs.getString("id"),
                    rs.getString("skill_group_id")
                ), tenantId, agentUserId, limit);
                }

    public java.util.Optional<ConversationAccessRow> findAccess(String tenantId, String conversationId) {
        var sql = """
            select id, tenant_id, customer_user_id, assigned_agent_user_id, status, site_id, visitor_id
                from conversation
                where tenant_id = ? and id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new ConversationAccessRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("customer_user_id"),
                rs.getString("assigned_agent_user_id"),
            rs.getString("status"),
            rs.getString("site_id"),
            rs.getString("visitor_id")
        ), tenantId, conversationId);
        return list.stream().findFirst();
    }

    public java.util.Optional<ConversationDetailRow> findDetail(String tenantId, String conversationId) {
        var sql = """
            select id, tenant_id, customer_user_id, assigned_agent_user_id, channel, subject, status, created_at, last_msg_at, closed_at, skill_group_id
                from conversation
                where tenant_id = ? and id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> new ConversationDetailRow(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("customer_user_id"),
                rs.getString("assigned_agent_user_id"),
                rs.getString("channel"),
                rs.getString("subject"),
                rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("last_msg_at").toInstant(),
            rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
            rs.getString("skill_group_id")
        ), tenantId, conversationId);
        return list.stream().findFirst();
    }

    /**
     * Active chat duration in seconds, based on first/last human message timestamps.
     *
     * Notes:
     * - Filters out system messages.
     * - Returns null when there are no human messages yet.
     */
    public Long findActiveDurationSeconds(String tenantId, String conversationId) {
        var sql = """
            select case when count(1) = 0 then null
                        else (extract(epoch from max(created_at)) - extract(epoch from min(created_at)))::bigint
                   end as active_duration_seconds
            from message
            where tenant_id = ?
              and conversation_id = ?
              and sender_type in ('customer', 'agent')
            """;

        return jdbcTemplate.queryForObject(sql, Long.class, tenantId, conversationId);
    }

        public int countBySiteVisitor(String tenantId, String siteId, String visitorId) {
        var sql = """
            select count(1)
            from conversation
            where tenant_id = ?
              and site_id = ?
              and visitor_id = ?
            """;
        Integer n = jdbcTemplate.queryForObject(sql, Integer.class, tenantId, siteId, visitorId);
        return n == null ? 0 : n;
        }

    public int closeConversation(
            String tenantId,
            String conversationId,
            String actorUserId,
            String archivedReason,
            Integer archivedInactivityMinutes
    ) {
        var sql = """
                update conversation
                set status = 'closed',
                    closed_at = now(),
                    last_archived_reason = ?,
                    last_archived_inactivity_minutes = ?
                where tenant_id = ?
                  and id = ?
                  and status <> 'closed'
                """;
        // actorUserId reserved for future audit columns
        return jdbcTemplate.update(sql, archivedReason, archivedInactivityMinutes, tenantId, conversationId);
    }

    public int reopenConversation(String tenantId, String conversationId, String actorUserId) {
        var sql = """
                update conversation
                set status = 'assigned',
                    closed_at = null,
                                        last_archived_reason = null,
                                        last_archived_inactivity_minutes = null,
                    assigned_agent_user_id = ?
                where tenant_id = ?
                  and id = ?
                  and status = 'closed'
                """;
        return jdbcTemplate.update(sql, actorUserId, tenantId, conversationId);
    }

    /**
     * Reopen a closed conversation back into the queue.
     *
     * Used by visitor-side messaging: after an agent closes a conversation, the visitor may send again and
     * we should re-queue it for reassignment.
     */
    public int reopenToQueued(String tenantId, String conversationId) {
        var sql = """
                update conversation
                set status = 'queued',
                    closed_at = null,
                                        last_archived_reason = null,
                                        last_archived_inactivity_minutes = null,
                    assigned_agent_user_id = null
                where tenant_id = ?
                  and id = ?
                  and status = 'closed'
                """;
        return jdbcTemplate.update(sql, tenantId, conversationId);
    }

    public java.util.Optional<String> findSkillGroupId(String tenantId, String conversationId) {
        var sql = """
                select skill_group_id
                from conversation
                where tenant_id = ? and id = ?
                limit 1
                """;
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("skill_group_id"), tenantId, conversationId);
        // skill_group_id is nullable; avoid Optional.of(null) inside findFirst().
        return list.stream().filter(java.util.Objects::nonNull).findFirst();
    }

    public void touchLastMsgAt(String tenantId, String conversationId) {
        var sql = "update conversation set last_msg_at = now() where tenant_id = ? and id = ?";
        jdbcTemplate.update(sql, tenantId, conversationId);
    }

    public void touchLastCustomerMsgAt(String tenantId, String conversationId) {
        var sql = "update conversation set last_customer_msg_at = now() where tenant_id = ? and id = ?";
        jdbcTemplate.update(sql, tenantId, conversationId);
    }

    public void updateLastIdleEventAt(String tenantId, String conversationId, Instant ts) {
        if (ts == null) return;
        var sql = "update conversation set last_idle_event_at = ? where tenant_id = ? and id = ?";
        jdbcTemplate.update(sql, Timestamp.from(ts), tenantId, conversationId);
    }

    public java.util.Optional<Instant> findCreatedAt(String tenantId, String conversationId) {
        var sql = "select created_at from conversation where tenant_id = ? and id = ? limit 1";
        var list = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getTimestamp("created_at").toInstant(), tenantId, conversationId);
        return list.stream().findFirst();
    }

    /**
     * List conversations that have become idle based on visitor/customer inactivity.
     *
     * Condition:
     *  - still open (not closed)
     *  - now - coalesce(last_customer_msg_at, created_at) >= idle
     *  - and no idle event has been emitted for the current inactivity period
     */
    public List<IdleCandidateRow> listIdleCandidates(String tenantId, Instant cutoff, int limit) {
        if (tenantId == null || tenantId.isBlank()) return List.of();
        if (cutoff == null) return List.of();
        int safeLimit = Math.max(1, Math.min(limit, 500));

        var sql = """
                select id, created_at, last_customer_msg_at, last_idle_event_at
                from conversation
                where tenant_id = ?
                  and status <> 'closed'
                  and closed_at is null
                  and coalesce(last_customer_msg_at, created_at) < ?
                  and (last_idle_event_at is null or last_idle_event_at < coalesce(last_customer_msg_at, created_at))
                order by coalesce(last_customer_msg_at, created_at) asc
                limit ?
                """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> new IdleCandidateRow(
                rs.getString("id"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("last_customer_msg_at") == null ? null : rs.getTimestamp("last_customer_msg_at").toInstant(),
                rs.getTimestamp("last_idle_event_at") == null ? null : rs.getTimestamp("last_idle_event_at").toInstant()
        ), tenantId, Timestamp.from(cutoff), safeLimit);
    }

    /**
     * List conversations that have been inactive since {@code lastMsgBefore}.
     *
     * Only returns non-closed conversations.
     */
    public List<InactiveConversationRow> listInactiveConversations(String tenantId, Instant lastMsgBefore, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        var sql = """
            select id, last_msg_at
            from conversation
            where tenant_id = ?
              and status <> 'closed'
              and closed_at is null
              and last_msg_at < ?
            order by last_msg_at asc
            limit ?
            """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new InactiveConversationRow(
                rs.getString("id"),
                rs.getTimestamp("last_msg_at").toInstant()
        ), tenantId, Timestamp.from(lastMsgBefore), safeLimit);
    }

    public List<ConversationSummary> listInbox(String tenantId, String status) {
        var sql = """
              select c.id, c.status, c.channel, c.subject, c.assigned_agent_user_id,
                   c.site_id, c.visitor_id,
                   v.name as visitor_name, v.email as visitor_email,
                   false as starred,
                    0 as unread_count,
                    extract(epoch from c.created_at)::bigint as created_at_epoch,
                    extract(epoch from c.last_msg_at)::bigint as last_msg_at_epoch,
                    extract(epoch from c.closed_at)::bigint as closed_at_epoch,
                    extract(epoch from c.last_customer_msg_at)::bigint as last_customer_msg_at_epoch,
                    extract(epoch from c.last_idle_event_at)::bigint as last_idle_event_at_epoch,
                    c.last_archived_reason as last_archived_reason,
                    c.last_archived_inactivity_minutes as last_archived_inactivity_minutes,
                    (
                        select m.sender_type
                        from message m
                        where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                        order by m.created_at desc, m.id desc
                        limit 1
                    ) as last_message_sender_type,
                    (
                        select m.content_type
                        from message m
                        where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                        order by m.created_at desc, m.id desc
                        limit 1
                    ) as last_message_content_type,
                    (
                        select m.content_jsonb
                        from message m
                        where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                        order by m.created_at desc, m.id desc
                        limit 1
                    ) as last_message_content_json
                        ,(
                            select extract(epoch from m.created_at)::bigint
                            from message m
                            where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                            order by m.created_at desc, m.id desc
                            limit 1
                        ) as last_message_created_at
            from conversation c
            left join visitor v on v.id = c.visitor_id and v.site_id = c.site_id
            where c.tenant_id = ?
            """;
        if (status != null && !status.isBlank()) {
            sql += " and status = ?";
            sql += " order by last_msg_at desc limit 50";
            return jdbcTemplate.query(sql, (rs, rowNum) -> new ConversationSummary(
                    rs.getString("id"),
                    rs.getString("status"),
                    rs.getString("channel"),
                    rs.getString("subject"),
                rs.getString("assigned_agent_user_id"),
                rs.getString("site_id"),
                rs.getString("visitor_id"),
                rs.getString("visitor_name"),
                rs.getString("visitor_email"),
                rs.getBoolean("starred"),
                rs.getInt("unread_count"),
                rs.getString("last_message_sender_type"),
                rs.getString("last_message_content_type"),
                toLastMessagePreview(rs.getString("last_message_content_type"), rs.getString("last_message_content_json")),
                rs.getLong("last_message_created_at") > 0 ? rs.getLong("last_message_created_at") : rs.getLong("last_msg_at_epoch"),
                rs.getLong("created_at_epoch"),
                rs.getLong("last_msg_at_epoch"),
                rs.getObject("closed_at_epoch") == null ? null : rs.getLong("closed_at_epoch"),
                rs.getObject("last_customer_msg_at_epoch") == null ? null : rs.getLong("last_customer_msg_at_epoch"),
                rs.getObject("last_idle_event_at_epoch") == null ? null : rs.getLong("last_idle_event_at_epoch"),
                rs.getString("last_archived_reason"),
                rs.getObject("last_archived_inactivity_minutes") == null ? null : rs.getLong("last_archived_inactivity_minutes")
            ), tenantId, status);
        }
        sql += " order by last_msg_at desc limit 50";
        return jdbcTemplate.query(sql, (rs, rowNum) -> new ConversationSummary(
                rs.getString("id"),
                rs.getString("status"),
                rs.getString("channel"),
                rs.getString("subject"),
            rs.getString("assigned_agent_user_id"),
            rs.getString("site_id"),
            rs.getString("visitor_id"),
            rs.getString("visitor_name"),
            rs.getString("visitor_email"),
            rs.getBoolean("starred"),
            rs.getInt("unread_count"),
            rs.getString("last_message_sender_type"),
            rs.getString("last_message_content_type"),
            toLastMessagePreview(rs.getString("last_message_content_type"), rs.getString("last_message_content_json")),
            rs.getLong("last_message_created_at") > 0 ? rs.getLong("last_message_created_at") : rs.getLong("last_msg_at_epoch"),
            rs.getLong("created_at_epoch"),
            rs.getLong("last_msg_at_epoch"),
            rs.getObject("closed_at_epoch") == null ? null : rs.getLong("closed_at_epoch"),
            rs.getObject("last_customer_msg_at_epoch") == null ? null : rs.getLong("last_customer_msg_at_epoch"),
            rs.getObject("last_idle_event_at_epoch") == null ? null : rs.getLong("last_idle_event_at_epoch"),
            rs.getString("last_archived_reason"),
            rs.getObject("last_archived_inactivity_minutes") == null ? null : rs.getLong("last_archived_inactivity_minutes")
        ), tenantId);
    }

    public List<ConversationSummary> listVisibleToAgent(String tenantId, String agentUserId, Set<String> subscribedConversationIds, String status, boolean starredOnly) {
        var sql = new StringBuilder();
        sql.append("select c.id, c.status, c.channel, c.subject, c.assigned_agent_user_id, ");
        sql.append("       c.site_id, c.visitor_id, v.name as visitor_name, v.email as visitor_email, ");
        sql.append("       coalesce(cm.starred, false) as starred ");
        sql.append("     , extract(epoch from c.created_at)::bigint as created_at_epoch ");
        sql.append("     , extract(epoch from c.last_msg_at)::bigint as last_msg_at_epoch ");
        sql.append("     , extract(epoch from c.closed_at)::bigint as closed_at_epoch ");
        sql.append("     , extract(epoch from c.last_customer_msg_at)::bigint as last_customer_msg_at_epoch ");
        sql.append("     , extract(epoch from c.last_idle_event_at)::bigint as last_idle_event_at_epoch ");
        sql.append("     , c.last_archived_reason as last_archived_reason ");
        sql.append("     , c.last_archived_inactivity_minutes as last_archived_inactivity_minutes ");
        sql.append("     , coalesce((");
        sql.append("         select count(1) ");
        sql.append("         from message m ");
        sql.append("         where m.conversation_id = c.id ");
        sql.append("           and m.sender_type = 'customer' ");
        sql.append("           and m.created_at > coalesce((");
        sql.append("              select m2.created_at ");
        sql.append("              from message m2 ");
        sql.append("              where m2.conversation_id = c.id and m2.id = ms.last_read_msg_id ");
        sql.append("              limit 1");
        sql.append("           ), timestamp '1970-01-01 00:00:00') ");
        sql.append("     ), 0) as unread_count ");
        sql.append("   , (");
        sql.append("        select m.sender_type from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_sender_type ");
        sql.append("   , (");
        sql.append("        select m.content_type from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_content_type ");
        sql.append("   , (");
        sql.append("        select m.content_jsonb from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_content_json ");
        sql.append("   , (");
        sql.append("        select extract(epoch from m.created_at)::bigint from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_created_at ");
        sql.append("from conversation c ");
        sql.append("left join visitor v on v.id = c.visitor_id and v.site_id = c.site_id ");
        sql.append("left join conversation_mark cm on cm.tenant_id = c.tenant_id and cm.conversation_id = c.id and cm.user_id = ? ");
        sql.append("left join message_state ms on ms.conversation_id = c.id and ms.user_id = ? ");
        sql.append("where c.tenant_id = ? ");

        var args = new ArrayList<Object>();
        args.add(agentUserId);
        args.add(agentUserId);
        args.add(tenantId);

        sql.append("and (");
        sql.append("c.assigned_agent_user_id = ? ");
        args.add(agentUserId);

        // Queue view:
        // - If status=queued: show queued conversations even before assignment.
        // - If no status filter is provided: treat as inbox and include queued as well.
        boolean includeQueued = "queued".equals(status) || status == null || status.isBlank();
        if (includeQueued) {
            sql.append("or (c.status = 'queued' and c.assigned_agent_user_id is null) ");
        }
        sql.append(") ");

        if (status != null && !status.isBlank()) {
            sql.append("and c.status = ? ");
            args.add(status);
        } else {
            // Default inbox behavior: hide archived/closed conversations.
            // Closed conversations remain accessible via status=closed (Archives page).
            sql.append("and c.status <> 'closed' ");
            sql.append("and c.closed_at is null ");
        }

        if (starredOnly) {
            sql.append("and cm.starred = true ");
        }

        sql.append("order by c.last_msg_at desc limit 50");

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new ConversationSummary(
                rs.getString("id"),
                rs.getString("status"),
                rs.getString("channel"),
                rs.getString("subject"),
                rs.getString("assigned_agent_user_id"),
                rs.getString("site_id"),
                rs.getString("visitor_id"),
                rs.getString("visitor_name"),
                rs.getString("visitor_email"),
            rs.getBoolean("starred"),
            rs.getInt("unread_count"),
            rs.getString("last_message_sender_type"),
            rs.getString("last_message_content_type"),
            toLastMessagePreview(rs.getString("last_message_content_type"), rs.getString("last_message_content_json")),
            rs.getLong("last_message_created_at") > 0 ? rs.getLong("last_message_created_at") : rs.getLong("last_msg_at_epoch"),
            rs.getLong("created_at_epoch"),
            rs.getLong("last_msg_at_epoch"),
            rs.getObject("closed_at_epoch") == null ? null : rs.getLong("closed_at_epoch"),
            rs.getObject("last_customer_msg_at_epoch") == null ? null : rs.getLong("last_customer_msg_at_epoch"),
            rs.getObject("last_idle_event_at_epoch") == null ? null : rs.getLong("last_idle_event_at_epoch"),
            rs.getString("last_archived_reason"),
            rs.getObject("last_archived_inactivity_minutes") == null ? null : rs.getLong("last_archived_inactivity_minutes")
        ), args.toArray());
    }

    /**
     * Archives view: list all closed conversations within a tenant for an agent/admin.
     */
    public List<ConversationSummary> listClosedForAgent(String tenantId, String agentUserId, boolean starredOnly) {
        var sql = new StringBuilder();
        sql.append("select c.id, c.status, c.channel, c.subject, c.assigned_agent_user_id, ");
        sql.append("       c.site_id, c.visitor_id, v.name as visitor_name, v.email as visitor_email, ");
        sql.append("       coalesce(cm.starred, false) as starred ");
        sql.append("     , extract(epoch from c.created_at)::bigint as created_at_epoch ");
        sql.append("     , extract(epoch from c.last_msg_at)::bigint as last_msg_at_epoch ");
        sql.append("     , extract(epoch from c.closed_at)::bigint as closed_at_epoch ");
        sql.append("     , extract(epoch from c.last_customer_msg_at)::bigint as last_customer_msg_at_epoch ");
        sql.append("     , extract(epoch from c.last_idle_event_at)::bigint as last_idle_event_at_epoch ");
        sql.append("     , c.last_archived_reason as last_archived_reason ");
        sql.append("     , c.last_archived_inactivity_minutes as last_archived_inactivity_minutes ");
        sql.append("     , coalesce((");
        sql.append("         select count(1) ");
        sql.append("         from message m ");
        sql.append("         where m.conversation_id = c.id ");
        sql.append("           and m.sender_type = 'customer' ");
        sql.append("           and m.created_at > coalesce((");
        sql.append("              select m2.created_at ");
        sql.append("              from message m2 ");
        sql.append("              where m2.conversation_id = c.id and m2.id = ms.last_read_msg_id ");
        sql.append("              limit 1");
        sql.append("           ), timestamp '1970-01-01 00:00:00') ");
        sql.append("     ), 0) as unread_count ");
        sql.append("   , (");
        sql.append("        select m.sender_type from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_sender_type ");
        sql.append("   , (");
        sql.append("        select m.content_type from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_content_type ");
        sql.append("   , (");
        sql.append("        select m.content_jsonb from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_content_json ");
        sql.append("   , (");
        sql.append("        select extract(epoch from m.created_at)::bigint from message m ");
        sql.append("        where m.tenant_id = c.tenant_id and m.conversation_id = c.id ");
        sql.append("        order by m.created_at desc, m.id desc limit 1");
        sql.append("     ) as last_message_created_at ");
        sql.append("from conversation c ");
        sql.append("left join visitor v on v.id = c.visitor_id and v.site_id = c.site_id ");
        sql.append("left join conversation_mark cm on cm.tenant_id = c.tenant_id and cm.conversation_id = c.id and cm.user_id = ? ");
        sql.append("left join message_state ms on ms.conversation_id = c.id and ms.user_id = ? ");
        sql.append("where c.tenant_id = ? ");
        sql.append("  and c.status = 'closed' ");

        var args = new ArrayList<Object>();
        args.add(agentUserId);
        args.add(agentUserId);
        args.add(tenantId);

        if (starredOnly) {
            sql.append("and cm.starred = true ");
        }

        sql.append("order by c.closed_at desc nulls last, c.last_msg_at desc limit 50");

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new ConversationSummary(
                rs.getString("id"),
                rs.getString("status"),
                rs.getString("channel"),
                rs.getString("subject"),
                rs.getString("assigned_agent_user_id"),
                rs.getString("site_id"),
                rs.getString("visitor_id"),
                rs.getString("visitor_name"),
                rs.getString("visitor_email"),
                rs.getBoolean("starred"),
            rs.getInt("unread_count"),
            rs.getString("last_message_sender_type"),
            rs.getString("last_message_content_type"),
                toLastMessagePreview(rs.getString("last_message_content_type"), rs.getString("last_message_content_json")),
                rs.getLong("last_message_created_at") > 0 ? rs.getLong("last_message_created_at") : rs.getLong("last_msg_at_epoch"),
                rs.getLong("created_at_epoch"),
                rs.getLong("last_msg_at_epoch"),
                rs.getObject("closed_at_epoch") == null ? null : rs.getLong("closed_at_epoch"),
                rs.getObject("last_customer_msg_at_epoch") == null ? null : rs.getLong("last_customer_msg_at_epoch"),
                rs.getObject("last_idle_event_at_epoch") == null ? null : rs.getLong("last_idle_event_at_epoch"),
                rs.getString("last_archived_reason"),
                rs.getObject("last_archived_inactivity_minutes") == null ? null : rs.getLong("last_archived_inactivity_minutes")
        ), args.toArray());
    }

    public List<ConversationSummary> listByCustomer(String tenantId, String customerUserId, String status) {
        var sql = """
            select c.id, c.status, c.channel, c.subject, c.assigned_agent_user_id,
                   c.site_id, c.visitor_id,
                   v.name as visitor_name, v.email as visitor_email,
                   false as starred,
                    0 as unread_count,
                    extract(epoch from c.created_at)::bigint as created_at_epoch,
                    extract(epoch from c.last_msg_at)::bigint as last_msg_at_epoch,
                    extract(epoch from c.closed_at)::bigint as closed_at_epoch,
                    extract(epoch from c.last_customer_msg_at)::bigint as last_customer_msg_at_epoch,
                    extract(epoch from c.last_idle_event_at)::bigint as last_idle_event_at_epoch,
                    c.last_archived_reason as last_archived_reason,
                    c.last_archived_inactivity_minutes as last_archived_inactivity_minutes,
                    (
                        select m.sender_type
                        from message m
                        where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                        order by m.created_at desc, m.id desc
                        limit 1
                    ) as last_message_sender_type,
                    (
                        select m.content_type
                        from message m
                        where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                        order by m.created_at desc, m.id desc
                        limit 1
                    ) as last_message_content_type,
                    (
                        select m.content_jsonb
                        from message m
                        where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                        order by m.created_at desc, m.id desc
                        limit 1
                    ) as last_message_content_json
                        ,(
                            select extract(epoch from m.created_at)::bigint
                            from message m
                            where m.tenant_id = c.tenant_id and m.conversation_id = c.id
                            order by m.created_at desc, m.id desc
                            limit 1
                        ) as last_message_created_at
            from conversation c
            left join visitor v on v.id = c.visitor_id and v.site_id = c.site_id
            where c.tenant_id = ? and c.customer_user_id = ?
            """;
        if (status != null && !status.isBlank()) {
            sql += " and status = ?";
            sql += " order by last_msg_at desc limit 50";
            return jdbcTemplate.query(sql, (rs, rowNum) -> new ConversationSummary(
                    rs.getString("id"),
                    rs.getString("status"),
                    rs.getString("channel"),
                    rs.getString("subject"),
                rs.getString("assigned_agent_user_id"),
                rs.getString("site_id"),
                rs.getString("visitor_id"),
                rs.getString("visitor_name"),
                rs.getString("visitor_email"),
                rs.getBoolean("starred"),
                rs.getInt("unread_count"),
                rs.getString("last_message_sender_type"),
                rs.getString("last_message_content_type"),
                toLastMessagePreview(rs.getString("last_message_content_type"), rs.getString("last_message_content_json")),
                rs.getLong("last_message_created_at") > 0 ? rs.getLong("last_message_created_at") : rs.getLong("last_msg_at_epoch"),
                rs.getLong("created_at_epoch"),
                rs.getLong("last_msg_at_epoch"),
                rs.getObject("closed_at_epoch") == null ? null : rs.getLong("closed_at_epoch"),
                rs.getObject("last_customer_msg_at_epoch") == null ? null : rs.getLong("last_customer_msg_at_epoch"),
                rs.getObject("last_idle_event_at_epoch") == null ? null : rs.getLong("last_idle_event_at_epoch"),
                rs.getString("last_archived_reason"),
                rs.getObject("last_archived_inactivity_minutes") == null ? null : rs.getLong("last_archived_inactivity_minutes")
            ), tenantId, customerUserId, status);
        }
        sql += " order by last_msg_at desc limit 50";
        return jdbcTemplate.query(sql, (rs, rowNum) -> new ConversationSummary(
                rs.getString("id"),
                rs.getString("status"),
                rs.getString("channel"),
                rs.getString("subject"),
            rs.getString("assigned_agent_user_id"),
            rs.getString("site_id"),
            rs.getString("visitor_id"),
            rs.getString("visitor_name"),
            rs.getString("visitor_email"),
            rs.getBoolean("starred"),
            rs.getInt("unread_count"),
            rs.getString("last_message_sender_type"),
            rs.getString("last_message_content_type"),
            toLastMessagePreview(rs.getString("last_message_content_type"), rs.getString("last_message_content_json")),
            rs.getLong("last_message_created_at") > 0 ? rs.getLong("last_message_created_at") : rs.getLong("last_msg_at_epoch"),
            rs.getLong("created_at_epoch"),
            rs.getLong("last_msg_at_epoch"),
            rs.getObject("closed_at_epoch") == null ? null : rs.getLong("closed_at_epoch"),
            rs.getObject("last_customer_msg_at_epoch") == null ? null : rs.getLong("last_customer_msg_at_epoch"),
            rs.getObject("last_idle_event_at_epoch") == null ? null : rs.getLong("last_idle_event_at_epoch"),
            rs.getString("last_archived_reason"),
            rs.getObject("last_archived_inactivity_minutes") == null ? null : rs.getLong("last_archived_inactivity_minutes")
        ), tenantId, customerUserId);
    }
}
