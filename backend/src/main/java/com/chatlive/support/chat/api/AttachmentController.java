package com.chatlive.support.chat.api;

import com.chatlive.support.auth.service.jwt.JwtService;
import com.chatlive.support.chat.service.AttachmentService;
import com.chatlive.support.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class AttachmentController {

    private final JwtService jwtService;
    private final AttachmentService attachmentService;

    public AttachmentController(JwtService jwtService, AttachmentService attachmentService) {
        this.jwtService = jwtService;
        this.attachmentService = attachmentService;
    }

    @PostMapping("/attachments/presign-upload")
    public ApiResponse<PresignUploadResponse> presignUpload(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody PresignUploadRequest req
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);

        var result = attachmentService.presignUpload(
                claims,
                req.conversation_id(),
                req.filename(),
                req.content_type(),
                req.size_bytes() == null ? 0 : req.size_bytes()
        );

        return ApiResponse.ok(new PresignUploadResponse(
                result.attachmentId(),
                result.uploadUrl(),
                result.expiresInSeconds(),
                result.maxUploadBytes()
        ));
    }

    @GetMapping("/attachments/{id}/presign-download")
    public ApiResponse<PresignDownloadResponse> presignDownload(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") String attachmentId
    ) {
        var token = JwtService.extractBearerToken(authorization)
                .orElseThrow(() -> new IllegalArgumentException("missing_token"));
        var claims = jwtService.parse(token);

        var result = attachmentService.presignDownload(claims, attachmentId);
        return ApiResponse.ok(new PresignDownloadResponse(
                result.attachmentId(),
                result.downloadUrl(),
                result.expiresInSeconds()
        ));
    }
}
