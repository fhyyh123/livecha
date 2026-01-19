package com.chatlive.support.chat.service.assignment;

import com.chatlive.support.chat.repo.AgentProfileRepository;
import org.springframework.stereotype.Component;

@Component("round_robin")
public class RoundRobinAssignmentStrategy implements AssignmentStrategy {

    @Override
    public AgentProfileRepository.AgentCandidateRow select(AssignmentContext ctx) {
        if (ctx == null || ctx.candidates() == null || ctx.candidates().isEmpty()) return null;

        var candidates = ctx.candidates();
        var last = ctx.lastAgentUserId();

        int startIdx = 0;
        if (last != null && !last.isBlank()) {
            for (int i = 0; i < candidates.size(); i++) {
                if (last.equals(candidates.get(i).userId())) {
                    startIdx = (i + 1) % candidates.size();
                    break;
                }
            }
        }

        var loads = ctx.activeLoads();
        for (int offset = 0; offset < candidates.size(); offset++) {
            var c = candidates.get((startIdx + offset) % candidates.size());
            var active = loads == null ? 0 : loads.getOrDefault(c.userId(), 0);
            if (active < c.maxConcurrent()) {
                return c;
            }
        }

        return null;
    }
}
