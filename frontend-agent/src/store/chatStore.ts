import { create } from "zustand";

import { http, getToken } from "../providers/http";
import { WsClient, type WsStatus, type WsInboundEvent } from "../ws/wsClient";

export type Conversation = {
    id: string;
    status: string;
    channel: string;
    subject?: string | null;
    assigned_agent_user_id?: string | null;

    last_message_sender_type?: string | null;
    last_message_content_type?: string | null;
    last_message_text?: string | null;
    last_message_created_at?: number | null;

    unread_count?: number;

    site_id?: string | null;
    visitor_id?: string | null;
    visitor_name?: string | null;
    visitor_email?: string | null;
    starred?: boolean;
};

export type MessageItem = {
    id: string;
    sender_type: string;
    sender_id: string;
    content_type: string;
    preview_text?: string;
    content: {
        text?: string;
        attachment_id?: string;
        filename?: string;
        size_bytes?: number;
        mime?: string;
    };
    created_at: number;
};

export type ConversationSystemEvent = {
    id: string;
    event_key: string;
    created_at: number;
    data?: Record<string, unknown>;
};

export type UserPublicProfile = {
    id: string;
    username?: string | null;
    phone?: string | null;
    email?: string | null;
};

export type ConversationDetail = {
    id: string;
    status: string;
    channel: string;
    subject?: string | null;
    customer_user_id?: string | null;
    assigned_agent_user_id?: string | null;
    site_id?: string | null;
    visitor_id?: string | null;
    created_at?: number;
    last_msg_at?: number;
    closed_at?: number | null;
    customer?: UserPublicProfile | null;

    visitor?: {
        id: string;
        site_id?: string | null;
        name?: string | null;
        email?: string | null;
    } | null;
    starred?: boolean;
};

export type AgentListItem = {
    user_id: string;
    username: string;
    status: string;
    max_concurrent?: number | null;
};

export type ConversationMeta = {
    tags: string[];
    note?: string | null;
};

export type QuickReplyItem = {
    id: string;
    title: string;
    content: string;
    updated_at: number;
};

type ChatState = {
    conversations: Conversation[];
    conversationsLoading: boolean;

    inboxStatus: string | null;
    inboxStarredOnly: boolean;

    selectedConversationId: string | null;

    conversationDetailById: Record<string, ConversationDetail | null | undefined>;
    conversationDetailLoadingById: Record<string, boolean | undefined>;

    messagesByConversationId: Record<string, MessageItem[]>;
    messageIdSetByConversationId: Record<string, Record<string, true>>;

    systemEventsByConversationId: Record<string, ConversationSystemEvent[]>;
    systemEventIdSetByConversationId: Record<string, Record<string, true>>;

    wsStatus: WsStatus;

    typingByConversationId: Record<string, boolean | undefined>;
    remoteLastReadByConversationId: Record<string, string | undefined>;
    remoteLastReadAtByConversationId: Record<string, number | undefined>;

    uploading: boolean;

    agents: AgentListItem[];
    agentsLoading: boolean;

    metaByConversationId: Record<string, ConversationMeta | undefined>;
    metaLoadingByConversationId: Record<string, boolean | undefined>;

    quickReplies: QuickReplyItem[];
    quickRepliesLoading: boolean;

    draftByConversationId: Record<string, string | undefined>;

    refreshConversations: (status?: string | null, starredOnly?: boolean) => Promise<void>;
    bootstrapInboxSubscriptions: (status?: string | null, starredOnly?: boolean) => Promise<void>;
    selectConversation: (id: string | null) => void;
    loadConversationDetail: (conversationId: string) => Promise<void>;

    setStarred: (conversationId: string, starred: boolean) => Promise<void>;

    connectWs: () => void;
    disconnectWs: () => void;

    loadHistory: (conversationId: string, limit?: number) => Promise<void>;
    sync: (conversationId: string) => void;

    sendText: (conversationId: string, text: string) => void;
    sendRead: (conversationId: string, lastReadMsgId: string) => void;
    sendTyping: (conversationId: string, isTyping: boolean) => void;
    sendFile: (conversationId: string, file: File) => Promise<void>;
    downloadAttachment: (attachmentId: string) => Promise<string | null>;

    closeConversation: (conversationId: string) => Promise<void>;
    reopenConversation: (conversationId: string) => Promise<void>;
    assignConversation: (conversationId: string, agentUserId: string) => Promise<void>;

    claimConversation: (conversationId: string) => Promise<void>;

    loadAgents: () => Promise<void>;
    loadMeta: (conversationId: string) => Promise<void>;
    setTags: (conversationId: string, tags: string[]) => Promise<void>;
    setMetaLocal: (conversationId: string, meta: ConversationMeta) => void;
    setNote: (conversationId: string, note: string) => Promise<void>;

    loadQuickReplies: (q?: string, limit?: number) => Promise<void>;
    createQuickReply: (title: string, content: string) => Promise<void>;

    setDraft: (conversationId: string, draft: string) => void;
};

