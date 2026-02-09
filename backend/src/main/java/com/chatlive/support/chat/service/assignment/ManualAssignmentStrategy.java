package com.chatlive.support.chat.service.assignment;

import com.chatlive.support.chat.repo.AgentProfileRepository;
import org.springframework.stereotype.Component;

/**
 * Manual selection mode (LiveChat-like): do not auto-assign.
 * Conversations stay queued until an agent explicitly claims them.
 */
@Component("manual")
public class ManualAssignmentStrategy implements AssignmentStrategy {

    @Override
    public AgentProfileRepository.AgentCandidateRow select(AssignmentContext ctx) {
        return null;
    }
}
