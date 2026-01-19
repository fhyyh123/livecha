package com.chatlive.support.widget.api;

public record WidgetBootstrapResponse(
        String visitor_token,
        String visitor_id,
        String tenant_id,
        String site_id,
        WidgetConfigDto widget_config
) {
}