let wsClient: WsClient | null = null;

let inboxRefreshTimer: number | null = null;

function draftStorageKey(conversationId: string) {
    return `chatlive:draft:${encodeURIComponent(conversationId)}`;
}

function scheduleInboxRefresh() {
    if (inboxRefreshTimer) return;
    inboxRefreshTimer = window.setTimeout(() => {
        inboxRefreshTimer = null;
        const st = useChatStore.getState();
        // best-effort; don't surface errors to WS handler
        st.refreshConversations(st.inboxStatus, st.inboxStarredOnly).catch(() => {
            // ignore
        });
    }, 250);
}

function getWsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sessionId = localStorage.getItem("chatlive.agent.session_id") || "";
    const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}&client=agent` : "?client=agent";
    return `${proto}://${location.host}/ws${qs}`;
}

function ensureWs() {
    if (wsClient) return wsClient;

    wsClient = new WsClient({
        url: getWsUrl,
        getToken,
        getSessionId: () => localStorage.getItem("chatlive.agent.session_id") || "",
        client: "agent",
        heartbeatMs: Math.max(5, Number(localStorage.getItem("chatlive.agent.heartbeat_interval") || 10) || 10) * 1000,
        onStatus: (s) => {
            useChatStore.setState({ wsStatus: s });
            if (s === "connected") {
                // After reconnect, restore subscription + sync from last known msg.
                queueMicrotask(() => {
                    const st = useChatStore.getState();
                    const convId = st.selectedConversationId;
                    if (!convId) return;
                    st.sync(convId);
                });
            }
        },
        onEvent: (e) => {
            handleWsEvent(e);
        },
    });

    return wsClient;
}

function asRecord(v: unknown): Record<string, unknown> | null {
    if (!v || typeof v !== "object") return null;
    return v as Record<string, unknown>;
}

function coerceMessageItem(raw: unknown): MessageItem | null {
    const obj = asRecord(raw);
    if (!obj) return null;
    const id = String(obj.id ?? "");
    if (!id) return null;

    const contentObj = asRecord(obj.content) ?? {};
    const content: MessageItem["content"] = {
        text: typeof contentObj.text === "string" ? contentObj.text : undefined,
        attachment_id: typeof contentObj.attachment_id === "string" ? contentObj.attachment_id : undefined,
        filename: typeof contentObj.filename === "string" ? contentObj.filename : undefined,
        size_bytes: typeof contentObj.size_bytes === "number" ? contentObj.size_bytes : undefined,
        mime: typeof contentObj.mime === "string" ? contentObj.mime : undefined,
    };

    return {
        id,
        sender_type: String(obj.sender_type ?? ""),
        sender_id: String(obj.sender_id ?? ""),
        content_type: String(obj.content_type ?? ""),
        preview_text: typeof obj.preview_text === "string" ? obj.preview_text : undefined,
        content,
        created_at: Number(obj.created_at ?? 0),
    };
}

function coerceConversationSystemEvent(raw: unknown): ConversationSystemEvent | null {
    const obj = asRecord(raw);
    if (!obj) return null;
    const id = String(obj.id ?? "");
    const event_key = String(obj.event_key ?? "");
    const created_at = Number(obj.created_at ?? 0);
    if (!id || !event_key || !created_at) return null;

    const dataObj = asRecord(obj.data);
    const data: Record<string, unknown> | undefined = dataObj ? dataObj : undefined;

    return { id, event_key, created_at, data };
}

