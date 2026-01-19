package com.chatlive.support.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

final class TokenUtil {

    private static final SecureRandom RNG = new SecureRandom();

    private TokenUtil() {
    }

    static String newToken() {
        byte[] bytes = new byte[32];
        RNG.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String newSixDigitCode() {
        // 000000 - 999999, left-padded.
        int value = RNG.nextInt(1_000_000);
        return String.format(java.util.Locale.ROOT, "%06d", value);
    }

    static String sha256Base64Url(String raw) {
        try {
            var md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest((raw == null ? "" : raw).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("hash_failed");
        }
    }
}
