package com.chatlive.support.chat.api;

public record PresignDownloadResponse(
        String attachment_id,
        String download_url,
        long expires_in_seconds
) {
}
