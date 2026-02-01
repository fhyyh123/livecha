import { Avatar, Button, Divider, Dropdown, Input, List, Select, Space, Switch, Tag, Typography } from "antd";
import { CloseOutlined, DownOutlined, RightOutlined, RollbackOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { MoreOutlined } from "@ant-design/icons";
import VirtualList from "rc-virtual-list";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Conversation } from "../store/chatStore";
import {
    fetchInactivityTimeouts,
    getCachedInactivityTimeouts,
    type InactivityTimeoutsDto,
} from "../providers/chatSettings";

export type ConversationListPaneViewProps = {
    t: (key: string, options?: Record<string, unknown>) => string;

    listTitle?: string;
    groupTitle?: (count: number) => string;

    keyword: string;
    setKeyword: (next: string) => void;

    showLocalSearch?: boolean;

    showLocalFilters?: boolean;

    starredOnly: boolean;
    setStarredOnly: (next: boolean) => void;

    conversations: Conversation[];
    conversationsLoading: boolean;

    selectedId: string | null;

    onOpenConversation: (conversationId: string) => void;
    onToggleStar: (conversationId: string, next: boolean) => void;

    showClose?: boolean;
    onCloseConversation?: (conversationId: string) => void | Promise<void>;

    showTransfer?: boolean;
    onOpenTransfer?: (conversationId: string) => void;
};

const AVATAR_COLORS = [
    "#1677ff",
    "#13c2c2",
    "#52c41a",
    "#faad14",
    "#f5222d",
    "#722ed1",
    "#eb2f96",
    "#2f54eb",
    "#fa541c",
    "#a0d911",
];

