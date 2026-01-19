package com.chatlive.support.widget.api;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chatlive.support.widget.service.WidgetAssetInfo;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@RestController
@RequestMapping("/chatlive")
public class WidgetAssetController {

    private final WidgetAssetInfo widgetAssetInfo;

    public WidgetAssetController(WidgetAssetInfo widgetAssetInfo) {
        this.widgetAssetInfo = widgetAssetInfo;
    }

    @GetMapping(value = "/widget.js")
    public ResponseEntity<byte[]> widgetStable(
            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch
    ) {
        // Stable URL: keep a short TTL so hotfixes propagate without changing integrations.
        return respond(ifNoneMatch, CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic().mustRevalidate());
    }

    @GetMapping(value = "/widget/{version}/widget.js")
    public ResponseEntity<byte[]> widgetVersioned(
            @PathVariable("version") String version,
            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch
    ) {
        // Versioned URL: allow long-lived immutable caching.
        var expected = widgetAssetInfo.versionSegment();
        if (!expected.equals(version)) {
            return ResponseEntity.status(HttpStatus.FOUND)
                    .header(HttpHeaders.LOCATION, "/chatlive/widget/" + expected + "/widget.js")
                    .build();
        }
        return respond(ifNoneMatch, CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }

    private ResponseEntity<byte[]> respond(String ifNoneMatch, CacheControl cacheControl) {
        var etag = widgetAssetInfo.etag();
        if (ifNoneMatch != null && ifNoneMatch.trim().equals(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag)
                    .cacheControl(cacheControl)
                    .build();
        }

        return ResponseEntity.ok()
                .contentType(new MediaType("application", "javascript", StandardCharsets.UTF_8))
                .cacheControl(cacheControl)
                .eTag(etag)
                .body(widgetAssetInfo.bytes());
    }
}
