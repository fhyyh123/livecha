package com.chatlive.support.publicchat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.api.MessagePage;
import com.chatlive.support.chat.repo.ConversationRepository;
import com.chatlive.support.chat.service.MessageService;
import com.chatlive.support.profile.service.AvatarUrlService;
import com.chatlive.support.publicchat.api.PublicConversationDetailResponse;
import org.springframework.stereotype.Service;

@Service
public class PublicConversationQueryService {

    private final ConversationRepository conversationRepository;
    private final MessageService messageService;
    private final AvatarUrlService avatarUrlService;

    public PublicConversationQueryService(
            ConversationRepository conversationRepository,
            MessageService messageService,
            AvatarUrlService avatarUrlService
    ) {
        this.conversationRepository = conversationRepository;
        this.messageService = messageService;
        this.avatarUrlService = avatarUrlService;
    }

    public PublicConversationDetailResponse getDetail(JwtClaims claims, String conversationId) {
        ensureVisitorClaims(claims);

        var access = conversationRepository.findAccess(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));

        if (!canVisitorAccess(claims, access)) {
            throw new IllegalArgumentException("forbidden");
        }

        var detail = conversationRepository.findDetail(claims.tenantId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("conversation_not_found"));

        var assignedAgentUserId = detail.assignedAgentUserId();
        var avatarView = avatarUrlService.getAgentAvatarView(assignedAgentUserId);

        return new PublicConversationDetailResponse(
                detail.id(),
                detail.status(),
                detail.channel(),
                detail.subject(),
            assignedAgentUserId,
            avatarView == null ? null : avatarView.display_name(),
            avatarView == null ? null : avatarView.avatar_url(),
                detail.createdAt().getEpochSecond(),
                detail.lastMsgAt().getEpochSecond()
        );
    }

    public MessagePage listMessagesPage(JwtClaims claims, String conversationId, String afterMsgId, int limit) {
        ensureVisitorClaims(claims);
        // MessageService 内部会做会话访问校验（含 visitor）
        return messageService.listMessagesPage(claims, conversationId, afterMsgId, limit);
    }

    private static void ensureVisitorClaims(JwtClaims claims) {
        if (claims == null || !"visitor".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.siteId() == null || claims.siteId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (claims.userId() == null || claims.userId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
    }

    private static boolean canVisitorAccess(JwtClaims claims, ConversationRepository.ConversationAccessRow conv) {
        return conv.siteId() != null
                && !conv.siteId().isBlank()
                && claims.siteId().equals(conv.siteId())
                && conv.visitorId() != null
                && !conv.visitorId().isBlank()
                && claims.userId().equals(conv.visitorId());
    }
}
