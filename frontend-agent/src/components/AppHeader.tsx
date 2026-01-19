import {
    Button,
    Layout,
    Select,
    Space,
    Tag,
    Typography,
    Avatar,
    Badge,
    Dropdown,
} from "antd";
import {
    BellOutlined,
    DollarOutlined,
    UserAddOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useChatStore } from "../store/chatStore";
import { useSiteStore } from "../store/siteStore";

export function AppHeader() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const loc = useLocation();
    const [searchParams] = useSearchParams();

    const { wsStatus, conversations, selectedConversationId, selectConversation, refreshConversations } = useChatStore();

    const { sites, sitesLoading, currentSiteId, setCurrentSiteId, loadSites } = useSiteStore();

    useEffect(() => {
        loadSites().catch(() => {
            // ignore
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isConversations = loc.pathname.startsWith("/conversations");
    const isArchives = loc.pathname.startsWith("/archives");
    const isChatListRoute = isConversations || isArchives;

    const starredOnly = String(searchParams.get("starred") || "") === "1";

    const siteOptions = useMemo(
        () => sites.map((s) => ({ value: s.id, label: `${s.name} (${s.public_key})` })),
        [sites],
    );

    function onChangeSite(next: string) {
        const nextSiteId = String(next || "");
        setCurrentSiteId(nextSiteId);

        // Site boundary behavior (A): if current selection isn't in the new site, clear it.
        const selectedId = selectedConversationId;
        if (selectedId) {
            const conv = conversations.find((c) => c.id === selectedId);
            if (conv && String(conv.site_id || "") !== nextSiteId) {
                selectConversation(null);
                if (isChatListRoute) nav(isArchives ? "/archives" : "/conversations");
            }
        }

        // Best-effort refresh (server-side might not filter by site yet).
        refreshConversations(undefined, starredOnly).catch(() => {
            // ignore
        });
    }

    const wsTagColor = wsStatus === "connected" ? "green" : (wsStatus === "connecting" ? "blue" : "default");

    return (
        <Layout.Header
            style={{
                background: "#0b0b0b",
                padding: "0 16px",
                height: 56,
                lineHeight: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                color: "#fff",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            }}
        >
            {/* Left: logo + site select */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1, overflow: "hidden" }}>
                <img
                    src="/logo.png"
                    alt="ChatLive"
                    style={{ height: 30, width: "auto", display: "block" }}
                />

                <Space size={8} wrap>
                    <Typography.Text style={{ color: "#fff" }}>{t("sites.selectSite")}</Typography.Text>
                    <Select
                        style={{ minWidth: 260 }}
                        placeholder={t("sites.selectSitePlaceholder")}
                        loading={sitesLoading}
                        value={currentSiteId || undefined}
                        options={siteOptions}
                        onChange={(v) => onChangeSite(String(v || ""))}
                        showSearch
                        optionFilterProp="label"
                    />
                </Space>
            </div>

            {/* Right: status/billing, invite, notifications, avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Tag color={wsTagColor} style={{ marginInlineEnd: 0, background: "rgba(255,255,255,0.06)", color: "#fff" }}>
                    WS: {wsStatus}
                </Tag>

                <Button type="text" icon={<DollarOutlined />} style={{ color: "#fff" }} onClick={() => nav("/sites")}>{/* billing */}</Button>

                <Button type="text" icon={<UserAddOutlined />} style={{ color: "#fff" }} onClick={() => nav("/invites")}>{/* invite */}</Button>

                <Badge count={2} size="small">
                    <Button type="text" icon={<BellOutlined />} style={{ color: "#fff" }} />
                </Badge>

                <Dropdown
                    menu={{
                        items: [
                            { key: "profile", label: t("profile.title"), onClick: () => nav("/profile") },
                            { key: "logout", label: t("common.backToLogin"), onClick: () => nav("/login") },
                        ],
                    }}
                    placement="bottomRight"
                >
                    <Avatar style={{ background: "#722ed1", cursor: "pointer" }} icon={<UserOutlined />} />
                </Dropdown>
            </div>
        </Layout.Header>
    );
}
