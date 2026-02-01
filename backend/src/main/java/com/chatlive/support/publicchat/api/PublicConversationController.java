package com.chatlive.support.publicchat.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.api.MessageItem;
import com.chatlive.support.chat.api.MessagePage;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.publicchat.service.PublicConversationService;
import com.chatlive.support.publicchat.service.PublicConversationQueryService;
import com.chatlive.support.publicchat.api.PublicPageViewEventRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public")
public class PublicConversationController {

    private final JwtService jwtService;
    private final PublicConversationService publicConversationService;
    private final PublicConversationQueryService publicConversationQueryService;

    public PublicConversationController(
            JwtService jwtService,
            PublicConversationService publicConversationService,
            PublicConversationQueryService publicConversationQueryService
    ) {
        this.jwtService = jwtService;
        this.publicConversationService = publicConversationService;
        this.publicConversationQueryService = publicConversationQueryService;
    }

    @PostMapping("/conversations")
    public ApiResponse<CreateOrRecoverConversationResponse> createOrRecover(
            HttpServletRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody CreateOrRecoverConversationRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(publicConversationService.createOrRecover(request, claims, req));
    }

    @PostMapping("/conversations/{id}/messages")
    public ApiResponse<MessageItem> sendTextMessage(
            HttpServletRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @Valid @RequestBody PublicSendTextMessageRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(publicConversationService.sendText(request, claims, conversationId, req));
    }

    @PostMapping("/conversations/{id}/messages/file")
    public ApiResponse<MessageItem> sendFileMessage(
            HttpServletRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @Valid @RequestBody PublicSendFileMessageRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(publicConversationService.sendFile(request, claims, conversationId, req));
    }

        @GetMapping("/conversations/{id}")
        public ApiResponse<PublicConversationDetailResponse> getConversation(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId
        ) {
        var token = JwtService.extractBearerToken(authorization)
            .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        return ApiResponse.ok(publicConversationQueryService.getDetail(claims, conversationId));
        }

        @GetMapping("/conversations/{id}/messages")
        public ApiResponse<MessagePage> listMessages(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @RequestParam(value = "after_msg_id", required = false) String afterMsgId,
            @RequestParam(value = "limit", required = false, defaultValue = "50") int limit
        ) {
        var token = JwtService.extractBearerToken(authorization)
            .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        var safeLimit = Math.max(1, Math.min(limit, 200));
        return ApiResponse.ok(publicConversationQueryService.listMessagesPage(claims, conversationId, afterMsgId, safeLimit));
        }

        @PostMapping("/conversations/{id}/events/page_view")
        public ApiResponse<Boolean> recordPageView(
            HttpServletRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String conversationId,
            @Valid @RequestBody PublicPageViewEventRequest req
        ) {
        var token = JwtService.extractBearerToken(authorization)
            .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        publicConversationService.recordPageView(request, claims, conversationId, req);
        return ApiResponse.ok(Boolean.TRUE);
        }
}
