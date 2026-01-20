import { Button, Space, Tag, Typography } from "antd";
import { InfoCircleOutlined, StarFilled, StarOutlined } from "@ant-design/icons";

import type { ConversationDetail } from "../store/chatStore";

export type ConversationHeaderProps = {
    t: (key: string, options?: Record<string, unknown>) => string;

    conversationId: string;
    detail: ConversationDetail | null;

    peerTyping: boolean;
    peerLastRead: boolean;

    anonymousEnabled?: boolean;

    isNarrow: boolean;
    onOpenContextPanel: () => void;

    onToggleStar: () => void;

    onOpenQuickReplies: () => void;
};

export function ConversationHeader(props: ConversationHeaderProps) {
    const {
        t,
        detail,
        peerTyping,
        peerLastRead,
        isNarrow,
        anonymousEnabled = false,
        onOpenContextPanel,
        onToggleStar,
        onOpenQuickReplies,
    } = props;

    const title = (() => {
        if (anonymousEnabled) return t("workbench.customer");
        const name = String(detail?.visitor?.name || "").trim();
        const email = String(detail?.visitor?.email || "").trim();
        const who = name && name !== "-" ? name : (email && email !== "-" ? email : "");
        return who || detail?.subject || t("workbench.customer");
    })();

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Space size={10} wrap style={{ minWidth: 0 }}>
                <Typography.Text strong ellipsis style={{ minWidth: 0 }}>
                    {title}
                </Typography.Text>
                {peerTyping ? <Tag color="purple">{t("workbench.peerTyping")}</Tag> : null}
                {peerLastRead ? <Tag color="green">{t("workbench.peerRead")}</Tag> : null}
                {detail?.status === "closed" ? <Tag color="red">{t("workbench.closed")}</Tag> : null}
                {detail?.starred ? <Tag color="gold">{t("workbench.starred")}</Tag> : null}
            </Space>

            <Space size={8} wrap>
                {isNarrow ? (
                    <Button size="small" icon={<InfoCircleOutlined />} onClick={onOpenContextPanel}>
                        {t("workbench.userInfo")}
                    </Button>
                ) : null}

                <Button
                    size="small"
                    type={detail?.starred ? "default" : "primary"}
                    icon={detail?.starred ? <StarFilled /> : <StarOutlined />}
                    onClick={onToggleStar}
                >
                    {detail?.starred ? t("workbench.unstar") : t("workbench.star")}
                </Button>

                <Button size="small" onClick={onOpenQuickReplies}>
                    {t("workbench.quickReplies")}
                </Button>
            </Space>
        </div>
    );
}
