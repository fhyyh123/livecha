package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.AssignmentStrategyConfigRepository;
import com.chatlive.support.chat.repo.ChatFileSharingSettingsRepository;
import com.chatlive.support.chat.repo.ChatInactivityTimeoutsRepository;
import com.chatlive.support.chat.repo.ChatTranscriptForwardingSettingsRepository;
import com.chatlive.support.common.api.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/chat-settings")
public class AdminChatSettingsController {

    private final JwtService jwtService;
    private final ChatInactivityTimeoutsRepository inactivityTimeoutsRepository;
    private final ChatFileSharingSettingsRepository fileSharingSettingsRepository;
    private final AssignmentStrategyConfigRepository assignmentStrategyConfigRepository;
    private final ChatTranscriptForwardingSettingsRepository transcriptForwardingSettingsRepository;

    private final String defaultAssignmentStrategyKey;

    private final boolean defaultAgentNoReplyTransferEnabled;
    private final int defaultAgentNoReplyTransferMinutes;
    private final boolean defaultVisitorIdleEnabled;
    private final int defaultVisitorIdleMinutes;
    private final boolean defaultInactivityArchiveEnabled;
    private final int defaultInactivityArchiveMinutes;

    private final boolean defaultVisitorFileEnabled;
    private final boolean defaultAgentFileEnabled;

    public AdminChatSettingsController(
            JwtService jwtService,
            ChatInactivityTimeoutsRepository inactivityTimeoutsRepository,
            ChatFileSharingSettingsRepository fileSharingSettingsRepository,
            AssignmentStrategyConfigRepository assignmentStrategyConfigRepository,
            ChatTranscriptForwardingSettingsRepository transcriptForwardingSettingsRepository,
            @Value("${app.chat.agent-no-reply-transfer.enabled:true}") boolean defaultAgentNoReplyTransferEnabled,
            @Value("${app.chat.agent-no-reply-transfer.minutes:3}") int defaultAgentNoReplyTransferMinutes,
            @Value("${app.chat.visitor-idle.enabled:true}") boolean defaultVisitorIdleEnabled,
            @Value("${app.chat.visitor-idle.minutes:10}") int defaultVisitorIdleMinutes,
            @Value("${app.conversation.inactivity-archive.enabled:true}") boolean defaultInactivityArchiveEnabled,
            @Value("${app.conversation.inactivity-archive.minutes:60}") int defaultInactivityArchiveMinutes,
            @Value("${app.chat.file-sharing.visitor-enabled:true}") boolean defaultVisitorFileEnabled,
            @Value("${app.chat.file-sharing.agent-enabled:true}") boolean defaultAgentFileEnabled,
            @Value("${app.assignment.strategy:round_robin}") String defaultAssignmentStrategyKey
    ) {
        this.jwtService = jwtService;
        this.inactivityTimeoutsRepository = inactivityTimeoutsRepository;
        this.fileSharingSettingsRepository = fileSharingSettingsRepository;
        this.assignmentStrategyConfigRepository = assignmentStrategyConfigRepository;
        this.transcriptForwardingSettingsRepository = transcriptForwardingSettingsRepository;
        this.defaultAgentNoReplyTransferEnabled = defaultAgentNoReplyTransferEnabled;
        this.defaultAgentNoReplyTransferMinutes = clampMinutes(defaultAgentNoReplyTransferMinutes);
        this.defaultVisitorIdleEnabled = defaultVisitorIdleEnabled;
        this.defaultVisitorIdleMinutes = clampMinutes(defaultVisitorIdleMinutes);
        this.defaultInactivityArchiveEnabled = defaultInactivityArchiveEnabled;
        this.defaultInactivityArchiveMinutes = clampMinutes(defaultInactivityArchiveMinutes);

        this.defaultVisitorFileEnabled = defaultVisitorFileEnabled;
        this.defaultAgentFileEnabled = defaultAgentFileEnabled;

        this.defaultAssignmentStrategyKey = normalizeStrategyKey(defaultAssignmentStrategyKey);
    }

