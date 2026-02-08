package com.chatlive.support.auth.service;

import com.chatlive.support.auth.api.*;
import com.chatlive.support.auth.repo.AgentInviteRepository;
import com.chatlive.support.auth.repo.EmailVerificationCodeRepository;
import com.chatlive.support.auth.service.crypto.PasswordHasher;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.TenantRepository;
import com.chatlive.support.chat.repo.SkillGroupRepository;
import com.chatlive.support.common.email.EmailDeliveryService;
import com.chatlive.support.common.email.EmailTemplates;
import com.chatlive.support.user.repo.UserAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;

@Service
public class OnboardingAuthService {

    private static final String E164_PHONE_REGEX = "^\\+[1-9]\\d{7,14}$";

    private final TenantRepository tenantRepository;
    private final SkillGroupRepository skillGroupRepository;
    private final UserAccountRepository userAccountRepository;
    private final PasswordHasher passwordHasher;
    private final JwtService jwtService;
    private final EmailVerificationCodeRepository emailVerificationCodeRepository;
    private final AgentInviteRepository agentInviteRepository;
    private final EmailDeliveryService emailDeliveryService;

    private final Duration accessTtl;
    private final Duration emailVerifyTtl;
    private final Duration inviteTtl;

    @Value("${app.onboarding.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    @Value("${app.onboarding.dev-return-links:false}")
    private boolean devReturnLinks;

    @Value("${app.brand.name:LiveCha}")
    private String brandName;

    public OnboardingAuthService(
            TenantRepository tenantRepository,
            SkillGroupRepository skillGroupRepository,
            UserAccountRepository userAccountRepository,
            PasswordHasher passwordHasher,
            JwtService jwtService,
            EmailVerificationCodeRepository emailVerificationCodeRepository,
            AgentInviteRepository agentInviteRepository,
            EmailDeliveryService emailDeliveryService,
            @Value("${app.jwt.access-ttl-seconds:7200}") long accessTtlSeconds,
            @Value("${app.onboarding.email-verify-ttl-minutes:60}") long emailVerifyTtlMinutes,
            @Value("${app.onboarding.invite-ttl-hours:72}") long inviteTtlHours
    ) {
        this.tenantRepository = tenantRepository;
        this.skillGroupRepository = skillGroupRepository;
        this.userAccountRepository = userAccountRepository;
        this.passwordHasher = passwordHasher;
        this.jwtService = jwtService;
        this.emailVerificationCodeRepository = emailVerificationCodeRepository;
        this.agentInviteRepository = agentInviteRepository;
        this.emailDeliveryService = emailDeliveryService;
        this.accessTtl = Duration.ofSeconds(accessTtlSeconds);
        this.emailVerifyTtl = Duration.ofMinutes(emailVerifyTtlMinutes);
        this.inviteTtl = Duration.ofHours(inviteTtlHours);
    }

    @Transactional
    public RegisterResponse register(RegisterRequest req) {
        var tenantName = safeTrim(req == null ? null : req.tenant_name());
        var email = normalizeEmail(req == null ? null : req.email());
        var phone = normalizeE164Phone(req == null ? null : req.phone());
        var password = req == null ? null : req.password();

        if (tenantName == null) throw new IllegalArgumentException("tenant_name_required");
        if (email == null) throw new IllegalArgumentException("email_required");
        if (phone == null) throw new IllegalArgumentException("phone_required");
        if (!phone.matches(E164_PHONE_REGEX)) throw new IllegalArgumentException("invalid_phone");
        validateRegisterPassword(password);

        if (userAccountRepository.existsUsername(email)) {
            throw new IllegalArgumentException("email_already_registered");
        }

        var tenantId = tenantRepository.createTenant(tenantName);
        var userId = userAccountRepository.createUser(
                tenantId,
                "admin",
                email,
            phone,
                email,
                passwordHasher.hash(password),
                false
        );

        // Ensure system fallback group exists and new agent/admin is a member.
        try {
            var fallbackId = skillGroupRepository.ensureFallbackGroup(tenantId);
            skillGroupRepository.upsertMember(fallbackId, userId, 0);
        } catch (Exception ignored) {
            // best-effort; routing can still fall back to tenant-wide pool
        }

        var code = TokenUtil.newSixDigitCode();
        var codeHash = TokenUtil.sha256Base64Url(code);
        var codeId = "evc_" + java.util.UUID.randomUUID();
        var expiresAt = Instant.now().plus(emailVerifyTtl);
        emailVerificationCodeRepository.insert(codeId, userId, codeHash, expiresAt);

        var verifyPageUrl = buildFrontendPath("/verify-email-code");
        var mail = EmailTemplates.verificationCodeEmail(brandName, code, emailVerifyTtl, null);
        emailDeliveryService.sendHtml(email, mail.subject(), mail.textBody(), mail.htmlBody());

        var accessToken = jwtService.issueAccessToken(userId, tenantId, "admin", accessTtl);
        return new RegisterResponse(
                accessToken,
                accessTtl.toSeconds(),
                tenantId,
                userId,
                false,
            devReturnLinks ? (verifyPageUrl + "?code=" + code) : null
        );
    }

    private static void validateRegisterPassword(String password) {
        if (password == null) throw new IllegalArgumentException("invalid_password");
        if (password.length() < 12 || password.length() > 72) throw new IllegalArgumentException("invalid_password");

        boolean hasUpper = false;
        boolean hasNumber = false;
        boolean hasSpecial = false;

        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (c >= 'A' && c <= 'Z') {
                hasUpper = true;
            } else if (c >= '0' && c <= '9') {
                hasNumber = true;
            } else if (!Character.isLetterOrDigit(c)) {
                hasSpecial = true;
            }
        }

        if (!hasUpper || !hasNumber || !hasSpecial) throw new IllegalArgumentException("invalid_password");
    }

