package com.chatlive.support.common.email;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

@Service
public class EmailDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(EmailDeliveryService.class);

    private final JavaMailSender mailSender;
    private final boolean enabled;
    private final String from;

    public EmailDeliveryService(
            JavaMailSender mailSender,
            @Value("${app.email.enabled:false}") boolean enabled,
            @Value("${app.email.from:}") String from,
            @Value("${spring.mail.username:}") String username
    ) {
        this.mailSender = mailSender;
        this.enabled = enabled;
        var candidate = (from == null || from.isBlank()) ? username : from;
        this.from = (candidate == null || candidate.isBlank()) ? null : candidate.trim();
    }

    public void send(String to, String subject, String body) {
        if (to == null || to.isBlank()) throw new IllegalArgumentException("email_to_required");
        if (subject == null || subject.isBlank()) throw new IllegalArgumentException("email_subject_required");
        if (body == null) body = "";

        if (!enabled) {
            // Dev/test default: log-only delivery.
            log.info("email_out (disabled) to={} subject={} body={} ", to, subject, body);
            return;
        }

        if (from == null) {
            throw new IllegalStateException("email_from_required");
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            log.info("email_out (smtp) to={} subject={}", to, subject);
        } catch (Exception e) {
            log.error("email_send_failed to={} subject={}", to, subject, e);
            throw new IllegalStateException("email_send_failed", e);
        }
    }

    public void sendHtml(String to, String subject, String textBody, String htmlBody) {
        if (to == null || to.isBlank()) throw new IllegalArgumentException("email_to_required");
        if (subject == null || subject.isBlank()) throw new IllegalArgumentException("email_subject_required");
        if (textBody == null) textBody = "";
        if (htmlBody == null) htmlBody = "";

        if (!enabled) {
            log.info("email_out (disabled) to={} subject={} body_text={} body_html={} ", to, subject, textBody, htmlBody);
            return;
        }
        if (from == null) {
            throw new IllegalStateException("email_from_required");
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            // multipart=true is required when using setText(plain, html)
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(textBody, htmlBody);
            mailSender.send(message);
            log.info("email_out (smtp/html) to={} subject={}", to, subject);
        } catch (Exception e) {
            log.error("email_send_failed to={} subject={}", to, subject, e);
            throw new IllegalStateException("email_send_failed", e);
        }
    }
}
