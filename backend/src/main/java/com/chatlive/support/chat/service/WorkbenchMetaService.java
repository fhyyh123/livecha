package com.chatlive.support.chat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.api.ConversationMetaResponse;
import com.chatlive.support.chat.repo.ConversationNoteRepository;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.repo.ConversationTagRepository;
import com.chatlive.support.chat.ws.WsSessionRegistry;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class WorkbenchMetaService {

    private final ConversationRepository conversationRepository;
    private final WsSessionRegistry wsSessionRegistry;
    private final ConversationTagRepository conversationTagRepository;
    private final ConversationNoteRepository conversationNoteRepository;

    public WorkbenchMetaService(
            ConversationRepository conversationRepository,
            WsSessionRegistry wsSessionRegistry,
            ConversationTagRepository conversationTagRepository,
            ConversationNoteRepository conversationNoteRepository
    ) {
        this.conversationRepository = conversationRepository;
        this.wsSessionRegistry = wsSessionRegistry;
        this.conversationTagRepository = conversationTagRepository;
        this.conversationNoteRepository = conversationNoteRepository;
    }

    public ConversationMetaResponse getMeta(JwtClaims claims, String conversationId) {
        var access = requireAccess(claims, conversationId);
        var tags = conversationTagRepository.listTags(claims.tenantId(), access.id());
        var note = conversationNoteRepository.findNote(claims.tenantId(), access.id(), claims.userId()).orElse(null);
        return new ConversationMetaResponse(tags, note);
    }

    public void setTags(JwtClaims claims, String conversationId, List<String> tags) {
        var access = requireAccess(claims, conversationId);
        conversationTagRepository.replaceTags(claims.tenantId(), access.id(), claims.userId(), tags);
    }

    public void setNote(JwtClaims claims, String conversationId, String note) {
        var access = requireAccess(claims, conversationId);
        conversationNoteRepository.upsertNote(claims.tenantId(), access.id(), claims.userId(), emptyToNull(note));
    }

    private ConversationRepository.ConversationAccessRow requireAccess(JwtClaims claims, String conversationId) {
        if (claims == null || claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (!("agent".equals(claims.role()) || "admin".equals(claims.role()))) {
            throw new IllegalArgumentException("forbidden");
        }
        if (conversationId == null || conversationId.isBlank()) {
            throw new IllegalArgumentException("missing_conversation_id");
        }

        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));

        if (claims.userId() != null && claims.userId().equals(access.assignedAgentUserId())) {
            return access;
        }
        if (claims.userId() != null && wsSessionRegistry.hasUserSubscribedConversation(claims.userId(), access.id())) {
            return access;
        }

        throw new IllegalArgumentException("forbidden");
    }

    private static String emptyToNull(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }
}
