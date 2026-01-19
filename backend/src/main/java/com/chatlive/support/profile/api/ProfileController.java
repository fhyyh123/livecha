package com.chatlive.support.profile.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.user.repo.UserAccountRepository;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

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
            int max_concurrent
    ) {
    }

    public record UpdateProfileRequest(
            String display_name,
            String job_title
    ) {
    }

    private final JwtService jwtService;
    private final UserAccountRepository userAccountRepository;
    private final AgentProfileRepository agentProfileRepository;

    public ProfileController(
            JwtService jwtService,
            UserAccountRepository userAccountRepository,
            AgentProfileRepository agentProfileRepository
    ) {
        this.jwtService = jwtService;
        this.userAccountRepository = userAccountRepository;
        this.agentProfileRepository = agentProfileRepository;
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

        return ApiResponse.ok(new ProfileMeResponse(
                claims.userId(),
                claims.role(),
                me.username(),
                me.email(),
                details == null ? null : details.displayName(),
                details == null ? null : details.jobTitle(),
                profile.maxConcurrent()
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

        return ApiResponse.ok(new ProfileMeResponse(
                userId,
                user.type(),
                user.username(),
                user.email(),
                details == null ? null : details.displayName(),
                details == null ? null : details.jobTitle(),
                profile.maxConcurrent()
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
