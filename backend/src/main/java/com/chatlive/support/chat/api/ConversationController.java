package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.service.ConversationService;
import com.chatlive.support.chat.service.WorkbenchMetaService;
import com.chatlive.support.chat.service.MessageService;
import com.chatlive.support.chat.service.QuickReplyService;
import com.chatlive.support.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class ConversationController {
    private final ConversationService conversationService;
    private final JwtService jwtService;
    private final MessageService messageService;
        private final WorkbenchMetaService workbenchMetaService;
        private final QuickReplyService quickReplyService;

        public ConversationController(
                        ConversationService conversationService,
                        JwtService jwtService,
                        MessageService messageService,
                        WorkbenchMetaService workbenchMetaService,
                        QuickReplyService quickReplyService
        ) {
        this.conversationService = conversationService;
        this.jwtService = jwtService;
        this.messageService = messageService;
                this.workbenchMetaService = workbenchMetaService;
                this.quickReplyService = quickReplyService;
    }

    @PostMapping("/conversations")
    public ApiResponse<CreateConversationResponse> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody CreateConversationRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(conversationService.createConversation(claims, req));
    }

    @GetMapping("/conversations")
    public ApiResponse<List<ConversationSummary>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
                        @RequestParam(value = "status", required = false) String status,
                        @RequestParam(value = "starred_only", required = false) Boolean starredOnly
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
                return ApiResponse.ok(conversationService.listMyConversations(claims, status, Boolean.TRUE.equals(starredOnly)));
    }

        @GetMapping("/conversations/{id}")
        public ApiResponse<ConversationDetailResponse> getConversation(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @PathVariable("id") String conversationId
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                return ApiResponse.ok(conversationService.getConversationDetail(claims, conversationId));
        }

            @PutMapping("/conversations/{id}/star")
            public ApiResponse<Void> setStarred(
                    @RequestHeader(value = "Authorization", required = false) String authorization,
                    @PathVariable("id") String conversationId,
                    @Valid @RequestBody SetStarredRequest req
            ) {
                var token = JwtService.extractBearerToken(authorization)
                        .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                conversationService.setStarred(claims, conversationId, req.starred());
                return ApiResponse.ok(null);
            }

    @GetMapping("/conversations/{id}/messages")
    public ApiResponse<List<MessageItem>> listMessages(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @RequestParam(value = "after_msg_id", required = false) String afterMsgId,
            @RequestParam(value = "limit", required = false, defaultValue = "50") int limit
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        var safeLimit = Math.max(1, Math.min(limit, 200));
        return ApiResponse.ok(messageService.listMessages(claims, conversationId, afterMsgId, safeLimit));
    }

    @PostMapping("/conversations/{id}/close")
    public ApiResponse<Void> close(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @RequestBody(required = false) CloseConversationRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        conversationService.closeConversation(claims, conversationId, req == null ? null : req.reason());
        return ApiResponse.ok(null);
    }

    @PostMapping("/conversations/{id}/reopen")
    public ApiResponse<Void> reopen(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        conversationService.reopenConversation(claims, conversationId);
        return ApiResponse.ok(null);
    }

    @GetMapping("/conversations/{id}/meta")
    public ApiResponse<ConversationMetaResponse> getMeta(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(workbenchMetaService.getMeta(claims, conversationId));
    }

    @PutMapping("/conversations/{id}/tags")
    public ApiResponse<Void> setTags(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @Valid @RequestBody SetConversationTagsRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        workbenchMetaService.setTags(claims, conversationId, req.tags());
        return ApiResponse.ok(null);
    }

    @PutMapping("/conversations/{id}/note")
    public ApiResponse<Void> setNote(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @Valid @RequestBody SetConversationNoteRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        workbenchMetaService.setNote(claims, conversationId, req.note());
        return ApiResponse.ok(null);
    }

    @GetMapping("/quick-replies")
    public ApiResponse<List<QuickReplyItem>> listQuickReplies(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "q", required = false) String q,
            @RequestParam(value = "limit", required = false, defaultValue = "50") int limit
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(quickReplyService.list(claims, q, limit));
    }

    @PostMapping("/quick-replies")
    public ApiResponse<QuickReplyItem> createQuickReply(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody UpsertQuickReplyRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(quickReplyService.create(claims, req.title(), req.content()));
    }

    @PutMapping("/quick-replies/{id}")
    public ApiResponse<QuickReplyItem> updateQuickReply(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String id,
            @Valid @RequestBody UpsertQuickReplyRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(quickReplyService.update(claims, id, req.title(), req.content()));
    }

    @DeleteMapping("/quick-replies/{id}")
    public ApiResponse<Void> deleteQuickReply(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String id
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        quickReplyService.delete(claims, id);
        return ApiResponse.ok(null);
    }
}
