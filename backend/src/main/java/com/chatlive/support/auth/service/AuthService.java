package com.chatlive.support.auth.service;

import com.chatlive.support.auth.api.LoginRequest;
import com.chatlive.support.auth.api.LoginResponse;
import com.chatlive.support.auth.api.MeResponse;
import com.chatlive.support.auth.service.crypto.PasswordHasher;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.service.AgentPresenceService;
import com.chatlive.support.user.repo.UserAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class AuthService {

    private final UserAccountRepository userAccountRepository;
    private final PasswordHasher passwordHasher;
    private final JwtService jwtService;
    private final Duration accessTtl;
    private final AgentPresenceService agentPresenceService;

    public AuthService(
            UserAccountRepository userAccountRepository,
            PasswordHasher passwordHasher,
            JwtService jwtService,
            @Value("${app.jwt.access-ttl-seconds:7200}") long accessTtlSeconds,
            AgentPresenceService agentPresenceService
    ) {
        this.userAccountRepository = userAccountRepository;
        this.passwordHasher = passwordHasher;
        this.jwtService = jwtService;
        this.accessTtl = Duration.ofSeconds(accessTtlSeconds);
        this.agentPresenceService = agentPresenceService;
    }

    public LoginResponse login(LoginRequest req) {
        var user = userAccountRepository.findByUsername(req.username())
                .orElseThrow(() -> new IllegalArgumentException("invalid_credentials"));

        if (!passwordHasher.matches(req.password(), user.passwordHash())) {
            throw new IllegalArgumentException("invalid_credentials");
        }

        var accessToken = jwtService.issueAccessToken(user.id(), user.tenantId(), user.type(), accessTtl);

        String sessionId = null;
        if (!"customer".equals(user.type())) {
            sessionId = agentPresenceService.createSession(user.tenantId(), user.id());
        }

        return new LoginResponse(
                accessToken,
                null,
                accessTtl.toSeconds(),
                sessionId,
                agentPresenceService.heartbeatIntervalSeconds(),
                agentPresenceService.heartbeatTtlSeconds()
        );
    }

    public MeResponse me(String authorization) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);

        var me = userAccountRepository.findMeById(claims.userId()).orElse(null);
        var email = me == null ? null : me.email();
        var emailVerified = me != null && me.emailVerified();
        return new MeResponse(
                claims.userId(),
                claims.role(),
                claims.tenantId(),
            claims.username(),
            email,
            emailVerified
        );
    }
}
