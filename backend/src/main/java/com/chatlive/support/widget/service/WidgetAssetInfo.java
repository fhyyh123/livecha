package com.chatlive.support.widget.service;

import org.springframework.boot.info.BuildProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.MessageDigest;

@Component
public class WidgetAssetInfo {

    private final byte[] widgetJsBytes;
    private final String etag;
    private final String assetVersion;
    private final String contentHashShort;

    public WidgetAssetInfo(ObjectProvider<BuildProperties> buildPropertiesProvider) {
        var bp = buildPropertiesProvider != null ? buildPropertiesProvider.getIfAvailable() : null;
        this.assetVersion = sanitizeVersion(bp != null ? bp.getVersion() : "dev");
        try {
            var res = new ClassPathResource("assets/widget.js");
            this.widgetJsBytes = res.getInputStream().readAllBytes();
            var sha = sha256Hex(widgetJsBytes);
            this.etag = "\"sha256-" + sha + "\"";
            this.contentHashShort = sha.length() <= 12 ? sha : sha.substring(0, 12);
        } catch (IOException e) {
            throw new IllegalStateException("widget_asset_load_failed", e);
        }
    }

    public String version() {
        return assetVersion;
    }

    public String versionSegment() {
        // Use content hash so the URL changes whenever widget.js changes (cache busting).
        return "v" + contentHashShort;
    }

    public byte[] bytes() {
        return widgetJsBytes;
    }

    public String etag() {
        return etag;
    }

    private static String sanitizeVersion(String v) {
        if (v == null) return "dev";
        var t = v.trim();
        if (t.isEmpty()) return "dev";
        // keep semver-ish chars only (letters/digits . -)
        t = t.replaceAll("[^0-9A-Za-z.\\-]", "");
        return t.isEmpty() ? "dev" : t;
    }

    private static String sha256Hex(byte[] bytes) {
        try {
            var md = MessageDigest.getInstance("SHA-256");
            var digest = md.digest(bytes);
            var sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("sha256_failed", e);
        }
    }
}