    private static String normalizeE164Phone(String raw) {
        if (raw == null) {
            return null;
        }
        // We expect E.164 (+<country><number>) from client; trim and remove whitespace.
        var s = raw.trim().replaceAll("\\s+", "");
        return s.isBlank() ? null : s;
    }

    @Transactional
    public VerifyEmailResponse resendVerification(String userId) {
        var me = userAccountRepository.findMeById(userId).orElseThrow(() -> new IllegalArgumentException("user_not_found"));
        if (me.email() == null || me.email().isBlank()) throw new IllegalArgumentException("email_required");
        if (me.emailVerified()) return new VerifyEmailResponse(true);

        var code = TokenUtil.newSixDigitCode();
        var codeHash = TokenUtil.sha256Base64Url(code);
        var codeId = "evc_" + java.util.UUID.randomUUID();
        var expiresAt = Instant.now().plus(emailVerifyTtl);
        emailVerificationCodeRepository.insert(codeId, me.id(), codeHash, expiresAt);

        var verifyPageUrl = buildFrontendPath("/verify-email-code");
        var mail = EmailTemplates.verificationCodeEmail(brandName, code, emailVerifyTtl, null);
        emailDeliveryService.sendHtml(me.email(), mail.subject(), mail.textBody(), mail.htmlBody());
        return new VerifyEmailResponse(false);
    }

    @Transactional
    public VerifyEmailResponse verifyEmailCode(String userId, VerifyEmailCodeRequest req) {
        var code = safeTrim(req == null ? null : req.code());
        if (code == null) throw new IllegalArgumentException("code_required");
        if (!code.matches("^\\d{6}$")) throw new IllegalArgumentException("invalid_code");

        var me = userAccountRepository.findMeById(userId).orElseThrow(() -> new IllegalArgumentException("user_not_found"));
        if (me.emailVerified()) return new VerifyEmailResponse(true);

        var row = emailVerificationCodeRepository.findLatestActiveByUserId(me.id())
                .orElseThrow(() -> new IllegalArgumentException("code_required"));

        if (row.usedAt() != null) throw new IllegalArgumentException("code_used");
        if (row.expiresAt().isBefore(Instant.now())) throw new IllegalArgumentException("code_expired");

        var codeHash = TokenUtil.sha256Base64Url(code);
        if (!codeHash.equals(row.codeHash())) throw new IllegalArgumentException("invalid_code");

        userAccountRepository.setEmailVerified(me.id(), true);
        emailVerificationCodeRepository.markUsed(row.id(), Instant.now());
        return new VerifyEmailResponse(true);
    }

