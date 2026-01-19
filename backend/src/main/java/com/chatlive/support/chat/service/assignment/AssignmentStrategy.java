package com.chatlive.support.chat.service.assignment;

import com.chatlive.support.chat.repo.AgentProfileRepository;

public interface AssignmentStrategy {

    /**
     * @return selected agent, or null if no eligible candidate
     */
    AgentProfileRepository.AgentCandidateRow select(AssignmentContext ctx);
}
