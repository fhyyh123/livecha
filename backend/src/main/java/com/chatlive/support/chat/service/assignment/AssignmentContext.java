package com.chatlive.support.chat.service.assignment;

import com.chatlive.support.chat.repo.AgentProfileRepository;

import java.util.List;
import java.util.Map;

public record AssignmentContext(
        String tenantId,
        String groupKey,
        String lastAgentUserId,
        List<AgentProfileRepository.AgentCandidateRow> candidates,
        Map<String, Integer> activeLoads
) {
}
