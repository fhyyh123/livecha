import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Drawer, Divider, Empty, Grid, Input, List, Modal, Select, Space, Typography, notification } from "antd";
import type { UploadProps } from "antd";
import { InstagramOutlined, MessageOutlined, RightOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../store/chatStore";
import { useSiteStore } from "../store/siteStore";
import {
    ChatView,
    ContextPanelView,
    ConversationHeader,
    ConversationListPane,
    ConversationListPaneView,
    ContextPanel,
    ConversationStage,
    Workspace,
    type TimelineSystemEvent,
} from "../workbench";
import { useChatWorkbenchEffects } from "../workbench/useChatWorkbenchEffects";

export type WorkbenchPageMode = "inbox" | "archives";

export type WorkbenchPageProps = {
    mode?: WorkbenchPageMode;
};

export function WorkbenchPage({ mode = "inbox" }: WorkbenchPageProps) {
    const { t } = useTranslation();
    const nav = useNavigate();
    const { id } = useParams();
    const screens = Grid.useBreakpoint();
    const isNarrow = !screens.lg;

    const [searchParams, setSearchParams] = useSearchParams();

    const {
        conversations,
        conversationsLoading,
        conversationDetailById,
        conversationDetailLoadingById,
        messagesByConversationId,
        wsStatus,
        typingByConversationId,
        remoteLastReadByConversationId,
        remoteLastReadAtByConversationId,
        systemEventsByConversationId,
        uploading,

        agents,
        agentsLoading,
        metaByConversationId,
        metaLoadingByConversationId,
        quickReplies,
        quickRepliesLoading,

        draftByConversationId,

        stickyArchivedByConversationId,
        clearStickyArchived,

        refreshConversations,
        selectConversation,
        loadConversationDetail,
        setStarred,
        loadHistory,
        sendText,
        sendRead,
        sendTyping,
        sendFile,
        downloadAttachment,

        closeConversation,
        reopenConversation,
        assignConversation,
        claimConversation,
        loadAgents,
        loadMeta,
        setTags,
        setMetaLocal,
        setNote,
        loadQuickReplies,
        createQuickReply,

        setDraft,
    } = useChatStore();

    const { currentSiteId, widgetConfigBySiteId, loadWidgetConfig } = useSiteStore();

    useEffect(() => {
        if (!currentSiteId) return;
        loadWidgetConfig(currentSiteId).catch(() => {
            // ignore
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSiteId]);

    // UX: auto-archived conversations are kept visible (greyed) while staying on this page.
    // Clear the sticky cache when navigating away so returning/reloading won't keep them.
    useEffect(() => {
        return () => {
            clearStickyArchived();
        };
    }, [clearStickyArchived]);

    const anonymousEnabled = Boolean(currentSiteId && widgetConfigBySiteId[currentSiteId]?.anonymous_enabled);

    const isArchives = mode === "archives";
    const routeBase = isArchives ? "/archives" : "/conversations";
    const inboxStatus = isArchives ? "closed" : undefined;

    const keyword = String(searchParams.get("q") || "");

    const starredOnly = String(searchParams.get("starred") || "") === "1";

    function patchSearchParams(patch: Record<string, string | null | undefined>) {
        const next = new URLSearchParams(searchParams);
        for (const [k, v] of Object.entries(patch)) {
            const value = (v ?? "").toString();
            if (!value) next.delete(k);
            else next.set(k, value);
        }
        setSearchParams(next, { replace: true });
    }

    const setKeyword = (next: string) => patchSearchParams({ q: next });
    const setStarredOnly = (next: boolean) => patchSearchParams({ starred: next ? "1" : "" });
    const [contextTab, setContextTab] = useState<string>(() => {
        try {
            return localStorage.getItem("chatlive:contextTab") || "customer";
        } catch {
            return "customer";
        }
    });

    // Migrate legacy tab keys from the old icon-tabs UI.
    useEffect(() => {
        const raw = String(contextTab || "").trim();

        if (raw === "profile") {
            setContextTab("customer");
            return;
        }
        if (raw === "details") {
            setContextTab("additional");
            return;
        }

        if (raw.startsWith("[")) {
            try {
                const arr = JSON.parse(raw) as unknown;
                if (!Array.isArray(arr)) return;
                const mapped = arr
                    .map((x) => String(x || "").trim())
                    .map((k) => (k === "profile" ? "customer" : k === "details" ? "additional" : k))
                    .filter(Boolean);
                const next = JSON.stringify(mapped);
                if (next !== raw) setContextTab(next);
            } catch {
                // ignore
            }
        }
    }, [contextTab]);


    useEffect(() => {
        try {
            localStorage.setItem("chatlive:contextTab", contextTab);
        } catch {
            // ignore
        }
    }, [contextTab]);

    // AppShell owns site list loading & switching.

    const [qrOpen, setQrOpen] = useState(false);
    const [qrQuery, setQrQuery] = useState("");
    const [qrCreateOpen, setQrCreateOpen] = useState(false);
    const [qrTitle, setQrTitle] = useState("");
    const [qrContent, setQrContent] = useState("");

    const [transferOpen, setTransferOpen] = useState(false);
    const [transferConversationId, setTransferConversationId] = useState<string | null>(null);
    const [transferAgentId, setTransferAgentId] = useState<string>("");

    function openTransfer(conversationId: string) {
        setTransferConversationId(conversationId);
        const conv = conversations.find((c) => c.id === conversationId);
        setTransferAgentId(String(conv?.assigned_agent_user_id || ""));
        setTransferOpen(true);
    }

    // Selection is route-scoped: do not carry over selection across /conversations and /archives
    // when landing on the list route without an explicit :id.
    const selectedId = id || null;
    const selected = useMemo(
        () => conversations.find((c) => c.id === selectedId) || null,
        [conversations, selectedId],
    );

    const visibleConversations = useMemo(() => {
        const bySite = currentSiteId
            ? conversations.filter((c) => String(c.site_id || "") === currentSiteId)
            : conversations;

        const stickyIdSet = new Set(Object.keys(stickyArchivedByConversationId || {}));

        if (isArchives) {
            return bySite.filter((c) => c.status === "closed");
        }

        // Inbox should not display closed conversations.
        // Exception: keep inactivity auto-archived conversations visible (greyed) until page reload/navigation.
        return bySite.filter((c) => c.status !== "closed" || stickyIdSet.has(c.id));
    }, [conversations, currentSiteId, isArchives, stickyArchivedByConversationId]);

    const showNoConversationsGuide = !isArchives && !conversationsLoading && visibleConversations.length === 0;

    const detail = selectedId ? (conversationDetailById[selectedId] || null) : null;
    const detailLoading = selectedId ? Boolean(conversationDetailLoadingById[selectedId]) : false;

    const meta = selectedId ? (metaByConversationId[selectedId] || null) : null;
    const metaLoading = selectedId ? Boolean(metaLoadingByConversationId[selectedId]) : false;

    const renderContextPanel = () => (
        <ContextPanelView
            t={t}
            tabKey={contextTab}
            setTabKey={setContextTab}
            selectedId={selectedId}
            selected={selected}
            detail={detail}
            detailLoading={detailLoading}
            meta={meta}
            metaLoading={metaLoading}
            systemEvents={selectedId ? (systemEventsByConversationId[selectedId] || []) : []}
            anonymousEnabled={anonymousEnabled}
            onSetTags={setTags}
            onSetMetaLocal={setMetaLocal}
            onSetNote={setNote}
        />
    );

    const messages = useMemo(
        () => (selectedId ? (messagesByConversationId[selectedId] || []) : []),
        [messagesByConversationId, selectedId],
    );

    const draft = selectedId ? (draftByConversationId[selectedId] ?? "") : "";
    const setDraftText = (next: string) => {
        if (!selectedId) return;
        setDraft(selectedId, next);
    };

    const peerTyping = selectedId ? Boolean(typingByConversationId[selectedId]) : false;
    const peerLastRead = selectedId ? (remoteLastReadByConversationId[selectedId] || null) : null;
    const peerLastReadAt = selectedId ? (remoteLastReadAtByConversationId[selectedId] || null) : null;

    const lastAgentMsgId = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]!;
            if (m.sender_type === "agent") return m.id;
        }
        return null;
    }, [messages]);

    const peerReadLastAgentMsg = Boolean(peerLastRead && lastAgentMsgId && peerLastRead === lastAgentMsgId);

    const systemEvents: TimelineSystemEvent[] = useMemo(() => {
        if (!selectedId) return [];

        const events: TimelineSystemEvent[] = [];

        const wsEvents = systemEventsByConversationId[selectedId] || [];
        for (const e of wsEvents) {
            const key = String(e.event_key || "");
            const ts = Number(e.created_at || 0);
            const data = (e.data || {}) as Record<string, unknown>;

            if (!key || !ts) continue;

            const fromAgent = String(data.from_agent_display_name ?? data.from_agent_user_id ?? "").trim();
            const toAgent = String(data.to_agent_display_name ?? data.to_agent_user_id ?? "").trim();
            const byUser = String(data.by_display_name ?? data.by_user_id ?? "").trim();
            const reason = String(data.reason ?? "").trim();

            const text = (() => {
                if (key === "started") {
                    return t("workbench.system.started");
                }
                if (key === "idle") {
                    const minutes = Number((data["idle_minutes"] ?? data["minutes"]) ?? 0);
                    return minutes > 0 ? t("workbench.system.idle", { minutes }) : t("workbench.system.generic", { key });
                }
                if (key === "assigned") {
                    return toAgent ? t("workbench.system.assigned", { to: toAgent }) : t("workbench.system.assignedGeneric");
                }
                if (key === "claimed") {
                    return byUser ? t("workbench.system.claimed", { by: byUser }) : t("workbench.system.claimedGeneric");
                }
                if (key === "transferred") {
                    if (fromAgent && toAgent) return t("workbench.system.transferred", { from: fromAgent, to: toAgent });
                    if (toAgent) return t("workbench.system.transferredTo", { to: toAgent });
                    return t("workbench.system.transferredGeneric");
                }
                if (key === "archived") {
                    // Support future inactivity reason from backend.
                    if (reason.startsWith("inactivity")) {
                        const m = reason.match(/(\d+)/);
                        const minutes = m ? Number(m[1]) : 0;
                        if (minutes > 0) return t("workbench.system.archivedInactivity", { minutes });
                        return t("workbench.system.archived");
                    }
                    return byUser ? t("workbench.system.archivedBy", { by: byUser }) : t("workbench.system.archived");
                }
                if (key === "reopened") {
                    return byUser ? t("workbench.system.reopenedBy", { by: byUser }) : t("workbench.system.reopened");
                }
                return t("workbench.system.generic", { key });
            })();

            events.push({ id: `ws:${e.id}`, ts, text });
        }

        // Prefer backend CONV_EVENT archived; fallback to detail for older servers.
        const hasArchivedEvent = wsEvents.some((e) => String(e.event_key || "") === "archived");
        const closedAt = Number(detail?.closed_at || 0);
        if (!hasArchivedEvent && detail?.status === "closed" && closedAt > 0) {
            events.push({
                id: `sys:archived:${selectedId}`,
                ts: closedAt,
                text: t("workbench.system.archived"),
            });
        }

        return events;
    }, [
        detail?.closed_at,
        detail?.status,
        selectedId,
        systemEventsByConversationId,
        t,
    ]);

    const [contextDrawerOpen, setContextDrawerOpen] = useState(false);

    const [historyLimit, setHistoryLimit] = useState(50);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        setHistoryLimit(50);
    }, [selectedId]);

    async function loadOlderHistory() {
        if (!selectedId) return;
        const next = Math.min(2000, historyLimit + 50);
        setHistoryLoading(true);
        try {
            await loadHistory(selectedId, next);
            setHistoryLimit(next);
        } finally {
            setHistoryLoading(false);
        }
    }

    const uploadProps: UploadProps = {
        beforeUpload: async (file) => {
            if (!selectedId) return false;
            await sendFile(selectedId, file as File);
            return false;
        },
        showUploadList: false,
        disabled: wsStatus !== "connected" || uploading || !selectedId || detail?.status === "closed",
    };

    useChatWorkbenchEffects({
        starredOnly,
        inboxStatus,
        refreshConversations,
        loadAgents,
        routeConversationId: id,
        selectConversation,
        loadHistory,
        loadConversationDetail,
        loadMeta,
        selectedId,
        wsStatus,
        draft,
        sendTyping,
        messages,
        sendRead,
    });

    // In-app notification for new messages.
    useEffect(() => {
        type ChatLiveNewMessageDetail = { conversationId?: string };

        function onNewMessage(ev: Event) {
            const detail = (ev as CustomEvent<ChatLiveNewMessageDetail>).detail;
            const conversationId = String(detail?.conversationId || "");
            if (!conversationId) return;
            if (conversationId === selectedId) return;
            const conv = conversations.find((c) => c.id === conversationId);
            const who = conv?.visitor_name || conv?.visitor_email || conversationId;
            notification.info({
                message: t("workbench.newMessage"),
                description: t("workbench.from", { who }),
                placement: "bottomRight",
                duration: 3,
                onClick: () => openConversation(conversationId),
            });
        }
        window.addEventListener("chatlive:newMessage", onNewMessage);
        return () => window.removeEventListener("chatlive:newMessage", onNewMessage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, conversations]);

    useEffect(() => {
        if (!qrOpen) return;
        loadQuickReplies(qrQuery, 50).catch(() => {
            // ignore
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [qrOpen, qrQuery]);

    async function openConversationAsync(conversationId: string) {
        const conv = conversations.find((c) => c.id === conversationId);
        if (conv?.status === "queued" && !conv.assigned_agent_user_id) {
            try {
                await claimConversation(conversationId);
            } catch {
                notification.error({
                    message: t("workbench.claimFailedTitle"),
                    description: t("workbench.claimFailedDetail"),
                    placement: "bottomRight",
                    duration: 3,
                });
                return;
            }
        }

        selectConversation(conversationId);
        nav(`${routeBase}/${encodeURIComponent(conversationId)}`);
    }

    function openConversation(conversationId: string) {
        void openConversationAsync(conversationId);
    }

    async function closeConversationFromList(conversationId: string) {
        await closeConversation(conversationId);

        // Selection is route-scoped; after closing the current one, clear the stage by
        // navigating back to the list route.
        if (selectedId && conversationId === selectedId) {
            const qs = searchParams.toString();
            nav(qs ? `${routeBase}?${qs}` : routeBase);
        }
    }

    async function toggleStar(conversationId: string, next: boolean) {
        try {
            await setStarred(conversationId, next);
            if (starredOnly) {
                await refreshConversations(inboxStatus, true);
            }
        } catch {
            // ignore
        }
    }

    async function onDownload(attachmentId?: string) {
        if (!attachmentId) return;
        const url = await downloadAttachment(attachmentId);
        if (!url) return;
        window.open(url, "_blank");
    }

    async function onReopenConversation() {
        if (!selectedId) return;
        await reopenConversation(selectedId);

        if (isArchives) {
            nav(`/conversations/${encodeURIComponent(selectedId)}`);
        }
    }

    function onSendText() {
        if (!selectedId) return;
        const text = draft.trim();
        if (!text) return;
        sendText(selectedId, text);
        setDraft(selectedId, "");
    }

    return (
        <Card bodyStyle={{ padding: 0 }}>
            <Workspace
                minHeight="calc(100vh - 56px)"
                left={
                    <ConversationListPane width={screens.xs ? 300 : 340}>
                        <ConversationListPaneView
                            t={t}
                            listTitle={isArchives ? t("archives.title") : undefined}
                            groupTitle={isArchives ? ((count) => t("archives.myArchives", { count })) : undefined}
                            anonymousEnabled={anonymousEnabled}
                            keyword={keyword}
                            setKeyword={setKeyword}
                            showLocalSearch={!screens.md}
                            showLocalFilters={!screens.md}
                            starredOnly={starredOnly}
                            setStarredOnly={setStarredOnly}
                            conversations={visibleConversations}
                            conversationsLoading={conversationsLoading}
                            selectedId={selectedId}
                            onOpenConversation={openConversation}
                            onToggleStar={toggleStar}
                            showTransfer={!isArchives}
                            onOpenTransfer={openTransfer}
                            showClose={!isArchives}
                            onCloseConversation={closeConversationFromList}
                        />
                    </ConversationListPane>
                }
                stage={
                    <ConversationStage
                        active={Boolean(selectedId)}
                        empty={
                            showNoConversationsGuide ? (
                                <div style={{ width: "100%", maxWidth: 720, padding: 24 }}>
                                    <div style={{ textAlign: "center", marginBottom: 24 }}>
                                        <Typography.Title level={3} style={{ marginBottom: 8 }}>
                                            {t("workbench.noConversationsTitle")}
                                        </Typography.Title>
                                        <Typography.Text type="secondary">{t("workbench.noConversationsDesc")}</Typography.Text>
                                    </div>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: screens.xs ? "1fr" : "repeat(3, minmax(0, 1fr))",
                                            gap: 16,
                                            marginBottom: 16,
                                        }}
                                    >
                                        <Card hoverable style={{ borderRadius: 12 }} bodyStyle={{ padding: 18 }}>
                                            <Space size={12}>
                                                <MessageOutlined style={{ fontSize: 22, color: "#0084FF" }} />
                                                <Typography.Text strong>{t("workbench.channelMessenger")}</Typography.Text>
                                            </Space>
                                        </Card>
                                        <Card hoverable style={{ borderRadius: 12 }} bodyStyle={{ padding: 18 }}>
                                            <Space size={12}>
                                                <WhatsAppOutlined style={{ fontSize: 22, color: "#25D366" }} />
                                                <Typography.Text strong>{t("workbench.channelWhatsApp")}</Typography.Text>
                                            </Space>
                                        </Card>
                                        <Card hoverable style={{ borderRadius: 12 }} bodyStyle={{ padding: 18 }}>
                                            <Space size={12}>
                                                <InstagramOutlined style={{ fontSize: 22, color: "#E1306C" }} />
                                                <Typography.Text strong>{t("workbench.channelInstagram")}</Typography.Text>
                                            </Space>
                                        </Card>
                                    </div>

                                    <div style={{ textAlign: "center" }}>
                                        <Button type="link" onClick={() => nav("/sites")} icon={<RightOutlined />} iconPosition="end">
                                            {t("workbench.seeAllChannels")}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Empty description={t("workbench.selectConversation")} />
                            )
                        }
                    >
                        <div
                            style={{
                                width: "100%",
                                height: "100%",
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                            }}
                        >
                            <Card
                                size="small"
                                style={{ flex: 1, minHeight: 0 }}
                                bodyStyle={{ padding: 12, display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}
                            >
                                {selectedId ? (
                                    <>
                                        <ConversationHeader
                                            t={t}
                                            conversationId={selectedId}
                                            detail={detail}
                                            peerTyping={peerTyping}
                                            peerLastRead={peerReadLastAgentMsg}
                                            isNarrow={isNarrow}
                                            anonymousEnabled={anonymousEnabled}
                                            onOpenContextPanel={() => setContextDrawerOpen(true)}
                                            onToggleStar={() => {
                                                if (!selectedId) return;
                                                toggleStar(selectedId, !detail?.starred);
                                            }}
                                            onOpenQuickReplies={() => setQrOpen(true)}
                                        />
                                        <Divider style={{ margin: "12px 0" }} />
                                    </>
                                ) : null}

                                <ChatView
                                    t={t}
                                    messages={messages}
                                    peerLastRead={peerLastRead}
                                    peerLastReadAt={peerLastReadAt}
                                    systemEvents={systemEvents}
                                    draft={draft}
                                    setDraft={setDraftText}
                                    wsStatus={wsStatus}
                                    detail={detail}
                                    uploading={uploading}
                                    uploadProps={uploadProps}
                                    onSendText={onSendText}
                                    onDownload={onDownload}
                                    onOpenQuickReplies={() => setQrOpen(true)}
                                    onReopen={onReopenConversation}
                                    canLoadOlder={Boolean(selectedId) && messages.length >= historyLimit && historyLimit < 2000}
                                    loadingOlder={historyLoading}
                                    onLoadOlder={loadOlderHistory}
                                />
                            </Card>
                        </div>
                    </ConversationStage>
                }
                panel={
                    isNarrow ? null : (
                        <ContextPanel width={360}>
                            {renderContextPanel()}
                        </ContextPanel>
                    )
                }
            />

            <Drawer
                title={t("workbench.userInfo")}
                open={contextDrawerOpen}
                width={360}
                placement="right"
                onClose={() => setContextDrawerOpen(false)}
                destroyOnClose={false}
            >
                {renderContextPanel()}
            </Drawer>

            <Drawer
                title={t("workbench.quickReplies")}
                open={qrOpen}
                width={480}
                onClose={() => setQrOpen(false)}
                extra={
                    <Space>
                        <Button onClick={() => setQrCreateOpen(true)} type="primary">
                            {t("workbench.create")}
                        </Button>
                    </Space>
                }
            >
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Input
                        value={qrQuery}
                        onChange={(e) => setQrQuery(e.target.value)}
                        placeholder={t("workbench.searchQuickReplies")}
                        allowClear
                    />
                    <List
                        loading={quickRepliesLoading}
                        dataSource={quickReplies}
                        renderItem={(qr) => (
                            <List.Item
                                key={qr.id}
                                actions={[
                                    <Button
                                        key="insert"
                                        type="link"
                                        onClick={() => {
                                            if (!selectedId) return;
                                            setDraft(selectedId, (draft ? draft + "\n" : "") + qr.content);
                                            setQrOpen(false);
                                        }}
                                    >
                                        {t("workbench.insert")}
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    title={qr.title}
                                    description={
                                        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }} ellipsis={{ rows: 3 }}>
                                            {qr.content}
                                        </Typography.Paragraph>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </Space>
            </Drawer>

            <Modal
                title={t("workbench.createQuickReply")}
                open={qrCreateOpen}
                onCancel={() => setQrCreateOpen(false)}
                onOk={async () => {
                    const title = qrTitle.trim();
                    const content = qrContent.trim();
                    if (!title || !content) return;
                    await createQuickReply(title, content);
                    setQrTitle("");
                    setQrContent("");
                    setQrCreateOpen(false);
                }}
                okButtonProps={{ disabled: !qrTitle.trim() || !qrContent.trim() }}
            >
                <Space direction="vertical" style={{ width: "100%" }}>
                    <Input value={qrTitle} onChange={(e) => setQrTitle(e.target.value)} placeholder={t("workbench.titlePlaceholder")} />
                    <Input.TextArea value={qrContent} onChange={(e) => setQrContent(e.target.value)} rows={5} placeholder={t("workbench.contentPlaceholder")} />
                </Space>
            </Modal>

            <Modal
                title={t("workbench.transferTo")}
                open={transferOpen}
                onCancel={() => setTransferOpen(false)}
                okButtonProps={{
                    disabled: !transferConversationId || !transferAgentId,
                    loading: agentsLoading,
                }}
                onOk={async () => {
                    if (!transferConversationId || !transferAgentId) return;
                    await assignConversation(transferConversationId, transferAgentId);
                    if (id && id === transferConversationId) {
                        nav(routeBase, { replace: true });
                    }
                    setTransferOpen(false);
                }}
            >
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Typography.Text type="secondary">
                        {transferConversationId ? transferConversationId : ""}
                    </Typography.Text>
                    <div>
                        <Typography.Text type="secondary">{t("workbench.selectAgent")}</Typography.Text>
                        <div style={{ marginTop: 8 }}>
                            <Select
                                style={{ width: "100%" }}
                                placeholder={t("workbench.selectAgent")}
                                loading={agentsLoading}
                                value={transferAgentId || undefined}
                                showSearch
                                optionFilterProp="label"
                                options={agents.map((a) => ({
                                    value: a.user_id,
                                    label: `${a.username} (${a.status})`,
                                }))}
                                onChange={(v) => setTransferAgentId(String(v || ""))}
                            />
                        </div>
                    </div>
                </Space>
            </Modal>
        </Card>
    );
}