function coerceMessagePreviewText(m: MessageItem) {
    const fromServer = String(m.preview_text ?? "").trim();
    if (fromServer) return fromServer;

    const ct = String(m.content_type || "");
    if (ct === "text") return String(m.content?.text ?? "").replace(/\s+/g, " ").trim();
    if (ct === "file") {
        const fn = String(m.content?.filename ?? "").trim();
        return fn ? `[附件] ${fn}` : "[附件]";
    }
    return ct ? `[${ct}]` : "";
}

function patchConversationLastMessage(conversationId: string, msg: MessageItem) {
    const preview = coerceMessagePreviewText(msg);
    useChatStore.setState((st) => {
        const idx = st.conversations.findIndex((c) => c.id === conversationId);
        if (idx < 0) return {};

        const existing = st.conversations[idx];
        const ts = Number(msg.created_at || 0);
        const updated = {
            ...existing,
            last_message_sender_type: msg.sender_type,
            last_message_content_type: msg.content_type,
            last_message_text: preview,
            last_message_created_at: ts || existing.last_message_created_at || null,
        };

        const nextList = st.conversations.map((c) => (c.id === conversationId ? updated : c));
        nextList.sort((a, b) => {
            const at = Number(a.last_message_created_at || 0);
            const bt = Number(b.last_message_created_at || 0);
            if (bt !== at) return bt - at;
            return String(a.id).localeCompare(String(b.id));
        });

        return { conversations: nextList };
    });
}

function addMessages(conversationId: string, incoming: MessageItem[]) {
    useChatStore.setState((st) => {
        const existing = st.messagesByConversationId[conversationId] || [];
        const idSet = st.messageIdSetByConversationId[conversationId] || {};

        const merged: MessageItem[] = [...existing];
        let changed = false;

        for (const m of incoming) {
            if (!m?.id) continue;
            if (idSet[m.id]) continue;
            idSet[m.id] = true;
            merged.push(m);
            changed = true;
        }

        if (!changed) {
            return {
                messageIdSetByConversationId: {
                    ...st.messageIdSetByConversationId,
                    [conversationId]: idSet,
                },
            };
        }

        merged.sort((a, b) => (a.created_at - b.created_at) || (a.id > b.id ? 1 : -1));

        return {
            messagesByConversationId: {
                ...st.messagesByConversationId,
                [conversationId]: merged,
            },
            messageIdSetByConversationId: {
                ...st.messageIdSetByConversationId,
                [conversationId]: idSet,
            },
        };
    });
}

function addSystemEvents(conversationId: string, incoming: ConversationSystemEvent[]) {
    useChatStore.setState((st) => {
        const existing = st.systemEventsByConversationId[conversationId] || [];
        const idSet = st.systemEventIdSetByConversationId[conversationId] || {};

        const merged: ConversationSystemEvent[] = [...existing];
        let changed = false;

        for (const e of incoming) {
            if (!e?.id) continue;
            if (idSet[e.id]) continue;
            idSet[e.id] = true;
            merged.push(e);
            changed = true;
        }

        if (!changed) {
            return {
                systemEventIdSetByConversationId: {
                    ...st.systemEventIdSetByConversationId,
                    [conversationId]: idSet,
                },
            };
        }

        merged.sort((a, b) => (a.created_at - b.created_at) || (a.id > b.id ? 1 : -1));

        return {
            systemEventsByConversationId: {
                ...st.systemEventsByConversationId,
                [conversationId]: merged,
            },
            systemEventIdSetByConversationId: {
                ...st.systemEventIdSetByConversationId,
                [conversationId]: idSet,
            },
        };
    });
}

