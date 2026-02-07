import type { UploadProps } from "antd";
import {
    Button,
    Input,
    Segmented,
    Space,
    Tooltip,
    Upload,
} from "antd";
import {
    PaperClipOutlined,
    SmileOutlined,
    TagOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { extractImageFilesFromClipboardData } from "../utils/clipboard";

export type ChatComposerProps = {
    t: (key: string, options?: Record<string, unknown>) => string;

    draft: string;
    setDraft: (next: string) => void;

    wsStatus: "disconnected" | "connecting" | "connected";
    conversationStatus?: string | null;

    uploading: boolean;
    uploadProps: UploadProps;

    onSendText: () => void;
    onOpenQuickReplies: () => void;
};

export function ChatComposer({
    t,
    draft,
    setDraft,
    wsStatus,
    conversationStatus,
    uploading,
    uploadProps,
    onSendText,
    onOpenQuickReplies,
}: ChatComposerProps) {
    const [composerMode, setComposerMode] = useState<"message" | "private" | "system">("message");

    const [pastedImages, setPastedImages] = useState<Array<{ file: File; url: string }>>([]);

    useEffect(() => {
        return () => {
            for (const it of pastedImages) {
                try {
                    if (it?.url) URL.revokeObjectURL(it.url);
                } catch {
                    // ignore
                }
            }
        };
    }, [pastedImages]);

    const composerDisabled = wsStatus !== "connected" || conversationStatus === "closed";

    const canSend = useMemo(() => {
        if (composerDisabled) return false;
        if (composerMode !== "message") return false;
        return Boolean(draft.trim()) || pastedImages.length > 0;
    }, [composerDisabled, composerMode, draft, pastedImages.length]);

    function insertText(at: string) {
        if (!at) return;
        setDraft(`${draft || ""}${draft ? " " : ""}${at}`);
    }

    function onComposerKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
        // Enter to send (Shift+Enter for newline)
        if (e.key === "Enter" && !e.shiftKey) {
            if (!canSend) return;
            e.preventDefault();
            void onSend();
        }
    }

    function onComposerPaste(e: ReactClipboardEvent<HTMLTextAreaElement>) {
        if (composerDisabled) return;
        if (composerMode !== "message") return;
        const files = extractImageFilesFromClipboardData(e.clipboardData, { filenameBase: "pasted-image" });
        if (!files.length) return;
        try {
            e.preventDefault();
        } catch {
            // ignore
        }

        setPastedImages((prev) => {
            const next = [...prev];
            for (const f of files) {
                try {
                    next.push({ file: f, url: URL.createObjectURL(f) });
                } catch {
                    // ignore
                }
            }
            return next;
        });
    }

    async function sendPastedImagesIfAny(): Promise<void> {
        if (!pastedImages.length) return;
        const beforeUpload = uploadProps?.beforeUpload;
        if (typeof beforeUpload !== "function") return;

        const remaining: Array<{ file: File; url: string }> = [];
        for (const it of pastedImages) {
            try {
                await beforeUpload(
                    it.file as unknown as Parameters<NonNullable<typeof beforeUpload>>[0],
                    [] as unknown as Parameters<NonNullable<typeof beforeUpload>>[1],
                );
                try {
                    if (it.url) URL.revokeObjectURL(it.url);
                } catch {
                    // ignore
                }
            } catch {
                // Keep failed ones so user can retry.
                remaining.push(it);
            }
        }

        setPastedImages(remaining);
    }

    async function onSend() {
        if (!canSend) return;
        if (composerDisabled) return;
        if (composerMode !== "message") return;

        await sendPastedImagesIfAny();
        if (draft.trim()) onSendText();
    }

    return (
        <div className="cl-composer">
            <div className="cl-composerBody">
                {pastedImages.length ? (
                    <div className="cl-composerPastePreviewList" aria-label={t("workbench.sendAttachment")}>
                        {pastedImages.map((it, idx) => (
                            <div className="cl-composerPastePreview" key={`${it.file.name || "pasted"}:${idx}:${it.file.size}`}>
                                <img
                                    src={it.url}
                                    alt={it.file.name || "image"}
                                    className="cl-composerPastePreviewImg"
                                    draggable={false}
                                    onDragStart={(e) => {
                                        try {
                                            e.preventDefault();
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                />
                                <div className="cl-composerPastePreviewMeta" title={it.file.name || ""}>
                                    {it.file.name || "pasted-image"}
                                </div>
                                <Button
                                    size="small"
                                    type="text"
                                    aria-label={t("common.remove")}
                                    onClick={() =>
                                        setPastedImages((prev) => {
                                            const next = [...prev];
                                            const removed = next.splice(idx, 1)[0];
                                            try {
                                                if (removed?.url) URL.revokeObjectURL(removed.url);
                                            } catch {
                                                // ignore
                                            }
                                            return next;
                                        })
                                    }
                                >
                                    ×
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : null}

                <Input.TextArea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    onPaste={onComposerPaste}
                    autoSize={{ minRows: 4, maxRows: 10 }}
                    placeholder={
                        composerMode === "message"
                            ? t("workbench.messagePlaceholder")
                            : t("workbench.composer.notSupportedPlaceholder")
                    }
                    disabled={composerDisabled}
                    className="cl-composerInput"
                />

                <div className="cl-composerFooter">
                    <div className="cl-composerFooterLeft">
                        <Segmented
                            size="small"
                            value={composerMode}
                            onChange={(v) => setComposerMode(v as typeof composerMode)}
                            options={[
                                { label: t("workbench.composer.mode.message"), value: "message" },
                                { label: t("workbench.composer.mode.private"), value: "private" },
                                { label: t("workbench.composer.mode.system"), value: "system" },
                            ]}
                        />

                        <Space size={4} className="cl-composerActions">
                            <Tooltip title={t("workbench.quickReplies")}
                            >
                                <Button size="small" icon={<ThunderboltOutlined />} onClick={onOpenQuickReplies} />
                            </Tooltip>

                            <Upload {...uploadProps}>
                                <Tooltip title={t("workbench.sendAttachment")}
                                >
                                    <Button
                                        size="small"
                                        icon={<PaperClipOutlined />}
                                        loading={uploading}
                                        disabled={composerDisabled}
                                    />
                                </Tooltip>
                            </Upload>

                            <Tooltip title={t("workbench.tags")}
                            >
                                <Button size="small" icon={<TagOutlined />} disabled />
                            </Tooltip>

                            <Tooltip title={t("workbench.composer.emoji")}
                            >
                                <Button
                                    size="small"
                                    icon={<SmileOutlined />}
                                    onClick={() => insertText("😊")}
                                    disabled={composerDisabled}
                                />
                            </Tooltip>
                        </Space>
                    </div>

                    <div className="cl-composerFooterRight">
                        <div className="cl-composerHint">{t("workbench.composer.shiftEnterHint")}</div>
                        <Tooltip title={composerMode === "message" ? "" : t("workbench.composer.notSupported")}
                        >
                            <Button type="primary" onClick={() => void onSend()} disabled={!canSend}>
                                {t("workbench.send")}
                            </Button>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {composerMode === "message" ? null : (
                <div className="cl-modeHint">{t("workbench.composer.notSupported")}</div>
            )}
        </div>
    );
}
