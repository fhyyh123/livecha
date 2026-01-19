package com.chatlive.support.chat.api;

public record PresignUploadResponse(
        String attachment_id,
        String upload_url,
        long expires_in_seconds,
        long max_upload_bytes
) {
}