    @Transactional
    public AcceptInviteResponse acceptInvite(AcceptInviteRequest req) {
        var rawToken = safeTrim(req == null ? null : req.token());
        var password = req == null ? null : req.password();
        if (rawToken == null) throw new IllegalArgumentException("token_required");
        validateRegisterPassword(password);

        var tokenHash = TokenUtil.sha256Base64Url(rawToken);
        var invite = agentInviteRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("invalid_token"));

        if (invite.acceptedAt() != null) throw new IllegalArgumentException("invite_already_accepted");
        if (invite.expiresAt().isBefore(Instant.now())) throw new IllegalArgumentException("token_expired");

        var username = normalizeEmail(invite.email());
        if (username == null) throw new IllegalArgumentException("invalid_email");
        if (userAccountRepository.existsUsername(username)) throw new IllegalArgumentException("username_taken");

        var userId = userAccountRepository.createUser(
                invite.tenantId(),
                invite.role(),
                username,
                null,
                username,
                passwordHasher.hash(password),
                true
        );

        // Ensure system fallback group exists and new agent/admin is a member.
        try {
            var fallbackId = skillGroupRepository.ensureFallbackGroup(invite.tenantId());
            skillGroupRepository.upsertMember(fallbackId, userId, 0);
        } catch (Exception ignored) {
            // best-effort
        }

        agentInviteRepository.markAccepted(invite.id(), Instant.now(), userId);

        var accessToken = jwtService.issueAccessToken(userId, invite.tenantId(), invite.role(), accessTtl);
        return new AcceptInviteResponse(accessToken, accessTtl.toSeconds(), invite.tenantId(), userId, username);
    }

    @Transactional
    public record InviteCreated(String inviteId, String role, String devAcceptUrl) {
    }

    @Transactional
    public InviteCreated createInviteAndSend(String tenantId, String inviterUserId, String email, String role) {
        var normalizedEmail = normalizeEmail(email);
        if (normalizedEmail == null) throw new IllegalArgumentException("invalid_email");

        var finalRole = safeTrim(role);
        if (finalRole == null) finalRole = "agent";
        if (!"agent".equals(finalRole) && !"admin".equals(finalRole)) throw new IllegalArgumentException("invalid_role");

        var rawToken = TokenUtil.newToken();
        var tokenHash = TokenUtil.sha256Base64Url(rawToken);
        var inviteId = "inv_" + java.util.UUID.randomUUID();
        var expiresAt = Instant.now().plus(inviteTtl);
        agentInviteRepository.insert(inviteId, tenantId, normalizedEmail, finalRole, inviterUserId, tokenHash, expiresAt);

        var acceptUrl = buildFrontendUrl("/accept-invite", "token", rawToken);
        var mail = EmailTemplates.inviteEmail(brandName, acceptUrl, inviteTtl);
        emailDeliveryService.sendHtml(normalizedEmail, mail.subject(), mail.textBody(), mail.htmlBody());
        return new InviteCreated(inviteId, finalRole, devReturnLinks ? acceptUrl : null);
    }

    private String buildFrontendUrl(String path, String key, String value) {
        var base = (frontendBaseUrl == null || frontendBaseUrl.isBlank()) ? "" : frontendBaseUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        var encoded = URLEncoder.encode(value, StandardCharsets.UTF_8);
        return base + path + "?" + key + "=" + encoded;
    }

    private String buildFrontendPath(String path) {
        var base = (frontendBaseUrl == null || frontendBaseUrl.isBlank()) ? "" : frontendBaseUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + path;
    }

    private static String safeTrim(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }

    private static String normalizeEmail(String raw) {
        var s = safeTrim(raw);
        if (s == null) return null;
        return s.toLowerCase();
    }
}
