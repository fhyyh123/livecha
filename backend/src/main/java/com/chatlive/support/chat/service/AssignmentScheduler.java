package com.chatlive.support.chat.service;

import com.chatlive.support.chat.repo.PgAdvisoryLockRepository;
import com.chatlive.support.chat.repo.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class AssignmentScheduler {

    private static final Logger log = LoggerFactory.getLogger(AssignmentScheduler.class);

    private final TenantRepository tenantRepository;
    private final PgAdvisoryLockRepository lockRepository;
    private final AssignmentService assignmentService;
    private final int batchSize;

    public AssignmentScheduler(
            TenantRepository tenantRepository,
            PgAdvisoryLockRepository lockRepository,
            AssignmentService assignmentService,
            @Value("${app.assignment.queue-batch-size:50}") int batchSize
    ) {
        this.tenantRepository = tenantRepository;
        this.lockRepository = lockRepository;
        this.assignmentService = assignmentService;
        this.batchSize = Math.max(1, Math.min(batchSize, 500));
    }

    @Scheduled(fixedDelayString = "${app.assignment.queue-scan-interval-ms:5000}")
    public void scanAndAssignQueued() {
        for (var tenantId : tenantRepository.listTenantIds()) {
            var lockKey = "assign_queue:" + tenantId;
            if (!lockRepository.tryLock(lockKey)) {
                continue;
            }
            try {
                int assigned = assignmentService.tryAssignFromQueue(tenantId, batchSize);
                if (assigned > 0) {
                    log.info("queue_assign tenant={} assigned={}", tenantId, assigned);
                }
            } catch (Exception e) {
                log.warn("queue_assign_failed tenant={}", tenantId, e);
            } finally {
                lockRepository.unlock(lockKey);
            }
        }
    }
}
