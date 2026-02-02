package com.chatlive.support.widget.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.service.WidgetAssetInfo;
import com.chatlive.support.widget.service.SiteWizardService;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/sites")
public class AdminSiteController {

    public record CreateSiteWizardRequest(
        String name,
        String allowlist_domain,
        String theme_color,
        String welcome_text,
        String cookie_domain,
        String cookie_samesite
    ) {
    }

    public record CreateSiteWizardResponse(
        String site_id,
        String site_key
    ) {
    }

    public record SiteItem(String id, String name, String public_key, String status) {
    }

    public record WidgetSnippetResponse(
            String site_id,
            String site_key,
            String embed_url,
            String widget_script_url,
            String widget_script_versioned_url,
            String cookie_domain,
            String cookie_samesite,
            String snippet_html
    ) {
    }

    private final JwtService jwtService;
    private final SiteRepository siteRepository;
    private final WidgetConfigRepository widgetConfigRepository;
    private final WidgetAssetInfo widgetAssetInfo;
    private final SiteWizardService siteWizardService;

    @Value("${app.widget.public-script-base-url:}")
    private String publicScriptBaseUrl;

    @Value("${app.widget.public-embed-url:http://localhost:5173/visitor/embed}")
    private String publicEmbedUrl;

    public AdminSiteController(
            JwtService jwtService,
            SiteRepository siteRepository,
            WidgetConfigRepository widgetConfigRepository,
            WidgetAssetInfo widgetAssetInfo,
            SiteWizardService siteWizardService
    ) {
        this.jwtService = jwtService;
        this.siteRepository = siteRepository;
        this.widgetConfigRepository = widgetConfigRepository;
        this.widgetAssetInfo = widgetAssetInfo;
        this.siteWizardService = siteWizardService;
    }

