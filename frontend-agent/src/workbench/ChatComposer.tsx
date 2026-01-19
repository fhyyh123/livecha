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
import { useMemo, useState } from "react";

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

    const composerDisabled = wsStatus !== "connected" || conversationStatus === "closed";

    const canSend = useMemo(() => {
        if (composerDisabled) return false;
        if (composerMode !== "message") return false;
        return Boolean(draft.trim());
    }, [composerDisabled, composerMode, draft]);

    function insertText(at: string) {
        if (!at) return;
        setDraft(`${draft || ""}${draft ? " " : ""}${at}`);
    }

    function onComposerKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
        // Enter to send (Shift+Enter for newline)
        if (e.key === "Enter" && !e.shiftKey) {
            if (!canSend) return;
            e.preventDefault();
            onSendText();
        }
    }

    return (
        <div className="cl-composer">
            <div className="cl-composerBody">
                <Input.TextArea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onComposerKeyDown}
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
                            <Button type="primary" onClick={onSendText} disabled={!canSend}>
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
