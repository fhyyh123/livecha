package com.chatlive.support.chat.service.assignment;

import com.chatlive.support.chat.repo.AgentProfileRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;

@Component("least_open")
public class LeastOpenAssignmentStrategy implements AssignmentStrategy {

    @Override
    public AgentProfileRepository.AgentCandidateRow select(AssignmentContext ctx) {
        if (ctx == null || ctx.candidates() == null || ctx.candidates().isEmpty()) return null;

        var candidates = ctx.candidates();
        var loads = ctx.activeLoads();

        int minActive = Integer.MAX_VALUE;
        var minList = new ArrayList<AgentProfileRepository.AgentCandidateRow>();

        for (var c : candidates) {
            var active = loads == null ? 0 : loads.getOrDefault(c.userId(), 0);
            if (active >= c.maxConcurrent()) {
                continue;
            }
            if (active < minActive) {
                minActive = active;
                minList.clear();
                minList.add(c);
            } else if (active == minActive) {
                minList.add(c);
            }
        }

        if (minList.isEmpty()) return null;

        // Fair tie-break among same-load candidates using cursor rotation
        var last = ctx.lastAgentUserId();
        int tieStartIdx = 0;
        if (last != null && !last.isBlank()) {
            for (int i = 0; i < minList.size(); i++) {
                if (last.equals(minList.get(i).userId())) {
                    tieStartIdx = (i + 1) % minList.size();
                    break;
                }
            }
        }

        return minList.get(tieStartIdx);
    }
}