function handleWsEvent(e: WsInboundEvent) {
    if (!e || typeof e !== "object") return;

    if (e.type === "ERROR") {
        const code = String((e as { code?: unknown }).code ?? "");
        if (code === "token_expired" || code === "invalid_token" || code === "missing_token" || code === "unauthorized") {
            // WS auth failed; force re-login.
            try {
                localStorage.removeItem("chatlive.agent.token");
            } catch {
                // ignore
            }
            if (location.pathname !== "/login") {
                location.assign("/login");
            }
        }
        return;
    }

    if (e.type === "CONV_REOPENED") {
        // A previously closed conversation got re-opened by an inbound visitor message.
        // Agents may not be subscribed to it yet; refresh inbox list.
        scheduleInboxRefresh();
        return;
    }

    if (e.type === "INBOX_CHANGED") {
        // Assignment/transfer happened; refresh inbox list.
        scheduleInboxRefresh();
        return;
    }

    if (e.type === "AGENT_STATUS") {
        const obj = e as Record<string, unknown>;
        const userId = String(obj.user_id ?? "");
        if (!userId) return;
        window.dispatchEvent(
            new CustomEvent("chatlive:agentStatus", {
                detail: {
                    user_id: userId,
                    status: obj.status,
                    effective_status: obj.effective_status,
                    max_concurrent: obj.max_concurrent,
                    assigned_active: obj.assigned_active,
                    remaining_capacity: obj.remaining_capacity,
                    can_accept: obj.can_accept,
                },
            }),
        );
        return;
    }

    if (e.type === "CONV_EVENT") {
        const obj = e as Record<string, unknown>;
        const convId = String(obj.conversation_id ?? "") || ensureWs().getSubscribedConversationId();
        if (!convId) return;

        const evt = coerceConversationSystemEvent({
            id: obj.event_id,
            event_key: obj.event_key,
            created_at: obj.created_at,
            data: obj.data,
        });
        if (!evt) return;
        addSystemEvents(convId, [evt]);
        return;
    }

    if (e.type === "MSG") {
        const msg = coerceMessageItem(e.msg);
        if (!msg) return;
        const convId = String(e.conversation_id ?? "") || ensureWs().getSubscribedConversationId();
        if (!convId) return;
        addMessages(convId, [msg]);

        // Scheme B: server supplies preview_text; apply it to the list immediately.
        patchConversationLastMessage(convId, msg);

        // Unread + notification (best-effort): count customer messages for non-active conversations.
        const st = useChatStore.getState();
        const isActive = st.selectedConversationId === convId;
        if (!isActive && msg.sender_type === "customer") {
            useChatStore.setState((prev) => ({
                conversations: prev.conversations.map((c) =>
                    c.id === convId ? { ...c, unread_count: Math.max(0, Number(c.unread_count || 0) + 1) } : c,
                ),
            }));

            window.dispatchEvent(
                new CustomEvent("chatlive:newMessage", {
                    detail: { conversationId: convId, msg },
                }),
            );
        }
        return;
    }

    if (e.type === "SYNC_RES") {
        const convId = String(e.conversation_id ?? "") || ensureWs().getSubscribedConversationId();
        if (!convId) return;
        const list = Array.isArray(e.messages) ? e.messages : [];
        const msgs = list.map(coerceMessageItem).filter((x): x is MessageItem => Boolean(x));
        if (msgs.length) {
            addMessages(convId, msgs);
            const last = msgs[msgs.length - 1];
            if (last) patchConversationLastMessage(convId, last);
        }

        const evRaw = (e as unknown as { conversation_events?: unknown[] }).conversation_events;
        const evList = Array.isArray(evRaw) ? evRaw : [];
        if (evList.length) {
            const evts = evList
                .map((item) => {
                    if (!item || typeof item !== "object") return null;
                    const obj = item as Record<string, unknown>;
                    return coerceConversationSystemEvent({
                        id: obj.event_id,
                        event_key: obj.event_key,
                        created_at: obj.created_at,
                        data: obj.data,
                    });
                })
                .filter((x): x is ConversationSystemEvent => Boolean(x));
            if (evts.length) addSystemEvents(convId, evts);
        }
        return;
    }

    if (e.type === "TYPING") {
        const obj = e as Record<string, unknown>;
        const convId = String(obj.conversation_id ?? "") || ensureWs().getSubscribedConversationId();
        if (!convId) return;
        const senderRole = typeof obj.sender_role === "string" ? obj.sender_role : "";
        const isTyping = Boolean(obj.is_typing);
        // Agent UI cares about visitor typing.
        if (senderRole !== "visitor") return;
        useChatStore.setState((st) => ({
            typingByConversationId: {
                ...st.typingByConversationId,
                [convId]: isTyping,
            },
        }));
        return;
    }

    if (e.type === "READ") {
        const obj = e as Record<string, unknown>;
        const convId = String(obj.conversation_id ?? "") || ensureWs().getSubscribedConversationId();
        if (!convId) return;
        const senderRole = typeof obj.sender_role === "string" ? obj.sender_role : "";
        const lastRead = String(obj.last_read_msg_id ?? "");
        if (!lastRead) return;
        // Agent UI cares about visitor read state.
        if (senderRole !== "visitor") return;
        const readAtRaw = obj.read_at;
        const readAt = typeof readAtRaw === "number" ? readAtRaw : Number(readAtRaw || 0);
        useChatStore.setState((st) => ({
            remoteLastReadByConversationId: {
                ...st.remoteLastReadByConversationId,
                [convId]: lastRead,
            },
            remoteLastReadAtByConversationId: {
                ...st.remoteLastReadAtByConversationId,
                ...(readAt > 0 ? { [convId]: readAt } : null),
            },
        }));
        return;
    }
}

