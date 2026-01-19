package com.chatlive.support.auth.api;

import com.chatlive.support.auth.service.AuthService;
import com.chatlive.support.auth.service.OnboardingAuthService;
import com.chatlive.support.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final OnboardingAuthService onboardingAuthService;

    public AuthController(AuthService authService, OnboardingAuthService onboardingAuthService) {
        this.authService = authService;
        this.onboardingAuthService = onboardingAuthService;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        return ApiResponse.ok(authService.login(req));
    }

    @PostMapping("/register")
    public ApiResponse<RegisterResponse> register(@Valid @RequestBody RegisterRequest req) {
        return ApiResponse.ok(onboardingAuthService.register(req));
    }

    @PostMapping("/verify-email-code")
    public ApiResponse<VerifyEmailResponse> verifyEmailCode(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody VerifyEmailCodeRequest req
    ) {
        var me = authService.me(authorization);
        return ApiResponse.ok(onboardingAuthService.verifyEmailCode(me.user_id(), req));
    }

    @PostMapping("/resend-verification")
    public ApiResponse<VerifyEmailResponse> resendVerification(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var me = authService.me(authorization);
        return ApiResponse.ok(onboardingAuthService.resendVerification(me.user_id()));
    }

    @PostMapping("/accept-invite")
    public ApiResponse<AcceptInviteResponse> acceptInvite(@Valid @RequestBody AcceptInviteRequest req) {
        return ApiResponse.ok(onboardingAuthService.acceptInvite(req));
    }

    @GetMapping("/me")
    public ApiResponse<MeResponse> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return ApiResponse.ok(authService.me(authorization));
    }
}
