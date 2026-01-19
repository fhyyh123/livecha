package com.chatlive.support.chat.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record PresignUploadRequest(
        @NotBlank(message = "conversation_id_required") String conversation_id,
        @NotBlank(message = "filename_required") String filename,
        String content_type,
        @NotNull(message = "size_bytes_required") Long size_bytes
) {
}
