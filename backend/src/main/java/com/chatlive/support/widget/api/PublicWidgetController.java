package com.chatlive.support.widget.api;

import com.chatlive.support.common.api.ApiResponse;
import com.chatlive.support.widget.service.PublicWidgetService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public/widget")
public class PublicWidgetController {

    private final PublicWidgetService publicWidgetService;

    public PublicWidgetController(PublicWidgetService publicWidgetService) {
        this.publicWidgetService = publicWidgetService;
    }

    @PostMapping("/bootstrap")
    public ApiResponse<WidgetBootstrapResponse> bootstrap(HttpServletRequest request, @Valid @RequestBody WidgetBootstrapRequest req) {
        return ApiResponse.ok(publicWidgetService.bootstrap(request, req));
    }
}