async function presignUpload(conversationId: string, file: File) {
    const res = await http.post<{ attachment_id: string; upload_url: string }>("/api/v1/attachments/presign-upload", {
        conversation_id: conversationId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
    });
    const attachmentId = res.data?.attachment_id;
    const uploadUrl = res.data?.upload_url;
    if (!attachmentId || !uploadUrl) throw new Error("presign_failed");
    return { attachmentId, uploadUrl };
}

async function uploadToPresignedUrl(url: string, file: File) {
    const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
    });
    if (!put.ok) {
        throw new Error(`upload_failed_${put.status}`);
    }
}

export const useChatStore = create<ChatState>((set, get) => ({
    conversations: [],
    conversationsLoading: false,

    inboxStatus: null,
    inboxStarredOnly: false,

    selectedConversationId: null,

    conversationDetailById: {},
    conversationDetailLoadingById: {},

    messagesByConversationId: {},
    messageIdSetByConversationId: {},

    systemEventsByConversationId: {},
    systemEventIdSetByConversationId: {},

    wsStatus: "disconnected",

    typingByConversationId: {},
    remoteLastReadByConversationId: {},
    remoteLastReadAtByConversationId: {},

    uploading: false,

    agents: [],
    agentsLoading: false,

    metaByConversationId: {},
    metaLoadingByConversationId: {},

    quickReplies: [],
    quickRepliesLoading: false,

    draftByConversationId: {},

    refreshConversations: async (status, starredOnly) => {
        set({ conversationsLoading: true });
        try {
            const effectiveStatus = status ?? null;
            const effectiveStarredOnly = Boolean(starredOnly);
            const params: Record<string, unknown> = {
                starred_only: effectiveStarredOnly,
            };
            if (effectiveStatus) {
                params.status = effectiveStatus;
            }
            const res = await http.get<Conversation[]>("/api/v1/conversations", { params });
            const list = Array.isArray(res.data) ? res.data : [];
            set({
                conversations: list,
                inboxStatus: effectiveStatus,
                inboxStarredOnly: effectiveStarredOnly,
            });

            // Subscribe to current inbox list for notifications.
            const ws = ensureWs();
            ws.setSubscriptions(list.map((c) => c.id));
        } finally {
            set({ conversationsLoading: false });
        }
    },

    bootstrapInboxSubscriptions: async (status, starredOnly) => {
        const token = getToken();
        if (!token) return;

        const effectiveStatus = status ?? get().inboxStatus ?? null;
        const effectiveStarredOnly = starredOnly ?? get().inboxStarredOnly ?? false;

        try {
            const params: Record<string, unknown> = {
                starred_only: Boolean(effectiveStarredOnly),
            };
            if (effectiveStatus) {
                params.status = effectiveStatus;
            }
            const res = await http.get<Conversation[]>("/api/v1/conversations", { params });
            const list = Array.isArray(res.data) ? res.data : [];
            ensureWs().setSubscriptions(list.map((c) => c.id));
        } catch {
            // best-effort: keep WS connected even if inbox bootstrap fails
        }
    },

    setStarred: async (conversationId, starred) => {
        if (!conversationId) return;
        await http.put(`/api/v1/conversations/${encodeURIComponent(conversationId)}/star`, { starred });

        set((st) => ({
            conversations: st.conversations.map((c) => (c.id === conversationId ? { ...c, starred } : c)),
            conversationDetailById: {
                ...st.conversationDetailById,
                [conversationId]: st.conversationDetailById[conversationId]
                    ? { ...(st.conversationDetailById[conversationId] as ConversationDetail), starred }
                    : st.conversationDetailById[conversationId],
            },
        }));
    },

    selectConversation: (id) => {
        set({ selectedConversationId: id });

        // Hydrate draft (best-effort) so switching/reload doesn't lose typed text.
        if (id) {
            const existing = get().draftByConversationId[id];
            if (existing === undefined) {
                try {
                    const raw = localStorage.getItem(draftStorageKey(id));
                    if (raw !== null) {
                        set((st) => ({
                            draftByConversationId: {
                                ...st.draftByConversationId,
                                [id]: raw,
                            },
                        }));
                    }
                } catch {
                    // ignore
                }
            }
        }

        if (id) {
            // best-effort; do not block UI
            get().loadConversationDetail(id).catch(() => {
                // ignore
            });
        }

        const ws = ensureWs();
        if (id && ws.getStatus() === "connected") {
            ws.subscribe(id);
            const msgs = get().messagesByConversationId[id] || [];
            const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
            ws.sync(id, lastId);
        }

        if (id) {
            // Optimistic: entering a conversation clears its badge.
            set((st) => ({
                conversations: st.conversations.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
            }));
        }
    },

    loadConversationDetail: async (conversationId) => {
        if (!conversationId) return;
        set((st) => ({
            conversationDetailLoadingById: {
                ...st.conversationDetailLoadingById,
                [conversationId]: true,
            },
        }));
        try {
            const res = await http.get<ConversationDetail>(
                `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
            );
            set((st) => ({
                conversationDetailById: {
                    ...st.conversationDetailById,
                    [conversationId]: res.data || null,
                },
            }));
        } finally {
            set((st) => ({
                conversationDetailLoadingById: {
                    ...st.conversationDetailLoadingById,
                    [conversationId]: false,
                },
            }));
        }
    },

    connectWs: () => {
        const token = getToken();
        if (!token) return;
        const ws = ensureWs();
        ws.connect();

        // push current list subscriptions on connect
        const ids = get().conversations.map((c) => c.id);
        ws.setSubscriptions(ids);
    },

    disconnectWs: () => {
        if (!wsClient) return;
        wsClient.close();
    },

    loadHistory: async (conversationId, limit = 50) => {
        if (!conversationId) return;
        const res = await http.get<unknown[]>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
            params: { limit },
        });
        const list = Array.isArray(res.data) ? res.data : [];
        const msgs = list.map(coerceMessageItem).filter((x): x is MessageItem => Boolean(x));

        set((st) => {
            const existing = st.messagesByConversationId[conversationId] || [];
            const idSet: Record<string, true> = {};
            const merged: MessageItem[] = [];

            for (const m of msgs) {
                if (!m?.id) continue;
                if (idSet[m.id]) continue;
                idSet[m.id] = true;
                merged.push(m);
            }

            for (const m of existing) {
                if (!m?.id) continue;
                if (idSet[m.id]) continue;
                idSet[m.id] = true;
                merged.push(m);
            }

            merged.sort((a, b) => (a.created_at - b.created_at) || (a.id > b.id ? 1 : -1));
            return {
                messagesByConversationId: {
                    ...st.messagesByConversationId,
                    [conversationId]: merged,
                },
                messageIdSetByConversationId: {
                    ...st.messageIdSetByConversationId,
                    [conversationId]: idSet,
                },
            };
        });
    },

    sync: (conversationId) => {
        if (!conversationId) return;
        const ws = ensureWs();
        if (ws.getStatus() !== "connected") return;
        ws.subscribe(conversationId);
        const msgs = get().messagesByConversationId[conversationId] || [];
        const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
        ws.sync(conversationId, lastId);
    },

    sendText: (conversationId, text) => {
        const ws = ensureWs();
        ws.sendText(conversationId, text);
    },

    sendRead: (conversationId, lastReadMsgId) => {
        const ws = ensureWs();
        ws.sendRead(conversationId, lastReadMsgId);

        // optimistic clear
        set((st) => ({
            conversations: st.conversations.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)),
        }));
    },

    sendTyping: (conversationId, isTyping) => {
        const ws = ensureWs();
        ws.sendTyping(conversationId, isTyping);
    },

    sendFile: async (conversationId, file) => {
        if (!conversationId) return;
        set({ uploading: true });
        try {
            const { attachmentId, uploadUrl } = await presignUpload(conversationId, file);
            await uploadToPresignedUrl(uploadUrl, file);
            ensureWs().sendFile(conversationId, attachmentId);
        } finally {
            set({ uploading: false });
        }
    },

    downloadAttachment: async (attachmentId) => {
        const res = await http.get<{ download_url: string }>(
            `/api/v1/attachments/${encodeURIComponent(attachmentId)}/presign-download`,
        );
        return res.data?.download_url || null;
    },

    closeConversation: async (conversationId) => {
        if (!conversationId) return;
        await http.post(`/api/v1/conversations/${encodeURIComponent(conversationId)}/close`, {});
        await get().loadConversationDetail(conversationId);
        await get().refreshConversations(null, false);
    },

    reopenConversation: async (conversationId) => {
        if (!conversationId) return;
        await http.post(`/api/v1/conversations/${encodeURIComponent(conversationId)}/reopen`, {});
        await get().loadConversationDetail(conversationId);
        await get().refreshConversations(null, false);
    },

    assignConversation: async (conversationId, agentUserId) => {
        if (!conversationId) return;
        await http.post(`/api/v1/agent/conversations/${encodeURIComponent(conversationId)}/assign`, {
            agent_user_id: agentUserId,
        });

        // Optimistic: once transferred away, it should disappear from current agent inbox.
        set((st) => {
            const nextConversations = st.conversations.filter((c) => c.id !== conversationId);
            // Update WS subscriptions to match the new inbox list and proactively UNSUB this conversation.
            try {
                ensureWs().setSubscriptions(nextConversations.map((c) => c.id));
                ensureWs().unsubscribe(conversationId);
            } catch {
                // ignore
            }

            return {
                conversations: nextConversations,
                selectedConversationId: st.selectedConversationId === conversationId ? null : st.selectedConversationId,
            };
        });

        await get().refreshConversations(null, false);
    },

    claimConversation: async (conversationId) => {
        if (!conversationId) return;
        await http.post(`/api/v1/agent/conversations/${encodeURIComponent(conversationId)}/claim`, {});
        await get().refreshConversations(null, false);
        await get().loadConversationDetail(conversationId);
    },

    loadAgents: async () => {
        set({ agentsLoading: true });
        try {
            const res = await http.get<AgentListItem[]>("/api/v1/agent/agents");
            set({ agents: Array.isArray(res.data) ? res.data : [] });
        } finally {
            set({ agentsLoading: false });
        }
    },

    loadMeta: async (conversationId) => {
        if (!conversationId) return;
        set((st) => ({
            metaLoadingByConversationId: { ...st.metaLoadingByConversationId, [conversationId]: true },
        }));
        try {
            const res = await http.get<ConversationMeta>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/meta`);
            set((st) => ({
                metaByConversationId: { ...st.metaByConversationId, [conversationId]: res.data },
            }));
        } finally {
            set((st) => ({
                metaLoadingByConversationId: { ...st.metaLoadingByConversationId, [conversationId]: false },
            }));
        }
    },

    setMetaLocal: (conversationId, meta) => {
        if (!conversationId) return;
        set((st) => ({
            metaByConversationId: {
                ...st.metaByConversationId,
                [conversationId]: meta,
            },
        }));
    },

    setTags: async (conversationId, tags) => {
        if (!conversationId) return;
        await http.put(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags`, { tags });
        await get().loadMeta(conversationId);
    },

    setNote: async (conversationId, note) => {
        if (!conversationId) return;
        await http.put(`/api/v1/conversations/${encodeURIComponent(conversationId)}/note`, { note });
        await get().loadMeta(conversationId);
    },

    loadQuickReplies: async (q, limit = 50) => {
        set({ quickRepliesLoading: true });
        try {
            const res = await http.get<QuickReplyItem[]>("/api/v1/quick-replies", {
                params: { q: q || undefined, limit },
            });
            set({ quickReplies: Array.isArray(res.data) ? res.data : [] });
        } finally {
            set({ quickRepliesLoading: false });
        }
    },

    createQuickReply: async (title, content) => {
        await http.post("/api/v1/quick-replies", { title, content });
        await get().loadQuickReplies(undefined, 50);
    },

    setDraft: (conversationId, draft) => {
        if (!conversationId) return;
        set((st) => ({
            draftByConversationId: {
                ...st.draftByConversationId,
                [conversationId]: draft,
            },
        }));
        try {
            localStorage.setItem(draftStorageKey(conversationId), String(draft ?? ""));
        } catch {
            // ignore
        }
    },
}));
