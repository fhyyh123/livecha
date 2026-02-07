package com.chatlive.support.profile.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.profile.service.AgentAvatarService;
import com.chatlive.support.profile.service.AvatarUrlService;
import com.chatlive.support.user.repo.UserAccountRepository;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@RestController
@RequestMapping("/api/v1/profile")
public class ProfileController {

    public record ProfileMeResponse(
            String user_id,
            String role,
            String username,
            String email,
            String display_name,
            String job_title,
            int max_concurrent,
            String avatar_url
    ) {
    }

    public record PresignAvatarUploadRequest(
            String filename,
            String content_type,
            Long size_bytes
    ) {
    }

    public record PresignAvatarUploadResponse(
            String bucket,
            String object_key,
            String upload_url,
            long expires_in_seconds,
            long max_upload_bytes
    ) {
    }

    public record UpdateProfileRequest(
            String display_name,
            String job_title
    ) {
    }

    public record AvatarLookupRequest(
            List<String> user_ids
    ) {
    }

    public record AvatarLookupItem(
            String user_id,
            String display_name,
            String avatar_url
    ) {
    }

    private final JwtService jwtService;
    private final UserAccountRepository userAccountRepository;
    private final AgentProfileRepository agentProfileRepository;
        private final AgentAvatarService agentAvatarService;
        private final AvatarUrlService avatarUrlService;

    public ProfileController(
            JwtService jwtService,
            UserAccountRepository userAccountRepository,
                        AgentProfileRepository agentProfileRepository,
                        AgentAvatarService agentAvatarService,
                        AvatarUrlService avatarUrlService
    ) {
        this.jwtService = jwtService;
        this.userAccountRepository = userAccountRepository;
        this.agentProfileRepository = agentProfileRepository;
                this.agentAvatarService = agentAvatarService;
                this.avatarUrlService = avatarUrlService;
    }

    @GetMapping("/me")
    public ApiResponse<ProfileMeResponse> me(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var me = userAccountRepository.findMeById(claims.userId())
                .orElseThrow(() -> new IllegalArgumentException("user_not_found"));

        var profile = agentProfileRepository.findByUserId(claims.userId())
                .orElse(new AgentProfileRepository.AgentProfileRow(claims.userId(), "offline", 3));

        var details = agentProfileRepository.findDetailsByUserId(claims.userId()).orElse(null);
        var avatarView = avatarUrlService.getAgentAvatarView(claims.userId());

        return ApiResponse.ok(new ProfileMeResponse(
                claims.userId(),
                claims.role(),
                me.username(),
                me.email(),
                details == null ? null : details.displayName(),
                details == null ? null : details.jobTitle(),
                profile.maxConcurrent(),
                avatarView == null ? null : avatarView.avatar_url()
        ));
    }

    @GetMapping("/users/{userId}")
    public ApiResponse<ProfileMeResponse> getUserProfile(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("userId") String userId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var user = userAccountRepository.findMeById(userId)
                .orElseThrow(() -> new IllegalArgumentException("user_not_found"));
        if (!claims.tenantId().equals(user.tenantId())) {
            throw new IllegalArgumentException("forbidden");
        }
        if ("customer".equals(user.type())) {
            throw new IllegalArgumentException("forbidden");
        }

        var profile = agentProfileRepository.findByUserId(userId)
                .orElse(new AgentProfileRepository.AgentProfileRow(userId, "offline", 3));

        var details = agentProfileRepository.findDetailsByUserId(userId).orElse(null);
        var avatarView = avatarUrlService.getAgentAvatarView(userId);

        return ApiResponse.ok(new ProfileMeResponse(
                userId,
                user.type(),
                user.username(),
                user.email(),
                details == null ? null : details.displayName(),
                details == null ? null : details.jobTitle(),
                profile.maxConcurrent(),
                avatarView == null ? null : avatarView.avatar_url()
        ));
    }

    @PostMapping("/me/avatar/presign-upload")
    public ApiResponse<PresignAvatarUploadResponse> presignMyAvatarUpload(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody PresignAvatarUploadRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var r = agentAvatarService.presignUpload(
                claims,
                req == null ? null : req.filename(),
                req == null ? null : req.content_type(),
                req == null || req.size_bytes() == null ? 0 : req.size_bytes()
        );

        return ApiResponse.ok(new PresignAvatarUploadResponse(
                r.bucket(),
                r.object_key(),
                r.upload_url(),
                r.expires_in_seconds(),
                r.max_upload_bytes()
        ));
    }

    @PostMapping("/me")
    public ApiResponse<Void> updateMe(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody UpdateProfileRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        agentProfileRepository.upsertDetails(claims.userId(), req == null ? null : req.display_name(), req == null ? null : req.job_title());
        return ApiResponse.ok(null);
    }

        @PostMapping("/avatars/lookup")
        public ApiResponse<List<AvatarLookupItem>> lookupAvatars(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @RequestBody AvatarLookupRequest req
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if ("customer".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var tenantId = claims.tenantId();
                if (tenantId == null || tenantId.isBlank()) {
                        throw new IllegalArgumentException("forbidden");
                }

                var ids = req == null ? null : req.user_ids();
                if (ids == null || ids.isEmpty()) {
                        return ApiResponse.ok(List.of());
                }

                // Deduplicate while preserving input order.
                var uniqueIds = new LinkedHashSet<String>();
                for (var id : ids) {
                        var v = String.valueOf(id).trim();
                        if (!v.isBlank()) uniqueIds.add(v);
                }

                var out = new ArrayList<AvatarLookupItem>(uniqueIds.size());
                for (var userId : uniqueIds) {
                        var u = userAccountRepository.findPublicById(userId).orElse(null);
                        if (u == null) continue;
                        if (!tenantId.equals(u.tenantId())) continue;
                        if ("customer".equals(u.type())) continue;

                        var view = avatarUrlService.getAgentAvatarView(userId);
                        if (view == null) continue;

                        out.add(new AvatarLookupItem(
                                        userId,
                                        Objects.toString(view.display_name(), null),
                                        Objects.toString(view.avatar_url(), null)
                        ));
                }

                return ApiResponse.ok(out);
        }

        @PostMapping("/users/{userId}")
        public ApiResponse<Void> updateUserProfile(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @PathVariable("userId") String userId,
                        @Valid @RequestBody UpdateProfileRequest req
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if (!"admin".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var user = userAccountRepository.findMeById(userId)
                                .orElseThrow(() -> new IllegalArgumentException("user_not_found"));
                if (!claims.tenantId().equals(user.tenantId())) {
                        throw new IllegalArgumentException("forbidden");
                }
                if ("customer".equals(user.type())) {
                        throw new IllegalArgumentException("forbidden");
                }

                agentProfileRepository.upsertDetails(userId, req == null ? null : req.display_name(), req == null ? null : req.job_title());
                return ApiResponse.ok(null);
        }
}
