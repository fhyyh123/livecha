package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.ChatInactivityTimeoutsRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.PgAdvisoryLockRepository;
import com.chatlive.support.chat.repo.TenantRepository;
import com.chatlive.support.chat.ws.WsBroadcaster;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
@ConditionalOnProperty(name = "app.chat.visitor-idle.enabled", havingValue = "true", matchIfMissing = true)
public class ConversationVisitorIdleScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConversationVisitorIdleScheduler.class);

    private final TenantRepository tenantRepository;
    private final PgAdvisoryLockRepository lockRepository;
    private final ConversationRepository conversationRepository;
    private final ChatInactivityTimeoutsRepository inactivityTimeoutsRepository;
    private final WsBroadcaster wsBroadcaster;

    private final boolean defaultVisitorIdleEnabled;
    private final int defaultVisitorIdleMinutes;
    private final int batchSize;

    public ConversationVisitorIdleScheduler(
            TenantRepository tenantRepository,
            PgAdvisoryLockRepository lockRepository,
            ConversationRepository conversationRepository,
            ChatInactivityTimeoutsRepository inactivityTimeoutsRepository,
            WsBroadcaster wsBroadcaster,
            @Value("${app.chat.visitor-idle.enabled:true}") boolean defaultVisitorIdleEnabled,
            @Value("${app.chat.visitor-idle.minutes:10}") int defaultVisitorIdleMinutes,
            @Value("${app.chat.visitor-idle.batch-size:50}") int batchSize
    ) {
        this.tenantRepository = tenantRepository;
        this.lockRepository = lockRepository;
        this.conversationRepository = conversationRepository;
        this.inactivityTimeoutsRepository = inactivityTimeoutsRepository;
        this.wsBroadcaster = wsBroadcaster;
        this.defaultVisitorIdleEnabled = defaultVisitorIdleEnabled;
        this.defaultVisitorIdleMinutes = clampMinutes(defaultVisitorIdleMinutes);
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
    }

    @Scheduled(fixedDelayString = "${app.chat.visitor-idle.scan-interval-ms:60000}")
    public void scanAndEmitVisitorIdleEvents() {
        Instant now = Instant.now();

        for (var tenantId : tenantRepository.listTenantIds()) {
            var cfg = inactivityTimeoutsRepository.findByTenantId(tenantId).orElse(null);
            boolean enabled = cfg == null ? defaultVisitorIdleEnabled : cfg.visitorIdleEnabled();
            if (!enabled) {
                continue;
            }

            int idleMinutes = cfg == null
                    ? defaultVisitorIdleMinutes
                    : clampMinutes(cfg.visitorIdleMinutes());
            Instant cutoff = now.minus(Duration.ofMinutes(idleMinutes));

            var lockKey = "visitor_idle:" + tenantId;
            if (!lockRepository.tryLock(lockKey)) {
                continue;
            }

            int emitted = 0;
            try {
                var rows = conversationRepository.listIdleCandidates(tenantId, cutoff, batchSize);
                for (var row : rows) {
                    var lastCustomerAt = row.lastCustomerMsgAt();
                    var activityAt = (lastCustomerAt == null) ? row.createdAt() : lastCustomerAt;
                    long idleForMinutes = Math.max(1, Duration.between(activityAt, now).toMinutes());

                    ObjectNode data = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                    data.put("mode", "visitor_inactivity");
                    data.put("idle_minutes", idleMinutes);
                    data.put("idle_for_minutes", idleForMinutes);
                    data.put("activity_at", activityAt.getEpochSecond());

                    try {
                        wsBroadcaster.broadcastConversationEvent(tenantId, row.id(), "idle", data);
                        conversationRepository.updateLastIdleEventAt(tenantId, row.id(), now);
                        emitted++;
                    } catch (Exception e) {
                        log.warn("visitor_idle_emit_failed tenant={} conversationId={}", tenantId, row.id(), e);
                    }
                }

                if (emitted > 0) {
                    log.info("visitor_idle tenant={} emitted={}", tenantId, emitted);
                }
            } catch (Exception e) {
                log.warn("visitor_idle_scan_failed tenant={}", tenantId, e);
            } finally {
                lockRepository.unlock(lockKey);
            }
        }
    }

    private static int clampMinutes(int minutes) {
        return Math.max(1, Math.min(minutes, 365 * 24 * 60));
    }
}
