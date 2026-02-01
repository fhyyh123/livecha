import { Empty, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { Conversation, ConversationDetail, ConversationMeta } from "../../../store/chatStore";

type Props = {
    t: (key: string, options?: Record<string, unknown>) => string;

    selectedId: string | null;
    selected: Conversation | null;
    detail: ConversationDetail | null;
    detailLoading: boolean;

    meta: ConversationMeta | null;
    metaLoading: boolean;

    onSetTags: (conversationId: string, tags: string[]) => Promise<void>;
    onSetMetaLocal: (conversationId: string, meta: ConversationMeta) => void;
    onSetNote: (conversationId: string, note: string) => Promise<void>;

    embedded?: boolean;
};

export function DetailsTab(props: Props) {
    const { t, selectedId, selected, detail, detailLoading, embedded = false } = props;
    if (!selectedId) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />;
    }

    const formatDuration = (seconds: number) => {
        const s = Math.max(0, Math.floor(seconds));
        if (s < 60) return `${s}s`;
        const minutes = Math.floor(s / 60);
        const rem = s % 60;
        if (minutes < 60) return `${minutes}m ${rem}s`;
        const hours = Math.floor(minutes / 60);
        const remMin = minutes % 60;
        return `${hours}h ${remMin}m`;
    };

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!detail || detail.closed_at) return;
        if (Number.isFinite(detail.active_duration_seconds)) return;
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, [detail?.id, detail?.closed_at]);

    const visitCount = detail?.visitor?.visit_count;
    const chatCount = detail?.visitor?.chat_count;
    const hasCounts = Number.isFinite(visitCount) && Number.isFinite(chatCount);
    const safeVisits = hasCounts ? Number(visitCount) : 0;
    const safeChats = hasCounts ? Number(chatCount) : 0;
    const visitsLabel = hasCounts ? t("workbench.additionalInfoVisit", { count: safeVisits }) : "-";
    const chatsLabel = hasCounts ? t("workbench.additionalInfoChat", { count: safeChats }) : "-";
    const isFirstTime = hasCounts && safeVisits <= 1 && safeChats <= 1;

    const durationText = useMemo(() => {
        if (detail && Number.isFinite(detail.active_duration_seconds)) {
            return formatDuration(Number(detail.active_duration_seconds));
        }
        const createdAt = detail?.created_at || selected?.created_at;
        if (!createdAt) return null;
        const endAt =
            detail?.closed_at ||
            selected?.closed_at ||
            detail?.last_msg_at ||
            selected?.last_msg_at ||
            Math.floor(now / 1000);
        const seconds = Math.max(0, Math.floor(endAt - createdAt));
        return formatDuration(seconds);
    }, [detail?.active_duration_seconds, detail?.created_at, detail?.closed_at, detail?.last_msg_at, selected?.created_at, selected?.closed_at, selected?.last_msg_at, now]);

    const groupName = detail?.skill_group_name || t("workbench.additionalInfoGroupDefault");

    return (
        <Space direction="vertical" size={10} style={{ width: "100%", paddingTop: embedded ? 0 : 4 }}>
            {detailLoading ? (
                <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
            ) : detail ? (
                <>
                    <Typography.Text type="secondary">
                        {isFirstTime
                            ? t("workbench.additionalInfoFirstTime", { visits: visitsLabel, chats: chatsLabel })
                            : t("workbench.additionalInfoReturning", { visits: visitsLabel, chats: chatsLabel })}
                    </Typography.Text>

                    <Typography.Text type="secondary">
                        {t("workbench.additionalInfoChatDuration", { duration: durationText || "-" })}
                    </Typography.Text>

                    <div>
                        <Typography.Text type="secondary">{t("workbench.additionalInfoGroups")}: </Typography.Text>
                        <Tag color="blue" style={{ marginLeft: 6 }}>
                            G {groupName}
                        </Tag>
                    </div>
                </>
            ) : (
                <Typography.Text type="secondary">{t("workbench.additionalInfoUnknown")}</Typography.Text>
            )}
        </Space>
    );
}
