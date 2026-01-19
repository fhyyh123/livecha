package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.SkillGroupRepository;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.user.repo.UserAccountRepository;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

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
        var items = rows.stream().map(r -> new SkillGroupItem(r.id(), r.name(), r.enabled())).toList();
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
                var items = rows.stream().map(r -> new SkillGroupItem(r.id(), r.name(), r.enabled())).toList();
                return ApiResponse.ok(items);
        }

    @PostMapping
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

        var id = skillGroupRepository.create(claims.tenantId(), req.name(), req.enabled());
        var row = skillGroupRepository.findById(claims.tenantId(), id)
                .orElseThrow(() -> new IllegalArgumentException("create_failed"));
        return ApiResponse.ok(new SkillGroupItem(row.id(), row.name(), row.enabled()));
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

        skillGroupRepository.findById(claims.tenantId(), groupId)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

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

        skillGroupRepository.findById(claims.tenantId(), groupId)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

        skillGroupRepository.removeMember(groupId, agentUserId);
        return ApiResponse.ok(null);
    }
}
