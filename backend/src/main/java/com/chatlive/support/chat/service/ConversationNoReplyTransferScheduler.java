package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.ChatInactivityTimeoutsRepository;
import com.chatlive.support.chat.repo.PgAdvisoryLockRepository;
import com.chatlive.support.chat.repo.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
public class ConversationNoReplyTransferScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConversationNoReplyTransferScheduler.class);

    private final TenantRepository tenantRepository;
    private final PgAdvisoryLockRepository lockRepository;
    private final ChatInactivityTimeoutsRepository inactivityTimeoutsRepository;
    private final com.chatlive.support.chat.repo.ConversationRepository conversationRepository;
    private final ConversationNoReplyTransferService transferService;

    private final boolean defaultEnabled;
    private final int defaultMinutes;
    private final int batchSize;

    public ConversationNoReplyTransferScheduler(
            TenantRepository tenantRepository,
            PgAdvisoryLockRepository lockRepository,
            ChatInactivityTimeoutsRepository inactivityTimeoutsRepository,
            com.chatlive.support.chat.repo.ConversationRepository conversationRepository,
            ConversationNoReplyTransferService transferService,
            @Value("${app.chat.agent-no-reply-transfer.enabled:true}") boolean defaultEnabled,
            @Value("${app.chat.agent-no-reply-transfer.minutes:3}") int defaultMinutes,
            @Value("${app.chat.agent-no-reply-transfer.batch-size:50}") int batchSize
    ) {
        this.tenantRepository = tenantRepository;
        this.lockRepository = lockRepository;
        this.inactivityTimeoutsRepository = inactivityTimeoutsRepository;
        this.conversationRepository = conversationRepository;
        this.transferService = transferService;
        this.defaultEnabled = defaultEnabled;
        this.defaultMinutes = clampMinutes(defaultMinutes);
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
    }

    @Scheduled(fixedDelayString = "${app.chat.agent-no-reply-transfer.scan-interval-ms:60000}")
    public void scanAndTransfer() {
        Instant now = Instant.now();

        for (var tenantId : tenantRepository.listTenantIds()) {
            var cfg = inactivityTimeoutsRepository.findByTenantId(tenantId).orElse(null);
            boolean enabled = cfg == null ? defaultEnabled : cfg.agentNoReplyTransferEnabled();
            if (!enabled) {
                continue;
            }

            int minutes = cfg == null ? defaultMinutes : clampMinutes(cfg.agentNoReplyTransferMinutes());
            Instant cutoff = now.minus(Duration.ofMinutes(minutes));

            var lockKey = "no_reply_transfer:" + tenantId;
            if (!lockRepository.tryLock(lockKey)) {
                continue;
            }

            int transferred = 0;
            try {
                var rows = conversationRepository.listNoReplyTransferCandidates(tenantId, cutoff, batchSize);
                for (var row : rows) {
                    try {
                        boolean ok = transferService.transferBecauseAgentDidNotReply(tenantId, row);
                        if (ok) {
                            transferred++;
                        }
                    } catch (Exception e) {
                        log.warn("no_reply_transfer_failed tenant={} conversationId={}", tenantId, row.id(), e);
                    }
                }
                if (transferred > 0) {
                    log.info("no_reply_transfer tenant={} transferred={}", tenantId, transferred);
                }
            } catch (Exception e) {
                log.warn("no_reply_transfer_scan_failed tenant={}", tenantId, e);
            } finally {
                lockRepository.unlock(lockKey);
            }
        }
    }

    private static int clampMinutes(int minutes) {
        return Math.max(1, Math.min(minutes, 365 * 24 * 60));
    }
}
