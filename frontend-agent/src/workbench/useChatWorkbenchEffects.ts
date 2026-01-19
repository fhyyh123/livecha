import { useEffect, useRef } from "react";

import type { MessageItem } from "../store/chatStore";

export type UseChatWorkbenchEffectsArgs = {
    inboxStatus?: string | null;

    starredOnly: boolean;

    refreshConversations: (status?: string | null, starredOnly?: boolean) => Promise<void>;

    loadAgents: () => Promise<void>;

    routeConversationId?: string;

    selectConversation: (id: string | null) => void;
    loadHistory: (conversationId: string) => Promise<void>;
    loadConversationDetail: (conversationId: string) => Promise<void>;
    loadMeta: (conversationId: string) => Promise<void>;

    selectedId: string | null;

    wsStatus: "disconnected" | "connecting" | "connected";

    draft: string;
    sendTyping: (conversationId: string, isTyping: boolean) => void;

    messages: MessageItem[];
    sendRead: (conversationId: string, lastReadMsgId: string) => void;
};

export function useChatWorkbenchEffects(args: UseChatWorkbenchEffectsArgs) {
    const {
        inboxStatus,
        starredOnly,
        refreshConversations,
        loadAgents,
        routeConversationId,
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
    } = args;

    const refreshRef = useRef(refreshConversations);
    const loadAgentsRef = useRef(loadAgents);
    const selectConversationRef = useRef(selectConversation);
    const loadHistoryRef = useRef(loadHistory);
    const loadConversationDetailRef = useRef(loadConversationDetail);
    const loadMetaRef = useRef(loadMeta);
    const sendTypingRef = useRef(sendTyping);
    const sendReadRef = useRef(sendRead);

    useEffect(() => {
        refreshRef.current = refreshConversations;
        loadAgentsRef.current = loadAgents;
        selectConversationRef.current = selectConversation;
        loadHistoryRef.current = loadHistory;
        loadConversationDetailRef.current = loadConversationDetail;
        loadMetaRef.current = loadMeta;
        sendTypingRef.current = sendTyping;
        sendReadRef.current = sendRead;
    }, [
        refreshConversations,
        loadAgents,
        selectConversation,
        loadHistory,
        loadConversationDetail,
        loadMeta,
        sendTyping,
        sendRead,
    ]);

    // Refresh inbox when filters change.
    useEffect(() => {
        refreshRef.current(inboxStatus, starredOnly).catch(() => {
            // ignore
        });
    }, [inboxStatus, starredOnly]);

    // Initial connect.
    useEffect(() => {
        refreshRef.current(inboxStatus, starredOnly).catch(() => {
            // ignore
        });
        loadAgentsRef.current().catch(() => {
            // ignore
        });
        // Intentionally run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Follow route param id.
    useEffect(() => {
        if (!routeConversationId) return;
        selectConversationRef.current(routeConversationId);
        loadHistoryRef.current(routeConversationId).catch(() => {
            // ignore
        });
        loadConversationDetailRef.current(routeConversationId).catch(() => {
            // ignore
        });
        loadMetaRef.current(routeConversationId).catch(() => {
            // ignore
        });
    }, [routeConversationId]);

    // Ensure meta is loaded when selecting conversation (best-effort).
    useEffect(() => {
        if (!selectedId) return;
        loadMetaRef.current(selectedId).catch(() => {
            // ignore
        });
    }, [selectedId]);

    const typingStopTimerRef = useRef<number | null>(null);

    // Emit typing events (debounced).
    useEffect(() => {
        if (!selectedId) return;
        if (wsStatus !== "connected") return;

        if (typingStopTimerRef.current) {
            window.clearTimeout(typingStopTimerRef.current);
            typingStopTimerRef.current = null;
        }

        const active = Boolean(draft.trim());
        sendTypingRef.current(selectedId, active);

        if (active) {
            typingStopTimerRef.current = window.setTimeout(() => {
                typingStopTimerRef.current = null;
                sendTypingRef.current(selectedId, false);
            }, 1200);
        }

        return () => {
            if (typingStopTimerRef.current) {
                window.clearTimeout(typingStopTimerRef.current);
                typingStopTimerRef.current = null;
            }
        };
    }, [draft, selectedId, wsStatus]);

    const lastSentReadRef = useRef<string | null>(null);

    // Emit read receipts when viewing incoming messages.
    useEffect(() => {
        if (!selectedId) return;
        if (wsStatus !== "connected") return;
        if (!messages.length) return;

        let lastIncomingId: string | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m?.sender_type === "customer" && m.id) {
                lastIncomingId = m.id;
                break;
            }
        }

        if (!lastIncomingId) return;
        if (lastSentReadRef.current === lastIncomingId) return;
        lastSentReadRef.current = lastIncomingId;
        sendReadRef.current(selectedId, lastIncomingId);
    }, [messages, selectedId, wsStatus]);
}
