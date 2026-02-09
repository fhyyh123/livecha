package com.chatlive.support.widget.api;

import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.service.PublicWidgetService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public/widget")
public class PublicWidgetController {

    private final PublicWidgetService publicWidgetService;

    public PublicWidgetController(PublicWidgetService publicWidgetService) {
        this.publicWidgetService = publicWidgetService;
    }

    @PostMapping("/bootstrap")
    public ApiResponse<WidgetBootstrapResponse> bootstrap(HttpServletRequest request, @jakarta.validation.Valid @RequestBody WidgetBootstrapRequest req) {
        return ApiResponse.ok(publicWidgetService.bootstrap(request, req));
    }

    /**
     * Lightweight access check for the host page launcher.
     * Always returns 200 with a minimal JSON body so the host can decide whether to render the launcher.
     */
    @PostMapping("/check")
    public WidgetAccessCheckResponse check(HttpServletRequest request,
                                           @RequestParam(value = "site_key", required = false) String siteKeyParam,
                                           @RequestBody(required = false) WidgetAccessCheckRequest req) {
        try {
            var siteKey = (siteKeyParam != null && !siteKeyParam.isBlank())
                    ? siteKeyParam
                    : (req == null ? "" : req.site_key());
            var banned = publicWidgetService.isBannedNow(request, siteKey);
            return new WidgetAccessCheckResponse(banned);
        } catch (Exception ignore) {
            return new WidgetAccessCheckResponse(false);
        }
    }
}
