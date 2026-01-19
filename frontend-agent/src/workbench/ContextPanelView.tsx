import { Divider, Tabs, Typography } from "antd";

import type { Conversation, ConversationDetail, ConversationMeta } from "../store/chatStore";
import { getDefaultContextPanelTabs } from "./contextPanel/contextPanelRegistry";

export type ContextPanelViewProps = {
    t: (key: string, options?: Record<string, unknown>) => string;

    tabKey: string;
    setTabKey: (next: string) => void;

    selectedId: string | null;
    selected: Conversation | null;

    detail: ConversationDetail | null;
    detailLoading: boolean;

    meta: ConversationMeta | null;
    metaLoading: boolean;

    anonymousEnabled?: boolean;
    onSetTags: (conversationId: string, tags: string[]) => Promise<void>;
    onSetMetaLocal: (conversationId: string, meta: ConversationMeta) => void;
    onSetNote: (conversationId: string, note: string) => Promise<void>;
};

export function ContextPanelView({
    t,
    tabKey,
    setTabKey,
    selectedId,
    selected,
    detail,
    detailLoading,
    meta,
    metaLoading,
    anonymousEnabled = false,
    onSetTags,
    onSetMetaLocal,
    onSetNote,
}: ContextPanelViewProps) {
    const tabs = getDefaultContextPanelTabs(t);

    return (
        <div style={{ padding: 12 }}>
            <Typography.Text strong>{t("workbench.userInfo")}</Typography.Text>
            <Divider style={{ margin: "12px 0" }} />

            <Tabs
                activeKey={tabKey}
                onChange={setTabKey}
                items={tabs
                    .filter((tab) => (tab.shouldShow ? tab.shouldShow({
                        t,
                        tabKey,
                        setTabKey,
                        selectedId,
                        selected,
                        detail,
                        detailLoading,
                        meta,
                        metaLoading,
                        anonymousEnabled,
                        onSetTags,
                        onSetMetaLocal,
                        onSetNote,
                    }) : true))
                    .map((tab) => ({
                        key: tab.key,
                        label: tab.icon,
                        children: tab.render({
                            t,
                            tabKey,
                            setTabKey,
                            selectedId,
                            selected,
                            detail,
                            detailLoading,
                            meta,
                            metaLoading,
                            anonymousEnabled,
                            onSetTags,
                            onSetMetaLocal,
                            onSetNote,
                        }),
                    }))}
            />
        </div>
    );
}
