package com.chatlive.support.chat.service;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.chat.api.QuickReplyItem;
import com.chatlive.support.chat.repo.QuickReplyRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class QuickReplyService {

    private final QuickReplyRepository quickReplyRepository;

    public QuickReplyService(QuickReplyRepository quickReplyRepository) {
        this.quickReplyRepository = quickReplyRepository;
    }

    public List<QuickReplyItem> list(JwtClaims claims, String q, int limit) {
        requireAgent(claims);
        var rows = quickReplyRepository.listByTenant(claims.tenantId(), Math.max(1, Math.min(limit, 200)));

        var query = q == null ? "" : q.trim().toLowerCase();
        if (query.isBlank()) {
            return rows.stream().map(r -> new QuickReplyItem(
                    r.id(),
                    r.title(),
                    r.content(),
                    r.updatedAt().getEpochSecond()
            )).toList();
        }

        var out = new ArrayList<QuickReplyItem>();
        for (var r : rows) {
            var hay = (r.title() + "\n" + r.content()).toLowerCase();
            if (!hay.contains(query)) continue;
            out.add(new QuickReplyItem(r.id(), r.title(), r.content(), r.updatedAt().getEpochSecond()));
            if (out.size() >= Math.max(1, Math.min(limit, 200))) break;
        }
        return out;
    }

    public QuickReplyItem create(JwtClaims claims, String title, String content) {
        requireAgent(claims);
        var id = quickReplyRepository.create(claims.tenantId(), title.trim(), content.trim(), claims.userId());
        var row = quickReplyRepository.findById(claims.tenantId(), id)
                .orElseThrow(() -> new IllegalArgumentException("quick_reply_not_found"));
        return new QuickReplyItem(row.id(), row.title(), row.content(), row.updatedAt().getEpochSecond());
    }

    public QuickReplyItem update(JwtClaims claims, String id, String title, String content) {
        requireAgent(claims);
        if (id == null || id.isBlank()) throw new IllegalArgumentException("missing_id");
        var updated = quickReplyRepository.update(claims.tenantId(), id, title.trim(), content.trim());
        if (updated == 0) throw new IllegalArgumentException("quick_reply_not_found");
        var row = quickReplyRepository.findById(claims.tenantId(), id)
                .orElseThrow(() -> new IllegalArgumentException("quick_reply_not_found"));
        return new QuickReplyItem(row.id(), row.title(), row.content(), row.updatedAt().getEpochSecond());
    }

    public void delete(JwtClaims claims, String id) {
        requireAgent(claims);
        if (id == null || id.isBlank()) throw new IllegalArgumentException("missing_id");
        quickReplyRepository.delete(claims.tenantId(), id);
    }

    private static void requireAgent(JwtClaims claims) {
        if (claims == null || claims.tenantId() == null || claims.tenantId().isBlank()) {
            throw new IllegalArgumentException("forbidden");
        }
        if (!("agent".equals(claims.role()) || "admin".equals(claims.role()))) {
            throw new IllegalArgumentException("forbidden");
        }
    }
}