    @GetMapping
    public ApiResponse<List<SiteItem>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var rows = siteRepository.listByTenant(claims.tenantId());
        var items = rows.stream()
                .map(r -> new SiteItem(r.id(), r.name(), r.publicKey(), r.status()))
                .toList();
        return ApiResponse.ok(items);
    }

    @PostMapping("/wizard")
    public ApiResponse<CreateSiteWizardResponse> createWizard(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody CreateSiteWizardRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var created = siteWizardService.createWizard(
                claims.tenantId(),
                req == null ? null : req.name(),
                req == null ? null : req.allowlist_domain(),
                req == null ? null : req.theme_color(),
                req == null ? null : req.welcome_text(),
                req == null ? null : req.cookie_domain(),
                req == null ? null : req.cookie_samesite()
        );

        return ApiResponse.ok(new CreateSiteWizardResponse(created.siteId(), created.publicKey()));
    }

    @GetMapping("/{id}/widget/snippet")
    public ApiResponse<WidgetSnippetResponse> snippet(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String siteId,
            HttpServletRequest request
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);
        if (!"admin".equals(claims.role())) {
            throw new IllegalArgumentException("forbidden");
        }

        var site = siteRepository.findById(claims.tenantId(), siteId)
                .orElseThrow(() -> new IllegalArgumentException("site_not_found"));

        String scriptBase = (publicScriptBaseUrl != null && !publicScriptBaseUrl.isBlank())
                ? trimTrailingSlash(publicScriptBaseUrl)
                : deriveBaseUrl(request);

        var widgetScriptUrl = scriptBase + "/chatlive/widget.js";
        var widgetScriptVersionedUrl = scriptBase + "/chatlive/widget/" + widgetAssetInfo.versionSegment() + "/widget.js";

        var widgetConfig = widgetConfigRepository.findBySiteId(site.id()).orElse(null);
        var themeColor = widgetConfig != null ? widgetConfig.themeColor() : null;
        var cookieDomain = widgetConfig != null ? widgetConfig.cookieDomain() : null;
        var cookieSameSite = widgetConfig != null ? widgetConfig.cookieSameSite() : null;

        var launcherStyle = widgetConfig != null ? widgetConfig.launcherStyle() : null;
        var themeMode = widgetConfig != null ? widgetConfig.themeMode() : null;
        var colorSettingsMode = widgetConfig != null ? widgetConfig.colorSettingsMode() : null;
        var colorOverridesJson = widgetConfig != null ? widgetConfig.colorOverridesJson() : null;

        var position = widgetConfig != null ? widgetConfig.position() : null;
        var zIndex = widgetConfig != null ? widgetConfig.zIndex() : null;
        var launcherText = widgetConfig != null ? widgetConfig.launcherText() : null;
        var width = widgetConfig != null ? widgetConfig.width() : null;
        var height = widgetConfig != null ? widgetConfig.height() : null;
        var autoHeight = widgetConfig != null ? widgetConfig.autoHeight() : null;
        var autoHeightMode = widgetConfig != null ? widgetConfig.autoHeightMode() : null;
        var minHeight = widgetConfig != null ? widgetConfig.minHeight() : null;
        var maxHeightRatio = widgetConfig != null ? widgetConfig.maxHeightRatio() : null;
        var mobileBreakpoint = widgetConfig != null ? widgetConfig.mobileBreakpoint() : null;
        var mobileFullscreen = widgetConfig != null ? widgetConfig.mobileFullscreen() : null;
        var offsetX = widgetConfig != null ? widgetConfig.offsetX() : null;
        var offsetY = widgetConfig != null ? widgetConfig.offsetY() : null;
        var debug = widgetConfig != null ? widgetConfig.debug() : null;

        var snippet = buildSnippetHtml(
            site.publicKey(),
            publicEmbedUrl,
            widgetScriptVersionedUrl,
            themeColor,
            cookieDomain,
            cookieSameSite,
            launcherStyle,
            themeMode,
            colorSettingsMode,
            colorOverridesJson,
            position,
            zIndex,
            launcherText,
            width,
            height,
            autoHeight,
            autoHeightMode,
            minHeight,
            maxHeightRatio,
            mobileBreakpoint,
            mobileFullscreen,
            offsetX,
            offsetY,
            debug
        );

        return ApiResponse.ok(new WidgetSnippetResponse(
                site.id(),
                site.publicKey(),
                publicEmbedUrl,
                widgetScriptUrl,
                widgetScriptVersionedUrl,
                emptyToNull(cookieDomain),
                emptyToNull(cookieSameSite),
                snippet
        ));
    }

    private static String buildSnippetHtml(
            String siteKey,
            String embedUrl,
            String scriptUrl,
            String themeColor,
            String cookieDomain,
            String cookieSameSite,
            String launcherStyle,
            String themeMode,
            String colorSettingsMode,
            String colorOverridesJson,
            String position,
            Integer zIndex,
            String launcherText,
            Integer width,
            Integer height,
            Boolean autoHeight,
            String autoHeightMode,
            Integer minHeight,
            Double maxHeightRatio,
            Integer mobileBreakpoint,
            Boolean mobileFullscreen,
            Integer offsetX,
            Integer offsetY,
            Boolean debug
    ) {
        var sb = new StringBuilder();
        sb.append("<script\n");
        sb.append("  defer\n");
        sb.append("  src=\"").append(escapeAttr(scriptUrl)).append("\"\n");
        sb.append("  data-chatlive-site-key=\"").append(escapeAttr(siteKey)).append("\"\n");
        sb.append("  data-chatlive-embed-url=\"").append(escapeAttr(embedUrl)).append("\"\n");

        // Backward-compatible default: keep auto-height enabled unless explicitly disabled.
        sb.append("  data-chatlive-auto-height=\"").append(Boolean.FALSE.equals(autoHeight) ? "false" : "true").append("\"\n");

        if (themeColor != null && !themeColor.isBlank()) {
            sb.append("  data-chatlive-theme-color=\"").append(escapeAttr(themeColor)).append("\"\n");
        }
        if (launcherStyle != null && !launcherStyle.isBlank()) {
            sb.append("  data-chatlive-launcher-style=\"").append(escapeAttr(launcherStyle)).append("\"\n");
        }
        if (themeMode != null && !themeMode.isBlank()) {
            sb.append("  data-chatlive-theme-mode=\"").append(escapeAttr(themeMode)).append("\"\n");
        }
        if (colorSettingsMode != null && !colorSettingsMode.isBlank()) {
            sb.append("  data-chatlive-color-settings-mode=\"").append(escapeAttr(colorSettingsMode)).append("\"\n");
        }
        if (colorOverridesJson != null && !colorOverridesJson.isBlank()) {
            sb.append("  data-chatlive-color-overrides-json=\"").append(escapeAttr(colorOverridesJson)).append("\"\n");
        }
        if (position != null && !position.isBlank()) {
            sb.append("  data-chatlive-position=\"").append(escapeAttr(position)).append("\"\n");
        }
        if (zIndex != null) {
            sb.append("  data-chatlive-z-index=\"").append(zIndex).append("\"\n");
        }
        if (launcherText != null && !launcherText.isBlank()) {
            sb.append("  data-chatlive-launcher-text=\"").append(escapeAttr(launcherText)).append("\"\n");
        }
        if (width != null) {
            sb.append("  data-chatlive-width=\"").append(width).append("\"\n");
        }
        if (height != null) {
            sb.append("  data-chatlive-height=\"").append(height).append("\"\n");
        }
        if (autoHeightMode != null && !autoHeightMode.isBlank()) {
            sb.append("  data-chatlive-auto-height-mode=\"").append(escapeAttr(autoHeightMode)).append("\"\n");
        }
        if (minHeight != null) {
            sb.append("  data-chatlive-min-height=\"").append(minHeight).append("\"\n");
        }
        if (maxHeightRatio != null) {
            sb.append("  data-chatlive-max-height-ratio=\"").append(maxHeightRatio).append("\"\n");
        }
        if (mobileBreakpoint != null) {
            sb.append("  data-chatlive-mobile-breakpoint=\"").append(mobileBreakpoint).append("\"\n");
        }
        if (mobileFullscreen != null) {
            sb.append("  data-chatlive-mobile-fullscreen=\"").append(Boolean.TRUE.equals(mobileFullscreen) ? "true" : "false").append("\"\n");
        }
        if (offsetX != null) {
            sb.append("  data-chatlive-offset-x=\"").append(offsetX).append("\"\n");
        }
        if (offsetY != null) {
            sb.append("  data-chatlive-offset-y=\"").append(offsetY).append("\"\n");
        }
        if (debug != null) {
            sb.append("  data-chatlive-debug=\"").append(Boolean.TRUE.equals(debug) ? "true" : "false").append("\"\n");
        }
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            sb.append("  data-chatlive-cookie-domain=\"").append(escapeAttr(cookieDomain)).append("\"\n");
        }
        if (cookieSameSite != null && !cookieSameSite.isBlank()) {
            sb.append("  data-chatlive-cookie-samesite=\"").append(escapeAttr(cookieSameSite)).append("\"\n");
        }
        sb.append("></script>");
        return sb.toString();
    }

    private static String emptyToNull(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }

    private static String escapeAttr(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private static String trimTrailingSlash(String s) {
        if (s == null) return "";
        var t = s.trim();
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        return t;
    }

    private static String deriveBaseUrl(HttpServletRequest req) {
        var scheme = req.getScheme();
        var host = req.getServerName();
        var port = req.getServerPort();

        // Avoid default ports in URLs.
        if (("http".equalsIgnoreCase(scheme) && port == 80) || ("https".equalsIgnoreCase(scheme) && port == 443)) {
            return scheme + "://" + host;
        }
        return scheme + "://" + host + ":" + port;
    }
}
