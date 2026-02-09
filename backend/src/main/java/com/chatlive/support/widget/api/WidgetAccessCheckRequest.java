package com.chatlive.support.widget.api;

/**
 * Intentionally does not use bean validation annotations: the check endpoint must always return 200.
 */
public record WidgetAccessCheckRequest(
        String site_key,
        String origin
) {
}
