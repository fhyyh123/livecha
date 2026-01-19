package com.chatlive.support.common.email;

import java.time.Duration;

public final class EmailTemplates {

    private EmailTemplates() {
    }

    public record EmailContent(String subject, String textBody, String htmlBody) {
    }

    public static EmailContent verificationCodeEmail(String brandName, String code, Duration ttl, String openAppUrl) {
        String brand = safeBrand(brandName);
        String ttlHint = ttlHint(ttl);

        String safeCode = (code == null) ? "" : code.trim();

        String subject = "Your verification code - " + brand;

        String text = "Welcome to " + brand + "!\n\n"
                + "Your email verification code is:\n"
                + safeCode + "\n\n"
                + "This code expires " + ttlHint + ".\n\n"
                + "If you didn't create an account, you can ignore this email.";

        String html = codeHtml(
                brand,
                safeCode,
                openAppUrl,
                "This verification code expires " + ttlHint + ".",
                "If you didn't create an account, you can safely ignore this email."
        );

        return new EmailContent(subject, text, html);
    }

    public static EmailContent inviteEmail(String brandName, String acceptUrl, Duration ttl) {
        String brand = safeBrand(brandName);
        String ttlHint = ttlHint(ttl);

        String subject = "You're invited to join " + brand;

        String text = "You've been invited to join " + brand + ".\n\n"
                + "Accept the invite by opening this link:\n"
                + acceptUrl + "\n\n"
                + "This invite link expires " + ttlHint + ".";

        String html = baseHtml(
                brand,
                "You're invited",
                "You've been invited to join " + brand + ".",
                "Accept Invite",
                acceptUrl,
                "This invite link expires " + ttlHint + ".",
                "If you were not expecting this invitation, you can ignore this email."
        );

        return new EmailContent(subject, text, html);
    }

    private static String safeBrand(String brandName) {
        if (brandName == null) return "LiveCha";
        String t = brandName.trim();
        return t.isBlank() ? "LiveCha" : t;
    }

    private static String ttlHint(Duration ttl) {
        if (ttl == null) return "soon";
        long minutes = Math.max(1, ttl.toMinutes());
        if (minutes < 90) return "in about " + minutes + " minutes";
        long hours = Math.max(1, ttl.toHours());
        if (hours < 48) return "in about " + hours + " hours";
        long days = Math.max(1, ttl.toDays());
        return "in about " + days + " days";
    }

    private static String baseHtml(
            String brand,
            String title,
            String lead,
            String buttonText,
            String buttonUrl,
            String note,
            String footer
    ) {
        String safeBrand = escapeHtml(brand);
        String safeTitle = escapeHtml(title);
        String safeLead = escapeHtml(lead);
        String safeButtonText = escapeHtml(buttonText);
        String safeUrl = escapeHtml(buttonUrl);
        String safeNote = escapeHtml(note);
        String safeFooter = escapeHtml(footer);

        return "<!doctype html>"
                + "<html><head>"
                + "<meta charset=\"utf-8\"/>"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
                + "<title>" + safeTitle + "</title>"
                + "</head>"
                + "<body style=\"margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;\">"
                + "<div style=\"max-width:640px;margin:0 auto;padding:24px;\">"
                + "  <div style=\"padding:18px 20px;font-size:18px;font-weight:700;color:#111827;\">" + safeBrand + "</div>"
                + "  <div style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;\">"
                + "    <div style=\"font-size:20px;font-weight:700;color:#111827;margin-bottom:8px;\">" + safeTitle + "</div>"
                + "    <div style=\"font-size:14px;line-height:20px;color:#374151;margin-bottom:16px;\">" + safeLead + "</div>"
                + "    <div style=\"margin:22px 0;\">"
                + "      <a href=\"" + safeUrl + "\" style=\"display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;\">" + safeButtonText + "</a>"
                + "    </div>"
                + "    <div style=\"font-size:12px;line-height:18px;color:#6b7280;margin-top:14px;\">If the button doesn't work, open this link:</div>"
                + "    <div style=\"font-size:12px;line-height:18px;color:#2563eb;word-break:break-all;\"><a href=\"" + safeUrl + "\">" + safeUrl + "</a></div>"
                + "    <div style=\"font-size:12px;line-height:18px;color:#6b7280;margin-top:14px;\">" + safeNote + "</div>"
                + "  </div>"
                + "  <div style=\"padding:16px 8px;font-size:12px;line-height:18px;color:#9ca3af;\">" + safeFooter + "</div>"
                + "</div>"
                + "</body></html>";
    }

            private static String codeHtml(
                String brand,
                String code,
                String openAppUrl,
                String note,
                String footer
            ) {
            String safeBrand = escapeHtml(brand);
            String safeCode = escapeHtml(code);
            String safeUrl = escapeHtml(openAppUrl);
            String safeNote = escapeHtml(note);
            String safeFooter = escapeHtml(footer);

            return "<!doctype html>"
                + "<html><head>"
                + "<meta charset=\"utf-8\"/>"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
                + "<title>Email verification code</title>"
                + "</head>"
                + "<body style=\"margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;\">"
                + "<div style=\"max-width:640px;margin:0 auto;padding:24px;\">"
                + "  <div style=\"padding:18px 20px;font-size:18px;font-weight:700;color:#111827;\">" + safeBrand + "</div>"
                + "  <div style=\"background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;\">"
                + "    <div style=\"font-size:20px;font-weight:700;color:#111827;margin-bottom:8px;\">Verify your email</div>"
                + "    <div style=\"font-size:14px;line-height:20px;color:#374151;margin-bottom:16px;\">Enter this 6-digit code in the app:</div>"
                + "    <div style=\"font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:6px;font-size:28px;font-weight:700;color:#111827;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;display:inline-block;\">" + safeCode + "</div>"
                + (safeUrl == null || safeUrl.isBlank() ? "" : ("    <div style=\"margin:22px 0 0;\">"
                + "      <a href=\"" + safeUrl + "\" style=\"display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;\">Open " + safeBrand + "</a>"
                + "    </div>"))
                + "    <div style=\"font-size:12px;line-height:18px;color:#6b7280;margin-top:14px;\">" + safeNote + "</div>"
                + "  </div>"
                + "  <div style=\"padding:16px 8px;font-size:12px;line-height:18px;color:#9ca3af;\">" + safeFooter + "</div>"
                + "</div>"
                + "</body></html>";
            }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