function hashStringToIndex(input: string, modulo: number) {
    const s = String(input || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    const n = Math.abs(h);
    return modulo > 0 ? (n % modulo) : 0;
}

function avatarBgForConversation(c: Conversation, title: string) {
    const seed = String(c.visitor_id || c.visitor_email || c.visitor_name || c.id || title || "");
    return AVATAR_COLORS[hashStringToIndex(seed, AVATAR_COLORS.length)];
}

function avatarTextFromTitle(title: string, t: (key: string, options?: Record<string, unknown>) => string) {
    const s = String(title || "").trim();
    if (!s) return t("workbench.customer").slice(0, 1);
    // Prefer first visible grapheme-ish char; good enough for zh/en.
    return s.slice(0, 1).toUpperCase();
}

function getPrimaryTitle(c: Conversation, t: (key: string, options?: Record<string, unknown>) => string) {
    const name = String(c.visitor_name || "").trim();
    const email = String(c.visitor_email || "").trim();
    const who = name && name !== "-" ? name : (email && email !== "-" ? email : "");
    return who || c.subject || t("workbench.customer");
}

function formatFreshness(elapsedMs: number) {
    const s = Math.max(0, Math.floor(elapsedMs / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

export function ConversationListPaneView({
    t,
    listTitle,
    groupTitle,
    keyword,
    setKeyword,
    showLocalSearch = true,
    showLocalFilters = true,
    starredOnly,
    setStarredOnly,
    conversations,
    conversationsLoading,
    selectedId,
    onOpenConversation,
    onToggleStar,
    showClose = true,
    onCloseConversation,
    showTransfer = true,
    onOpenTransfer,
}: ConversationListPaneViewProps) {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const [inactivityCfg, setInactivityCfg] = useState<InactivityTimeoutsDto>(() => getCachedInactivityTimeouts());
    useEffect(() => {
        let mounted = true;
        fetchInactivityTimeouts()
            .then((cfg) => {
                if (!mounted) return;
                setInactivityCfg(cfg);
            })
            .catch(() => {
                // best-effort
            });
        return () => {
            mounted = false;
        };
    }, []);
    const q = keyword.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!q) return conversations;
        return conversations.filter((c) => {
            return (
                String(c.id || "").toLowerCase().includes(q) ||
                String(c.subject || "").toLowerCase().includes(q) ||
                String(c.visitor_name || "").toLowerCase().includes(q) ||
                String(c.visitor_email || "").toLowerCase().includes(q)
            );
        });
    }, [conversations, q]);

    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
    const [myChatsOpen, setMyChatsOpen] = useState(true);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const sorted = useMemo(() => {
        const list = [...filtered];
        list.sort((a, b) => {
            const at = Number(a.last_message_created_at || 0);
            const bt = Number(b.last_message_created_at || 0);
            if (at !== bt) {
                return sortOrder === "oldest" ? (at - bt) : (bt - at);
            }
            return String(a.id).localeCompare(String(b.id));
        });
        return list;
    }, [filtered, sortOrder]);

    const listWrapRef = useRef<HTMLDivElement | null>(null);
    const [listHeight, setListHeight] = useState(0);

    // Ensure we have a bounded height before first paint to avoid transient full-render layout jumps.
    useLayoutEffect(() => {
        const el = listWrapRef.current;
        if (!el) return;
        const h = Math.max(0, Math.floor(el.clientHeight));
        if (h > 0) setListHeight(h);
    }, []);

    useEffect(() => {
        const el = listWrapRef.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            setListHeight(Math.max(0, Math.floor(entry.contentRect.height)));
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 12 }}>
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Space size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                        <Typography.Text strong>{listTitle ?? t("workbench.chats")}</Typography.Text>
                    </Space>

                    <Space size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space size={6} style={{ minWidth: 0 }}>
                            <Button
                                type="text"
                                size="small"
                                icon={myChatsOpen ? <DownOutlined /> : <RightOutlined />}
                                onClick={() => setMyChatsOpen((v) => !v)}
                                aria-label={(groupTitle ? groupTitle(conversations.length) : t("workbench.myChats", { count: conversations.length }))}
                            />
                            <Typography.Text>{groupTitle ? groupTitle(conversations.length) : t("workbench.myChats", { count: conversations.length })}</Typography.Text>
                        </Space>
                        <Select
                            value={sortOrder}
                            onChange={(v) => setSortOrder(v)}
                            style={{ width: 120 }}
                            options={[
                                { value: "newest", label: t("workbench.sort.newest") },
                                { value: "oldest", label: t("workbench.sort.oldest") },
                            ]}
                        />
                    </Space>

                    {showLocalSearch ? (
                        <Input
                            placeholder={t("workbench.searchConversations")}
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            allowClear
                        />
                    ) : null}

                    {showLocalFilters ? (
                        <Space size={8} wrap style={{ width: "100%", justifyContent: "space-between" }}>
                            <Space size={8}>
                                <Typography.Text type="secondary">{t("workbench.starredOnly")}</Typography.Text>
                                <Switch checked={starredOnly} onChange={setStarredOnly} />
                            </Space>
                        </Space>
                    ) : null}

                </Space>
            </div>

            <Divider style={{ margin: 0 }} />

            <div ref={listWrapRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {myChatsOpen ? (
                    <List loading={conversationsLoading} style={{ height: "100%" }}>
                        <VirtualList
                            data={sorted}
                            height={Math.max(1, listHeight)}
                            itemHeight={84}
                            itemKey="id"
                        >
                            {(c: Conversation) => {
                                const isSelected = Boolean(selectedId && c.id === selectedId);
                                // UX: once the chat is opened/selected, the badge should disappear immediately.
                                // Server-side unread_count may lag until MSG_READ/MSG_READ_OK roundtrip completes.
                                const unread = isSelected ? 0 : Number(c.unread_count || 0);
                                const title = getPrimaryTitle(c, t);
                                const lastMsgText = String(c.last_message_text || "").trim();
                                const lastFromAgent = String(c.last_message_sender_type || "") === "agent";

                                const nowSec = Math.floor(nowMs / 1000);
                                const createdAtSec = Number(c.created_at || 0);
                                const lastCustomerAtSec = Number(c.last_customer_msg_at || 0);
                                const lastIdleEventAtSec = Number(c.last_idle_event_at || 0);

                                const customerActivityAtSec = (lastCustomerAtSec || createdAtSec || 0);
                                const idleForMinutes = (() => {
                                    if (!customerActivityAtSec) return 0;
                                    return Math.max(1, Math.floor(Math.max(0, nowSec - customerActivityAtSec) / 60));
                                })();

                                const isIdle = (() => {
                                    if (!inactivityCfg.visitor_idle_enabled) return false;
                                    if (c.status === "closed") return false;
                                    if (!lastIdleEventAtSec) return false;
                                    if (!customerActivityAtSec) return false;
                                    // Only show idle preview after the backend has emitted the idle system event.
                                    // Backend guarantees: last_idle_event_at >= activity_at for the current inactivity period.
                                    return lastIdleEventAtSec >= customerActivityAtSec;
                                })();

                                const archivedReason = String(c.last_archived_reason || "").trim();
                                const archivedInactivityMinutes = Number(c.last_archived_inactivity_minutes || 0);
                                const isArchivedInactivity = (() => {
                                    if (!inactivityCfg.inactivity_archive_enabled) return false;
                                    if (c.status !== "closed") return false;
                                    if (!archivedReason.startsWith("inactivity")) return false;
                                    return archivedInactivityMinutes > 0;
                                })();

                                const isStickyArchived = isArchivedInactivity && c.status === "closed";

                                const subtitleText = isArchivedInactivity
                                    ? t("workbench.system.archivedInactivity", { minutes: archivedInactivityMinutes })
                                    : (isIdle
                                        ? t("workbench.system.idle", { minutes: idleForMinutes })
                                        : (lastMsgText || (c.subject || "-")));

                                const avatarBg = avatarBgForConversation(c, title);
                                const avatarText = avatarTextFromTitle(title, t);

                                const canTransfer = Boolean(showTransfer && onOpenTransfer && c.status !== "closed");
                                const showItemMenu = canTransfer && ((hoveredId === c.id) || isSelected);
                                const canClose = Boolean(showClose && onCloseConversation && c.status !== "closed");
                                const showCloseBtn = canClose && ((hoveredId === c.id) || isSelected);
                                const itemMenuItems = canTransfer
                                    ? [
                                          {
                                              key: "transfer",
                                              label: t("workbench.transferTo"),
                                              onClick: () => onOpenTransfer?.(c.id),
                                          },
                                      ]
                                    : [];

                                const lastTsSec = Number(c.last_message_created_at || 0);
                                const delayMs = 2500;
                                const freshness = (() => {
                                    if (!lastTsSec) return "";
                                    const elapsed = Math.max(0, nowMs - lastTsSec * 1000);
                                    // LiveChat-like behavior: new message resets to 0s, then starts counting after a short delay.
                                    if (elapsed < delayMs) return "0s";
                                    return formatFreshness(elapsed);
                                })();

                                return (
                                    <List.Item
                                        key={c.id}
                                        style={{
                                            cursor: "pointer",
                                            padding: "10px 12px",
                                            height: 84,
                                            overflow: "hidden",
                                            background: isSelected ? "rgba(0,0,0,0.04)" : (hoveredId === c.id ? "rgba(0,0,0,0.02)" : undefined),
                                            borderLeft: isSelected ? "3px solid #1677ff" : "3px solid transparent",
                                            borderBottom: "1px solid rgba(0,0,0,0.06)",
                                            opacity: isStickyArchived ? 0.6 : 1,
                                        }}
                                        onMouseEnter={() => setHoveredId(c.id)}
                                        onMouseLeave={() => setHoveredId((prev) => (prev === c.id ? null : prev))}
                                        onClick={() => onOpenConversation(c.id)}
                                    >
                                        <div style={{ display: "flex", gap: 10, width: "100%" }}>
                                            <Avatar
                                                size={36}
                                                style={{
                                                    background: avatarBg,
                                                    flex: "0 0 auto",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {avatarText}
                                            </Avatar>

                                            <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
                                                <Space size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                                        <Typography.Text
                                                            strong
                                                            ellipsis
                                                            type={isIdle ? "secondary" : undefined}
                                                            style={{ minWidth: 0 }}
                                                        >
                                                            {title}
                                                        </Typography.Text>
                                                        <Tag>{c.channel}</Tag>
                                                        {isStickyArchived ? <Tag color="default">{t("workbench.system.archived")}</Tag> : null}
                                                        {unread > 0 ? <Tag color="red">{t("workbench.unread", { count: unread })}</Tag> : null}
                                                    </div>

                                                    <Space size={2}>
                                                        <Typography.Text type="secondary" style={{ fontSize: 12, width: 44, textAlign: "right" }}>
                                                            {freshness}
                                                        </Typography.Text>

                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            aria-label={c.starred ? t("workbench.aria.unstar") : t("workbench.aria.star")}
                                                            icon={c.starred ? <StarFilled /> : <StarOutlined />}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                onToggleStar(c.id, !c.starred);
                                                            }}
                                                        />

                                                        {showItemMenu ? (
                                                            <Dropdown menu={{ items: itemMenuItems }} trigger={["click"]} placement="bottomRight">
                                                                <Button
                                                                    size="small"
                                                                    type="text"
                                                                    aria-label="More"
                                                                    icon={<MoreOutlined />}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                    }}
                                                                />
                                                            </Dropdown>
                                                        ) : (
                                                            // keep layout stable
                                                            <span style={{ width: 28 }} />
                                                        )}

                                                        {showCloseBtn ? (
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                danger
                                                                aria-label={t("workbench.close")}
                                                                icon={<CloseOutlined />}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    void onCloseConversation?.(c.id);
                                                                }}
                                                            />
                                                        ) : (
                                                            // keep layout stable
                                                            <span style={{ width: 28 }} />
                                                        )}
                                                    </Space>
                                                </Space>

                                                <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                                                    {lastFromAgent && (Boolean(lastMsgText) || isIdle || isArchivedInactivity) ? (
                                                        <RollbackOutlined
                                                            aria-hidden
                                                            style={{
                                                                fontSize: 12,
                                                                marginRight: 6,
                                                                color: "rgba(0,0,0,0.45)",
                                                            }}
                                                        />
                                                    ) : null}
                                                    {subtitleText || "-"}
                                                </Typography.Text>
                                            </Space>
                                        </div>
                                </List.Item>
                            );
                        }}
                    </VirtualList>
                </List>
                ) : null}
            </div>
        </div>
    );
}
