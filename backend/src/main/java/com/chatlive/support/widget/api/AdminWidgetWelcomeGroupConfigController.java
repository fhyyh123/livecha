package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtClaims;
import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.repo.SkillGroupRepository;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import com.chatlive.support.widget.repo.WidgetWelcomeGroupConfigRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/sites")
public class AdminWidgetWelcomeGroupConfigController {

    private static final boolean DEFAULT_SHOW_WELCOME_SCREEN = true;

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final SkillGroupRepository skillGroupRepository;
    private final WidgetConfigRepository widgetConfigRepository;
    private final WidgetWelcomeGroupConfigRepository widgetWelcomeGroupConfigRepository;

    public AdminWidgetWelcomeGroupConfigController(
            JwtService jwtService,
            SiteRepository siteRepository,
            SkillGroupRepository skillGroupRepository,
            WidgetConfigRepository widgetConfigRepository,
            WidgetWelcomeGroupConfigRepository widgetWelcomeGroupConfigRepository
    ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.skillGroupRepository = skillGroupRepository;
        this.widgetConfigRepository = widgetConfigRepository;
        this.widgetWelcomeGroupConfigRepository = widgetWelcomeGroupConfigRepository;
    }

    @GetMapping("/{id}/widget-config/welcome-group")
    public ApiResponse<WidgetWelcomeGroupConfigDto> get(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @RequestParam(value = "skill_group_id", required = false) String skillGroupId
    ) {
        var claims = requireAdminClaims(authorization);
        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var gid = safeTrim(skillGroupId);
        if (gid == null || gid.isBlank()) {
            throw new IllegalArgumentException("skill_group_id_required");
        }

        // Ensure group belongs to tenant.
        skillGroupRepository.findById(claims.tenantId(), gid)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

        var base = widgetConfigRepository.findBySiteId(site.id()).orElse(null);
        var baseWelcomeText = base == null ? null : base.welcomeText();
        var baseShow = base == null ? DEFAULT_SHOW_WELCOME_SCREEN : Boolean.TRUE.equals(base.showWelcomeScreen());

        var row = widgetWelcomeGroupConfigRepository.find(site.id(), gid).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new WidgetWelcomeGroupConfigDto(gid, baseWelcomeText, baseShow));
        }

        var outShow = row.showWelcomeScreen() != null ? row.showWelcomeScreen() : baseShow;
        var outWelcome = row.welcomeText() != null ? row.welcomeText() : baseWelcomeText;
        return ApiResponse.ok(new WidgetWelcomeGroupConfigDto(gid, outWelcome, outShow));
    }

    @PutMapping("/{id}/widget-config/welcome-group")
    public ApiResponse<WidgetWelcomeGroupConfigDto> put(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            @RequestParam(value = "skill_group_id", required = false) String skillGroupId,
            @RequestBody WidgetWelcomeGroupConfigDto req
    ) {
        var claims = requireAdminClaims(authorization);
        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        var gid = safeTrim(skillGroupId);
        if (gid == null || gid.isBlank()) {
            gid = safeTrim(req == null ? null : req.skill_group_id());
        }
        if (gid == null || gid.isBlank()) {
            throw new IllegalArgumentException("skill_group_id_required");
        }

        skillGroupRepository.findById(claims.tenantId(), gid)
                .orElseThrow(() -> new IllegalArgumentException("group_not_found"));

        var welcomeText = emptyToNull(req == null ? null : req.welcome_text());
        var showWelcomeScreen = req != null && req.show_welcome_screen() != null
                ? req.show_welcome_screen()
                : DEFAULT_SHOW_WELCOME_SCREEN;

        widgetWelcomeGroupConfigRepository.upsert(site.id(), gid, welcomeText, showWelcomeScreen);

        var base = widgetConfigRepository.findBySiteId(site.id()).orElse(null);
        var baseWelcomeText = base == null ? null : base.welcomeText();
        var baseShow = base == null ? DEFAULT_SHOW_WELCOME_SCREEN : Boolean.TRUE.equals(base.showWelcomeScreen());

        var row = widgetWelcomeGroupConfigRepository.find(site.id(), gid).orElse(null);
        if (row == null) {
            return ApiResponse.ok(new WidgetWelcomeGroupConfigDto(gid, baseWelcomeText, baseShow));
        }

        var outShow = row.showWelcomeScreen() != null ? row.showWelcomeScreen() : baseShow;
        var outWelcome = row.welcomeText() != null ? row.welcomeText() : baseWelcomeText;
        return ApiResponse.ok(new WidgetWelcomeGroupConfigDto(gid, outWelcome, outShow));
    }

    private JwtClaims requireAdminClaims(String authorization) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }
        return claims;
    }

    private static String safeTrim(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }

    private static String emptyToNull(String s) {
        var t = safeTrim(s);
        return (t == null || t.isBlank()) ? null : t;
    }
}
