package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.ChatInactivityTimeoutsRepository;
import com.chatlive.support.chat.repo.PgAdvisoryLockRepository;
import com.chatlive.support.chat.repo.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
@ConditionalOnProperty(name = "app.conversation.inactivity-archive.enabled", havingValue = "true", matchIfMissing = true)
public class ConversationInactivityScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConversationInactivityScheduler.class);

    private final TenantRepository tenantRepository;
    private final PgAdvisoryLockRepository lockRepository;
    private final ConversationRepository conversationRepository;
    private final ConversationService conversationService;
    private final ChatInactivityTimeoutsRepository inactivityTimeoutsRepository;

    private final int defaultInactivityMinutes;
    private final int batchSize;

    public ConversationInactivityScheduler(
            TenantRepository tenantRepository,
            PgAdvisoryLockRepository lockRepository,
            ConversationRepository conversationRepository,
            ConversationService conversationService,
            ChatInactivityTimeoutsRepository inactivityTimeoutsRepository,
            @Value("${app.conversation.inactivity-archive.minutes:60}") int inactivityMinutes,
            @Value("${app.conversation.inactivity-archive.batch-size:50}") int batchSize
    ) {
        this.tenantRepository = tenantRepository;
        this.lockRepository = lockRepository;
        this.conversationRepository = conversationRepository;
        this.conversationService = conversationService;
        this.inactivityTimeoutsRepository = inactivityTimeoutsRepository;
        this.defaultInactivityMinutes = clampMinutes(inactivityMinutes);
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
    }

    @Scheduled(fixedDelayString = "${app.conversation.inactivity-archive.scan-interval-ms:60000}")
    public void scanAndArchiveInactive() {
        Instant now = Instant.now();

        for (var tenantId : tenantRepository.listTenantIds()) {
            var cfg = inactivityTimeoutsRepository.findByTenantId(tenantId).orElse(null);
            boolean enabled = cfg == null ? true : cfg.inactivityArchiveEnabled();
            if (!enabled) {
                continue;
            }

            int inactivityMinutes = cfg == null
                    ? defaultInactivityMinutes
                    : clampMinutes(cfg.inactivityArchiveMinutes());

            Instant cutoff = now.minus(Duration.ofMinutes(inactivityMinutes));

            var lockKey = "inactivity_archive:" + tenantId;
            if (!lockRepository.tryLock(lockKey)) {
                continue;
            }

            int archived = 0;
            try {
                var rows = conversationRepository.listInactiveConversations(tenantId, cutoff, batchSize);
                for (var row : rows) {
                    long mins = Math.max(1, Duration.between(row.lastMsgAt(), now).toMinutes());
                    try {
                        conversationService.closeConversationForInactivity(tenantId, row.id(), mins);
                        archived++;
                    } catch (Exception e) {
                        log.warn("inactivity_archive_failed tenant={} conversationId={}", tenantId, row.id(), e);
                    }
                }

                if (archived > 0) {
                    log.info("inactivity_archive tenant={} archived={}", tenantId, archived);
                }
            } catch (Exception e) {
                log.warn("inactivity_archive_scan_failed tenant={}", tenantId, e);
            } finally {
                lockRepository.unlock(lockKey);
            }
        }
    }

    private static int clampMinutes(int minutes) {
        return Math.max(1, Math.min(minutes, 365 * 24 * 60));
    }
}
