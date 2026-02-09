package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.SkillGroupRepository;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.user.repo.UserAccountRepository;
import jakarta.validation.Valid;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashSet;
import java.util.List;

@RestController
@RequestMapping("/api/v1/skill-groups")
public class SkillGroupController {

    private final JwtService jwtService;
    private final SkillGroupRepository skillGroupRepository;
    private final UserAccountRepository userAccountRepository;

    public SkillGroupController(
            JwtService jwtService,
            SkillGroupRepository skillGroupRepository,
            UserAccountRepository userAccountRepository
    ) {
        this.jwtService = jwtService;
        this.skillGroupRepository = skillGroupRepository;
        this.userAccountRepository = userAccountRepository;
    }

    @GetMapping
    public ApiResponse<List<SkillGroupItem>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var rows = skillGroupRepository.listByTenant(claims.tenantId());
        var items = rows.stream().map(r -> new SkillGroupItem(
                r.id(),
                r.name(),
                r.enabled(),
                r.groupType(),
                r.isFallback(),
                r.systemKey()
        )).toList();
        return ApiResponse.ok(items);
    }

        @GetMapping("/agents/{agentUserId}")
        public ApiResponse<List<SkillGroupItem>> listGroupsForAgent(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @PathVariable("agentUserId") String agentUserId
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if ("customer".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var targetUserId = agentUserId == null ? "" : agentUserId.trim();
                if (targetUserId.isBlank()) {
                        throw new IllegalArgumentException("user_not_found");
                }

                // Permissions:
                // - admin can view any agent/admin in tenant
                // - agent can only view self
                if (!"admin".equals(claims.role()) && !claims.userId().equals(targetUserId)) {
                        throw new IllegalArgumentException("forbidden");
                }

                // Ensure target user exists and belongs to tenant.
                var user = userAccountRepository.findById(targetUserId)
                                .orElseThrow(() -> new IllegalArgumentException("user_not_found"));
                if (!claims.tenantId().equals(user.tenantId())) {
                        throw new IllegalArgumentException("forbidden");
                }
                if (!("agent".equals(user.type()) || "admin".equals(user.type()))) {
                        throw new IllegalArgumentException("forbidden");
                }

                var rows = skillGroupRepository.listForAgent(claims.tenantId(), targetUserId);
                var items = rows.stream().map(r -> new SkillGroupItem(
                                r.id(),
                                r.name(),
                                r.enabled(),
                                r.groupType(),
                                r.isFallback(),
                                r.systemKey()
                )).toList();
                return ApiResponse.ok(items);
        }

        @GetMapping("/me")
        public ApiResponse<List<SkillGroupItem>> listMyGroups(
                        @RequestHeader(value = "Authorization", required = false) String authorization
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if ("customer".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var rows = skillGroupRepository.listForAgent(claims.tenantId(), claims.userId());
                var items = rows.stream().map(r -> new SkillGroupItem(
                                r.id(),
                                r.name(),
                                r.enabled(),
                                r.groupType(),
                                r.isFallback(),
                                r.systemKey()
                )).toList();
                return ApiResponse.ok(items);
        }

    @PostMapping
    @Transactional
    public ApiResponse<SkillGroupItem> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody CreateSkillGroupRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

                var enabled = req.enabled() == null ? Boolean.TRUE : req.enabled();
                var id = skillGroupRepository.create(claims.tenantId(), req.name(), enabled);

                var uniqueMemberIds = new LinkedHashSet<String>();
                for (var raw : req.member_user_ids()) {
                        if (raw == null || raw.isBlank()) {
                                throw new IllegalArgumentException("member_required");
                        }
                        uniqueMemberIds.add(raw.trim());
                }
                if (uniqueMemberIds.isEmpty()) {
                        throw new IllegalArgumentException("members_required");
                }

                for (var agentUserId : uniqueMemberIds) {
                        var user = userAccountRepository.findById(agentUserId)
                                        .orElseThrow(() -> new IllegalArgumentException("agent_not_found"));
                        if (!claims.tenantId().equals(user.tenantId())) {
                                throw new IllegalArgumentException("agent_not_in_tenant");
                        }
                        if (!("agent".equals(user.type()) || "admin".equals(user.type()))) {
                                throw new IllegalArgumentException("invalid_agent_type");
                        }

                        skillGroupRepository.upsertMember(id, agentUserId, 1);
                }

        var row = skillGroupRepository.findById(claims.tenantId(), id)
                .orElseThrow(() -> new IllegalArgumentException("create_failed"));
        return ApiResponse.ok(new SkillGroupItem(
                row.id(),
                row.name(),
                row.enabled(),
                row.groupType(),
                row.isFallback(),
                row.systemKey()
        ));
    }

    @GetMapping("/{id}/members")
    public ApiResponse<List<SkillGroupMemberItem>> listMembers(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String groupId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if ("customer".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        // Ensure group belongs to tenant (avoid leaking membership info)
        skillGroupRepository.findById(claims.tenantId(), groupId)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

        var rows = skillGroupRepository.listMembers(groupId);
        var items = rows.stream().map(r -> new SkillGroupMemberItem(r.agentUserId(), r.weight())).toList();
        return ApiResponse.ok(items);
    }

        @PatchMapping("/{id}")
        @Transactional
        public ApiResponse<SkillGroupItem> updateGroup(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @PathVariable("id") String groupId,
                        @Valid @RequestBody UpdateSkillGroupRequest req
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if (!"admin".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var group = skillGroupRepository.findById(claims.tenantId(), groupId)
                                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

                if (group.isFallback() || (group.groupType() != null && group.groupType().trim().equalsIgnoreCase("system"))) {
                        throw new IllegalArgumentException("system_group_readonly");
                }

                var updated = skillGroupRepository.updateGroup(claims.tenantId(), groupId, req.name(), req.enabled());
                if (updated <= 0) {
                        throw new IllegalArgumentException("update_failed");
                }

                var row = skillGroupRepository.findById(claims.tenantId(), groupId)
                                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));
                return ApiResponse.ok(new SkillGroupItem(
                                row.id(),
                                row.name(),
                                row.enabled(),
                                row.groupType(),
                                row.isFallback(),
                                row.systemKey()
                ));
        }

    @PostMapping("/{id}/members")
    public ApiResponse<Void> upsertMember(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String groupId,
            @Valid @RequestBody UpsertSkillGroupMemberRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var group = skillGroupRepository.findById(claims.tenantId(), groupId)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

        if (group.isFallback() || (group.groupType() != null && group.groupType().trim().equalsIgnoreCase("system"))) {
            throw new IllegalArgumentException("system_group_readonly");
        }

        var user = userAccountRepository.findById(req.agent_user_id())
                .orElseThrow(() -> new IllegalArgumentException("agent_not_found"));
        if (!claims.tenantId().equals(user.tenantId())) {
            throw new IllegalArgumentException("agent_not_in_tenant");
        }
        if (!("agent".equals(user.type()) || "admin".equals(user.type()))) {
            throw new IllegalArgumentException("invalid_agent_type");
        }

        skillGroupRepository.upsertMember(groupId, req.agent_user_id(), req.weight());
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{id}/members/{agentUserId}")
    public ApiResponse<Void> removeMember(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String groupId,
            @PathVariable("agentUserId") String agentUserId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var group = skillGroupRepository.findById(claims.tenantId(), groupId)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

        if (group.isFallback() || (group.groupType() != null && group.groupType().trim().equalsIgnoreCase("system"))) {
            throw new IllegalArgumentException("system_group_readonly");
        }

        skillGroupRepository.removeMember(groupId, agentUserId);
        return ApiResponse.ok(null);
    }

        @DeleteMapping("/{id}")
        @Transactional
        public ApiResponse<Void> deleteGroup(
                        @RequestHeader(value = "Authorization", required = false) String authorization,
                        @PathVariable("id") String groupId
        ) {
                var token = JwtService.extractBearerToken(authorization)
                                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
                var claims = jwtService.parse(token);
                if (!"admin".equals(claims.role())) {
                        throw new IllegalArgumentException("forbidden");
                }

                var group = skillGroupRepository.findById(claims.tenantId(), groupId)
                                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

                if (group.isFallback() || (group.groupType() != null && group.groupType().trim().equalsIgnoreCase("system"))) {
                        throw new IllegalArgumentException("system_group_readonly");
                }

                if (skillGroupRepository.hasActiveConversationsForGroup(claims.tenantId(), groupId)) {
                        throw new IllegalArgumentException("group_in_use");
                }

                var fallbackGroupId = skillGroupRepository.ensureFallbackGroup(claims.tenantId());

                // Ensure members won't end up with 0 groups after deletion.
                var members = skillGroupRepository.listMembers(groupId);
                for (var m : members) {
                        var cnt = skillGroupRepository.countGroupsForAgent(claims.tenantId(), m.agentUserId());
                        if (cnt <= 1) {
                                skillGroupRepository.upsertMember(fallbackGroupId, m.agentUserId(), 0);
                        }
                }

                // Detach historical conversations from this group (avoid FK delete failure).
                skillGroupRepository.clearConversationSkillGroup(claims.tenantId(), groupId);
                skillGroupRepository.removeAllMembers(groupId);
                skillGroupRepository.deleteGroup(claims.tenantId(), groupId);

                return ApiResponse.ok(null);
        }
}
