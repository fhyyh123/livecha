import { useMemo, type ReactNode } from "react";
import { Collapse, Divider, Empty, Space, Typography } from "antd";
import {
    GlobalOutlined,
    InfoCircleOutlined,
    LaptopOutlined,
    RightOutlined,
    RobotOutlined,
    UserOutlined,
} from "@ant-design/icons";

import type { Conversation, ConversationDetail, ConversationMeta } from "../store/chatStore";
import { CopilotTab } from "./contextPanel/tabs/CopilotTab";
import { DetailsTab } from "./contextPanel/tabs/DetailsTab";
import { ProfileTab } from "./contextPanel/tabs/ProfileTab";

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
    const allowed = useMemo(() => new Set(["customer", "additional", "visited", "technology", "copilot"]), []);

    const safeActiveKeys = useMemo(() => {
        const raw = String(tabKey || "").trim();

        const mapLegacy = (k: string) => {
            if (k === "profile") return "customer";
            if (k === "details") return "additional";
            return k;
        };

        // New storage: JSON array (e.g. ["customer","technology"]).
        if (raw.startsWith("[")) {
            try {
                const arr = JSON.parse(raw) as unknown;
                const keys = Array.isArray(arr) ? arr.map((x) => mapLegacy(String(x || ""))).filter((k) => allowed.has(k)) : [];
                return keys.length ? keys : ["customer"];
            } catch {
                // fallthrough
            }
        }

        const single = mapLegacy(raw);
        return allowed.has(single) ? [single] : ["customer"];
    }, [allowed, tabKey]);

    const technologyPanel = selectedId ? (
        <Space direction="vertical" size={6} style={{ width: "100%", paddingTop: 4 }}>
            {selectedId ? (
                <Typography.Text type="secondary">
                    {t("workbench.conversationId")}
                    <Typography.Text code>{selectedId}</Typography.Text>
                </Typography.Text>
            ) : null}
            {detail?.visitor?.id ? (
                <Typography.Text type="secondary">
                    VisitorID：<Typography.Text code>{detail.visitor.id}</Typography.Text>
                </Typography.Text>
            ) : null}
            {detail?.customer?.id ? (
                <Typography.Text type="secondary">
                    {t("workbench.customerId")}
                    <Typography.Text code>{detail.customer.id}</Typography.Text>
                </Typography.Text>
            ) : null}
            {!detail?.visitor?.id && !detail?.customer?.id ? (
                <Typography.Text type="secondary">-</Typography.Text>
            ) : null}
        </Space>
    ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />
    );

    const visitedPagesPanel = selectedId ? (
        <Typography.Text type="secondary" style={{ paddingTop: 4, display: "block" }}>
            {t("workbench.contextSections.visitedPagesEmpty")}
        </Typography.Text>
    ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />
    );

    const onChange = (key: string | string[]) => {
        const keys = (Array.isArray(key) ? key : [key])
            .map((k) => String(k || "").trim())
            .filter((k) => allowed.has(k));
        setTabKey(JSON.stringify(keys));
    };

    const expandIcon = ({ isActive }: { isActive?: boolean }): ReactNode => (
        <span
            style={{
                display: "inline-flex",
                transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
                color: "rgba(0,0,0,0.45)",
            }}
        >
            <RightOutlined />
        </span>
    );

    return (
        <div style={{ padding: 12 }}>
            <Typography.Text strong>{t("workbench.userInfo")}</Typography.Text>
            <Divider style={{ margin: "12px 0" }} />

            <Collapse
                activeKey={safeActiveKeys}
                onChange={onChange}
                bordered={false}
                ghost
                expandIconPosition="end"
                expandIcon={expandIcon}
                items={[
                    {
                        key: "customer",
                        label: (
                            <Space size={10}>
                                <UserOutlined />
                                <span>{t("workbench.customer")}</span>
                            </Space>
                        ),
                        children: (
                            <ProfileTab
                                t={t}
                                selectedId={selectedId}
                                detail={detail}
                                detailLoading={detailLoading}
                                anonymousEnabled={anonymousEnabled}
                                embedded
                            />
                        ),
                    },
                    {
                        key: "additional",
                        label: (
                            <Space size={10}>
                                <InfoCircleOutlined />
                                <span>{t("workbench.contextSections.additionalInfo")}</span>
                            </Space>
                        ),
                        children: (
                            <DetailsTab
                                t={t}
                                selectedId={selectedId}
                                selected={selected}
                                meta={meta}
                                metaLoading={metaLoading}
                                onSetTags={onSetTags}
                                onSetMetaLocal={onSetMetaLocal}
                                onSetNote={onSetNote}
                                embedded
                            />
                        ),
                    },
                    {
                        key: "visited",
                        label: (
                            <Space size={10}>
                                <GlobalOutlined />
                                <span>{t("workbench.contextSections.visitedPages")}</span>
                            </Space>
                        ),
                        children: visitedPagesPanel,
                    },
                    {
                        key: "technology",
                        label: (
                            <Space size={10}>
                                <LaptopOutlined />
                                <span>{t("workbench.technicalInfo")}</span>
                            </Space>
                        ),
                        children: technologyPanel,
                    },
                    {
                        key: "copilot",
                        label: (
                            <Space size={10}>
                                <RobotOutlined />
                                <span>{t("workbench.tabs.copilot")}</span>
                            </Space>
                        ),
                        children: <CopilotTab t={t} selectedId={selectedId} embedded />, 
                    },
                ]}
            />
        </div>
    );
}
