import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    Button,
    Card,
    Divider,
    Input,
    List,
    Space,
    Tag,
    Typography,
    Upload,
} from "antd";
import type { UploadProps } from "antd";

import { useChatStore } from "../store/chatStore";
import { isPreviewableImage } from "../utils/attachments";

function formatBytes(n?: number) {
    const v = Number(n || 0);
    if (!v) return "";
    const units = ["B", "KB", "MB", "GB"]; 
    let i = 0;
    let x = v;
    while (x >= 1024 && i < units.length - 1) {
        x /= 1024;
        i++;
    }
    return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ConversationChatPage() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const { id } = useParams();
    const conversationId = id || "";

    const wsStatus = useChatStore((s) => s.wsStatus);
    const uploading = useChatStore((s) => s.uploading);

    const messages = useChatStore(
        (s) => (conversationId ? (s.messagesByConversationId[conversationId] || []) : []),
    );
    const draft = useChatStore(
        (s) => (conversationId ? (s.draftByConversationId[conversationId] ?? "") : ""),
    );

    const loadHistory = useChatStore((s) => s.loadHistory);
    const connectWs = useChatStore((s) => s.connectWs);
    const selectConversation = useChatStore((s) => s.selectConversation);
    const sendText = useChatStore((s) => s.sendText);
    const sendFile = useChatStore((s) => s.sendFile);
    const downloadAttachment = useChatStore((s) => s.downloadAttachment);
    const setDraft = useChatStore((s) => s.setDraft);

    const wsConnected = wsStatus === "connected";

    // Ensure WS is connected after login globally; calling here is idempotent.
    useEffect(() => {
        connectWs();
    }, [connectWs]);

    const onSendText = () => {
        const text = String(draft || "").trim();
        if (!text || !conversationId) return;
        sendText(conversationId, text);
        setDraft(conversationId, "");
    };

    const onDownloadAttachment = async (attachmentId?: string) => {
        if (!attachmentId) return;
        const url = await downloadAttachment(attachmentId);
        if (!url) return;
        window.open(url, "_blank");
    };

    const attachmentUrlCacheRef = useRef<Record<string, string>>({});
    const attachmentUrlPendingRef = useRef<Record<string, Promise<string | null>>>({});

    function InlineImageAttachment(props: { attachmentId?: string; filename?: string; mime?: string }) {
        const { attachmentId, filename, mime } = props;
        const [url, setUrl] = useState<string | null>(null);
        const isImg = isPreviewableImage(mime, filename);

        useEffect(() => {
            let alive = true;
            const id = String(attachmentId || "");
            if (!isImg || !id) return;

            const cached = attachmentUrlCacheRef.current[id];
            if (cached) {
                setUrl(cached);
                return;
            }

            const pending = attachmentUrlPendingRef.current[id];
            const p =
                pending ||
                (attachmentUrlPendingRef.current[id] = downloadAttachment(id)
                    .then((u) => {
                        const next = u || null;
                        if (next) attachmentUrlCacheRef.current[id] = next;
                        return next;
                    })
                    .catch(() => null)
                    .finally(() => {
                        delete attachmentUrlPendingRef.current[id];
                    }));

            void p.then((u) => {
                if (!alive) return;
                setUrl(u);
            });

            return () => {
                alive = false;
            };
        }, [attachmentId, filename, mime, isImg]);

        if (!isImg) return null;
        if (!url) return null;

        return (
            <img
                src={url}
                alt={filename || "image"}
                loading="lazy"
                style={{ display: "block", maxWidth: 260, maxHeight: 320, height: "auto", borderRadius: 10, cursor: "pointer" }}
                onClick={() => window.open(url, "_blank")}
            />
        );
    }

    const uploadProps: UploadProps = {
        beforeUpload: async (file) => {
            if (!conversationId) return false;
            await sendFile(conversationId, file as File);
            return false;
        },
        showUploadList: false,
        disabled: !wsConnected || uploading,
    };

    useEffect(() => {
        if (!conversationId) return;
        selectConversation(conversationId);
        loadHistory(conversationId, 50).catch(() => {
            // ignore
        });
        // best-effort cleanup
        return () => {
            selectConversation(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    const wsTagColor = useMemo(() => (wsConnected ? "green" : "default"), [wsConnected]);

    return (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Card
                title={
                    <Space size={10} wrap>
                        <Button onClick={() => nav("/conversations")}>
                            {t("common.back")}
                        </Button>
                        <Typography.Text>
                            {t("conversationChat.title")}
                        </Typography.Text>
                        <Typography.Text code>{conversationId}</Typography.Text>
                        <Tag color={wsTagColor}>
                            {t("conversationChat.ws")}: {wsConnected ? t("conversationChat.wsStatus.connected") : t("conversationChat.wsStatus.disconnected")}
                        </Tag>
                    </Space>
                }
            >
                <List
                    dataSource={messages}
                    size="small"
                    renderItem={(m) => (
                        <List.Item key={m.id}>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                <Space size={8} wrap>
                                    <Typography.Text code>{m.id}</Typography.Text>
                                    <Typography.Text type="secondary">
                                        {m.sender_type}:{m.sender_id}
                                    </Typography.Text>
                                    <Typography.Text type="secondary">
                                        {new Date(m.created_at * 1000).toLocaleTimeString()}
                                    </Typography.Text>
                                </Space>

                                {m.content_type === "text" ? (
                                    <Typography.Text>{m.content?.text || ""}</Typography.Text>
                                ) : (
                                    <Space size={8} wrap>
                                        {isPreviewableImage(m.content?.mime, m.content?.filename) ? (
                                            <InlineImageAttachment
                                                attachmentId={m.content?.attachment_id}
                                                filename={m.content?.filename}
                                                mime={m.content?.mime}
                                            />
                                        ) : null}
                                        <Typography.Text>
                                            {m.content?.filename || m.content?.attachment_id || "file"}
                                        </Typography.Text>
                                        <Typography.Text type="secondary">
                                            {formatBytes(m.content?.size_bytes)}
                                        </Typography.Text>
                                        <Button
                                            type="link"
                                            onClick={() => onDownloadAttachment(m.content?.attachment_id)}
                                            disabled={!m.content?.attachment_id}
                                        >
                                            {t("common.download")}
                                        </Button>
                                    </Space>
                                )}
                            </Space>
                        </List.Item>
                    )}
                />

                <Divider style={{ margin: "12px 0" }} />

                <Space.Compact style={{ width: "100%" }}>
                    <Input
                        value={draft}
                        onChange={(e) => {
                            if (!conversationId) return;
                            setDraft(conversationId, e.target.value);
                        }}
                        onPressEnter={onSendText}
                        placeholder={t("conversationChat.messagePlaceholder")}
                        disabled={!wsConnected}
                    />
                    <Button type="primary" onClick={onSendText} disabled={!wsConnected || !draft.trim()}>
                        {t("conversationChat.send")}
                    </Button>
                    <Upload {...uploadProps}>
                        <Button loading={uploading} disabled={!wsConnected}>
                            {t("conversationChat.sendAttachment")}
                        </Button>
                    </Upload>
                </Space.Compact>

            </Card>
        </Space>
    );
}