    public record TranscriptForwardingDto(List<String> emails) {
    }

    @GetMapping("/transcript-forwarding")
    public ApiResponse<TranscriptForwardingDto> getTranscriptForwarding(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdminClaims(authorization);
        var row = transcriptForwardingSettingsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new TranscriptForwardingDto(List.of()));
        }

        var email = row.forwardToEmail();
        if (email == null || email.trim().isBlank()) {
            return ApiResponse.ok(new TranscriptForwardingDto(List.of()));
        }
        return ApiResponse.ok(new TranscriptForwardingDto(List.of(email.trim())));
    }

    @PutMapping("/transcript-forwarding")
    public ApiResponse<TranscriptForwardingDto> putTranscriptForwarding(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody TranscriptForwardingDto req
    ) {
        var claims = requireAdminClaims(authorization);

        var list = req == null ? List.<String>of() : (req.emails() == null ? List.<String>of() : req.emails());
        var cleaned = new ArrayList<String>();
        for (var e : list) {
            if (e == null) continue;
            var t = e.trim();
            if (t.isBlank()) continue;
            if (!isValidEmail(t)) throw new IllegalArgumentException("invalid_email");
            if (!cleaned.contains(t)) cleaned.add(t);
        }
        if (cleaned.size() > 1) throw new IllegalArgumentException("max_1_email");

        var email = cleaned.isEmpty() ? null : cleaned.get(0);
        transcriptForwardingSettingsRepository.upsert(claims.tenantId(), email);
        return getTranscriptForwarding(authorization);
    }

    public record ChatAssignmentDto(String mode) {
    }

    @GetMapping("/chat-assignment")
    public ApiResponse<ChatAssignmentDto> getChatAssignment(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "group_id", required = false) String groupId
    ) {
        var claims = requireAdminClaims(authorization);
        var groupKey = normalizeGroupKey(groupId);

        var strategyKey = assignmentStrategyConfigRepository.findStrategyKey(claims.tenantId(), groupKey)
                .orElse(defaultAssignmentStrategyKey);
        strategyKey = normalizeStrategyKey(strategyKey);

        var mode = "manual".equals(strategyKey) ? "manual" : "auto";
        return ApiResponse.ok(new ChatAssignmentDto(mode));
    }

    @PutMapping("/chat-assignment")
    public ApiResponse<ChatAssignmentDto> putChatAssignment(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "group_id", required = false) String groupId,
            @RequestBody ChatAssignmentDto req
    ) {
        var claims = requireAdminClaims(authorization);
        var groupKey = normalizeGroupKey(groupId);
        var mode = (req == null || req.mode() == null) ? "auto" : req.mode().trim().toLowerCase();

        var strategyKey = "manual".equals(mode) ? "manual" : "round_robin";
        assignmentStrategyConfigRepository.upsert(claims.tenantId(), groupKey, strategyKey);
        return getChatAssignment(authorization, groupId);
    }

    @GetMapping("/inactivity-timeouts")
    public ApiResponse<InactivityTimeoutsDto> get(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var claims = requireAdminClaims(authorization);
        var row = inactivityTimeoutsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new InactivityTimeoutsDto(
                defaultAgentNoReplyTransferEnabled,
                defaultAgentNoReplyTransferMinutes,
                defaultVisitorIdleEnabled,
                defaultVisitorIdleMinutes,
                defaultInactivityArchiveEnabled,
                defaultInactivityArchiveMinutes
            ));
        }
        return ApiResponse.ok(new InactivityTimeoutsDto(
            row.agentNoReplyTransferEnabled(),
            clampMinutes(row.agentNoReplyTransferMinutes()),
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

        boolean agentNoReplyTransferEnabled = req == null ? defaultAgentNoReplyTransferEnabled : req.agent_no_reply_transfer_enabled();
        int agentNoReplyTransferMinutes = clampMinutes(req == null ? defaultAgentNoReplyTransferMinutes : req.agent_no_reply_transfer_minutes());

        boolean visitorIdleEnabled = req == null ? defaultVisitorIdleEnabled : req.visitor_idle_enabled();
        boolean inactivityArchiveEnabled = req == null ? defaultInactivityArchiveEnabled : req.inactivity_archive_enabled();

        int visitorIdleMinutes = clampMinutes(req == null ? defaultVisitorIdleMinutes : req.visitor_idle_minutes());
        int inactivityArchiveMinutes = clampMinutes(req == null ? defaultInactivityArchiveMinutes : req.inactivity_archive_minutes());

        inactivityTimeoutsRepository.upsert(
            claims.tenantId(),
            agentNoReplyTransferEnabled,
            agentNoReplyTransferMinutes,
            visitorIdleEnabled,
            visitorIdleMinutes,
            inactivityArchiveEnabled,
            inactivityArchiveMinutes
        );

        var row = inactivityTimeoutsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new InactivityTimeoutsDto(
                defaultAgentNoReplyTransferEnabled,
                defaultAgentNoReplyTransferMinutes,
                defaultVisitorIdleEnabled,
                defaultVisitorIdleMinutes,
                defaultInactivityArchiveEnabled,
                defaultInactivityArchiveMinutes
            ));
        }
        return ApiResponse.ok(new InactivityTimeoutsDto(
            row.agentNoReplyTransferEnabled(),
            clampMinutes(row.agentNoReplyTransferMinutes()),
            row.visitorIdleEnabled(),
            clampMinutes(row.visitorIdleMinutes()),
            row.inactivityArchiveEnabled(),
            clampMinutes(row.inactivityArchiveMinutes())
        ));
    }

        @GetMapping("/file-sharing")
        public ApiResponse<FileSharingDto> getFileSharing(
            @RequestHeader(value = "Authorization", required = false) String authorization
        ) {
        var claims = requireAdminClaims(authorization);
        var row = fileSharingSettingsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new FileSharingDto(
                defaultVisitorFileEnabled,
                defaultAgentFileEnabled
            ));
        }

        return ApiResponse.ok(new FileSharingDto(
            row.visitorFileEnabled(),
            row.agentFileEnabled()
        ));
        }

        @PutMapping("/file-sharing")
        public ApiResponse<FileSharingDto> putFileSharing(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody FileSharingDto req
        ) {
        var claims = requireAdminClaims(authorization);

        boolean visitorEnabled = req == null ? defaultVisitorFileEnabled : req.visitor_file_enabled();
        boolean agentEnabled = req == null ? defaultAgentFileEnabled : req.agent_file_enabled();

        fileSharingSettingsRepository.upsert(claims.tenantId(), visitorEnabled, agentEnabled);

        var row = fileSharingSettingsRepository.findByTenantId(claims.tenantId()).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new FileSharingDto(
                defaultVisitorFileEnabled,
                defaultAgentFileEnabled
            ));
        }

        return ApiResponse.ok(new FileSharingDto(
            row.visitorFileEnabled(),
            row.agentFileEnabled()
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

    private static String normalizeGroupKey(String groupKey) {
        var gk = groupKey == null ? "" : groupKey.trim();
        if (gk.isBlank()) return "*";
        return gk;
    }

    private static String normalizeStrategyKey(String raw) {
        var key = (raw == null ? "" : raw.trim().toLowerCase()).replace('-', '_');
        if (key.isBlank()) return "round_robin";
        return switch (key) {
            case "roundrobin" -> "round_robin";
            case "leastopen" -> "least_open";
            default -> key;
        };
    }

    private static boolean isValidEmail(String input) {
        var s = input == null ? "" : input.trim();
        if (s.isBlank()) return false;
        if (s.length() > 254) return false;
        // Simple sanity check; avoids heavy RFC parsing.
        return s.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    }
}
