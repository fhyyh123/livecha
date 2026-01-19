package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.ChatInactivityTimeoutsRepository;
import com.chatlive.support.common.api.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/chat-settings")
public class AdminChatSettingsController {

    private final JwtService jwtService;
    private final ChatInactivityTimeoutsRepository inactivityTimeoutsRepository;

    private final boolean defaultVisitorIdleEnabled;
    private final int defaultVisitorIdleMinutes;
    private final boolean defaultInactivityArchiveEnabled;
    private final int defaultInactivityArchiveMinutes;

    public AdminChatSettingsController(
            JwtService jwtService,
            ChatInactivityTimeoutsRepository inactivityTimeoutsRepository,
            @Value("${app.chat.visitor-idle.enabled:true}") boolean defaultVisitorIdleEnabled,
            @Value("${app.chat.visitor-idle.minutes:10}") int defaultVisitorIdleMinutes,
            @Value("${app.conversation.inactivity-archive.enabled:true}") boolean defaultInactivityArchiveEnabled,
            @Value("${app.conversation.inactivity-archive.minutes:60}") int defaultInactivityArchiveMinutes
    ) {
        this.jwtService = jwtService;
        this.inactivityTimeoutsRepository = inactivityTimeoutsRepository;
        this.defaultVisitorIdleEnabled = defaultVisitorIdleEnabled;
        this.defaultVisitorIdleMinutes = clampMinutes(defaultVisitorIdleMinutes);
        this.defaultInactivityArchiveEnabled = defaultInactivityArchiveEnabled;
        this.defaultInactivityArchiveMinutes = clampMinutes(defaultInactivityArchiveMinutes);
    }

    @GetMapping("/inactivity-timeouts")
    public ApiResponse<InactivityTimeoutsDto> get(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdminClaims(authorization);
        var row = inactivityTimeoutsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new InactivityTimeoutsDto(
                defaultVisitorIdleEnabled,
                defaultVisitorIdleMinutes,
                defaultInactivityArchiveEnabled,
                defaultInactivityArchiveMinutes
            ));
        }
        return ApiResponse.ok(new InactivityTimeoutsDto(
            row.visitorIdleEnabled(),
            clampMinutes(row.visitorIdleMinutes()),
            row.inactivityArchiveEnabled(),
            clampMinutes(row.inactivityArchiveMinutes())
        ));
    }

    @PutMapping("/inactivity-timeouts")
    public ApiResponse<InactivityTimeoutsDto> put(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody InactivityTimeoutsDto req
    ) {
        var claims = requireAdminClaims(authorization);

        boolean visitorIdleEnabled = req == null ? defaultVisitorIdleEnabled : req.visitor_idle_enabled();
        boolean inactivityArchiveEnabled = req == null ? defaultInactivityArchiveEnabled : req.inactivity_archive_enabled();

        int visitorIdleMinutes = clampMinutes(req == null ? defaultVisitorIdleMinutes : req.visitor_idle_minutes());
        int inactivityArchiveMinutes = clampMinutes(req == null ? defaultInactivityArchiveMinutes : req.inactivity_archive_minutes());

        inactivityTimeoutsRepository.upsert(claims.tenantId(), visitorIdleEnabled, visitorIdleMinutes, inactivityArchiveEnabled, inactivityArchiveMinutes);

        var row = inactivityTimeoutsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new InactivityTimeoutsDto(
                defaultVisitorIdleEnabled,
                defaultVisitorIdleMinutes,
                defaultInactivityArchiveEnabled,
                defaultInactivityArchiveMinutes
            ));
        }
        return ApiResponse.ok(new InactivityTimeoutsDto(
            row.visitorIdleEnabled(),
            clampMinutes(row.visitorIdleMinutes()),
            row.inactivityArchiveEnabled(),
            clampMinutes(row.inactivityArchiveMinutes())
        ));
    }

    private JwtClaims requireAdminClaims(String authorization) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        return claims;
    }

    private static int clampMinutes(int minutes) {
        return Math.max(1, Math.min(minutes, 365 * 24 * 60));
    }
}
