import { CloseOutlined, DownOutlined, FileOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { Button, Image, Spin, Typography } from "antd";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { http } from "../providers/http";
import type { ConversationDetail, MessageItem } from "../store/chatStore";
import { isPreviewableImage } from "../utils/attachments";
import { ChatComposer } from "./ChatComposer";

import "./chatView.css";

const BOTTOM_EPS_PX = 2;

type AvatarLookupItem = {
    user_id: string;
    display_name?: string | null;
    avatar_url?: string | null;
};

export type TimelineSystemEvent = {
    id: string;
    ts: number;
    text: string;
    afterMessageId?: string;
};

export type ChatViewProps = {
    t: (key: string, options?: Record<string, unknown>) => string;

    messages: MessageItem[];
    peerLastRead?: string | null;
    peerLastReadAt?: number | null;
    systemEvents?: TimelineSystemEvent[];

    draft: string;
    setDraft: (next: string) => void;

    wsStatus: "disconnected" | "connecting" | "connected";
    detail?: ConversationDetail | null;

    uploading: boolean;
    uploadProps: UploadProps;

    onSendText: () => void;
    onDownload: (attachmentId?: string) => void;
    getAttachmentUrl?: (attachmentId: string) => Promise<string | null>;
    onOpenQuickReplies: () => void;

    onReopen?: () => Promise<void> | void;

    onLoadOlder?: () => Promise<void> | void;
    canLoadOlder?: boolean;
    loadingOlder?: boolean;
};

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

function estimateMessageWeight(m: MessageItem) {
    // Heuristic: larger/complex messages cost more "space" in the initial render window.
    // This keeps the initial load closer to what fits on screen and makes batches vary
    // with message length and content type.
    let w = 1;
    if (m.content_type === "text") {
        const text = String(m.content?.text || "");
        const len = text.length;
        const lines = text ? text.split(/\r?\n/).length : 1;
        w += Math.min(10, Math.ceil(len / 140));
        w += Math.min(4, Math.max(0, lines - 1));
    } else {
        // Attachments/cards tend to be taller.
        w += 6;
    }
    return w;
}

function computeTailRenderCount(messages: MessageItem[], opts?: { min?: number; max?: number; budget?: number }) {
    const min = Math.max(1, opts?.min ?? 20);
    const max = Math.max(min, opts?.max ?? 40);
    const budget = Math.max(10, opts?.budget ?? 36);
    if (!messages.length) return min;

    let w = 0;
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        w += estimateMessageWeight(messages[i]!);
        count++;
        if (count >= min && (w >= budget || count >= max)) break;
    }
    return Math.min(max, Math.max(min, count));
}

function computeOlderBatchCount(messages: MessageItem[], startIndex: number, opts?: { min?: number; max?: number; budget?: number }) {
    // startIndex is the first visible message index in the full messages array.
    const min = Math.max(1, opts?.min ?? 12);
    const max = Math.max(min, opts?.max ?? 50);
    const budget = Math.max(10, opts?.budget ?? 28);

    let w = 0;
    let count = 0;
    for (let i = startIndex - 1; i >= 0; i--) {
        w += estimateMessageWeight(messages[i]!);
        count++;
        if (count >= min && (w >= budget || count >= max)) break;
    }
    return Math.min(max, Math.max(0, count));
}

function firstGlyph(s: string) {
    const trimmed = String(s || "").trim();
    if (!trimmed) return "";
    return Array.from(trimmed)[0] || "";
}

function hashHue(s: string) {
    let h = 0;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % 360;
}

function hash32(s: string) {
    let h = 2166136261;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function stableTag6(seed: string) {
    const h = hash32(seed);
    // Base36 gives [0-9a-z], we upper-case to look like a random code.
    // Pad/slice to a fixed 6-char tag.
    return h.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function AttachmentImageBubble(props: {
    t: (key: string, options?: Record<string, unknown>) => string;
    attachmentId?: string;
    filename?: string;
    sizeBytes?: number;
    getAttachmentUrl?: (attachmentId: string) => Promise<string | null>;
    onDownload: (attachmentId?: string) => void;
    onPreview?: (url: string, alt: string) => void;
    cacheRef: { current: Record<string, string> };
    pendingRef: { current: Record<string, Promise<string | null>> };
}) {
    const { t, attachmentId, filename, sizeBytes, getAttachmentUrl, onDownload, onPreview, cacheRef, pendingRef } = props;
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const id = String(attachmentId || "");
        if (!id || !getAttachmentUrl) return;

        const cached = cacheRef.current[id];
        if (cached) {
            setUrl(cached);
            return;
        }

        const pending = pendingRef.current[id];
        const p =
            pending ||
            (pendingRef.current[id] = getAttachmentUrl(id)
                .then((u) => {
                    const next = u || null;
                    if (next) cacheRef.current[id] = next;
                    return next;
                })
                .catch(() => null)
                .finally(() => {
                    delete pendingRef.current[id];
                }));

        void p.then((u) => {
            if (!alive) return;
            setUrl(u);
        });

        return () => {
            alive = false;
        };
    }, [attachmentId, getAttachmentUrl, cacheRef, pendingRef]);

    if (!attachmentId || !getAttachmentUrl) {
        return (
            <div className="cl-attachmentRow">
                <FileOutlined />
                <Typography.Text>{filename || attachmentId || "file"}</Typography.Text>
                <Typography.Text type="secondary">{formatBytes(sizeBytes)}</Typography.Text>
                <Button type="link" onClick={() => onDownload(attachmentId)} disabled={!attachmentId}>
                    {t("common.download")}
                </Button>
            </div>
        );
    }

    if (!url) {
        return (
            <div className="cl-attachmentRow">
                <Spin size="small" />
                <Typography.Text>{filename || attachmentId || "file"}</Typography.Text>
                <Typography.Text type="secondary">{formatBytes(sizeBytes)}</Typography.Text>
                <Button type="link" onClick={() => onDownload(attachmentId)} disabled={!attachmentId}>
                    {t("common.download")}
                </Button>
            </div>
        );
    }

    return (
        <div className="cl-attachmentImageWrap">
            <img
                className="cl-attachmentImage"
                src={url}
                alt={filename || "image"}
                loading="lazy"
                onClick={() => onPreview?.(url, String(filename || attachmentId || "image"))}
            />
            <div className="cl-attachmentImageMeta">
                <Typography.Text>{filename || attachmentId || "image"}</Typography.Text>
                <Typography.Text type="secondary">{formatBytes(sizeBytes)}</Typography.Text>
                <Button type="link" onClick={() => onDownload(attachmentId)}>
                    {t("common.download")}
                </Button>
            </div>
        </div>
    );
}

export function ChatView({
    t,
    messages,
    peerLastRead,
    peerLastReadAt,
    systemEvents,
    draft,
    setDraft,
    wsStatus,
    detail,
    uploading,
    uploadProps,
    onSendText,
    onDownload,
    getAttachmentUrl,
    onOpenQuickReplies,
    onReopen,
    onLoadOlder,
    canLoadOlder = false,
    loadingOlder = false,
}: ChatViewProps) {
    const [renderCount, setRenderCount] = useState(30);
    const initConvIdRef = useRef<string | null>(null);
    const lastTailSigRef = useRef<string>("");
    const forceToBottomRef = useRef(false);
    const [newTailCount, setNewTailCount] = useState(0);

    const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");

    const openImagePreview = useCallback((url: string) => {
        setImagePreviewUrl(String(url || ""));
    }, []);

    const attachmentUrlCacheRef = useRef<Record<string, string>>({});
    const attachmentUrlPendingRef = useRef<Record<string, Promise<string | null>>>({});

    const avatarUrlCacheRef = useRef<Record<string, string>>({});
    const agentNameCacheRef = useRef<Record<string, string>>({});
    const avatarUrlPendingRef = useRef<Record<string, Promise<void> | undefined>>({});
    const [, bumpAvatarTick] = useState(0);

    useEffect(() => {
        // Reset window when switching conversations.
        initConvIdRef.current = null;
        lastTailSigRef.current = "";
        forceToBottomRef.current = false;
        setNewTailCount(0);
        setRenderCount(30);
    }, [detail?.id]);

    useEffect(() => {
        const cid = detail?.id ? String(detail.id) : null;
        if (!cid) return;
        if (initConvIdRef.current === cid) return;
        if (!messages.length) return;

        // Initial render window varies with message length.
        setRenderCount(computeTailRenderCount(messages));
        initConvIdRef.current = cid;
    }, [detail?.id, messages]);

    const visibleMessages = useMemo(() => {
        if (!messages.length) return [];
        const start = Math.max(0, messages.length - Math.max(20, renderCount));
        return messages.slice(start);
    }, [messages, renderCount]);

    useEffect(() => {
        const ids = Array.from(
            new Set(
                visibleMessages
                    .filter((m) => String(m.sender_type) === "agent")
                    .map((m) => String(m.sender_id || "").trim())
                    .filter(Boolean),
            ),
        );

        const need = ids.filter((id) => !(id in avatarUrlCacheRef.current));
        if (!need.length) return;

        const batchKey = need.join(",");
        if (avatarUrlPendingRef.current[batchKey]) return;

        avatarUrlPendingRef.current[batchKey] = (async () => {
            try {
                const res = await http.post<AvatarLookupItem[]>("/api/v1/profile/avatars/lookup", { user_ids: need });
                const list = Array.isArray(res.data) ? res.data : [];

                let changed = false;
                for (const it of list) {
                    const userId = String(it?.user_id || "").trim();
                    if (!userId) continue;
                    const url = String(it?.avatar_url || "").trim();
                    avatarUrlCacheRef.current[userId] = url;

                    const name = String(it?.display_name || "").trim();
                    agentNameCacheRef.current[userId] = name;
                    if (url) changed = true;
                }
                // Mark unfound as empty to avoid refetch loops.
                for (const id of need) {
                    if (!(id in avatarUrlCacheRef.current)) {
                        avatarUrlCacheRef.current[id] = "";
                    }
                    if (!(id in agentNameCacheRef.current)) {
                        agentNameCacheRef.current[id] = "";
                    }
                }

                if (changed) bumpAvatarTick((x) => x + 1);
            } catch {
                // Ignore; allow retry on next window change.
            } finally {
                delete avatarUrlPendingRef.current[batchKey];
            }
        })();
    }, [visibleMessages]);

    type TimelineItem =
        | { kind: "message"; id: string; message: MessageItem }
        | { kind: "system"; id: string; text: string; ts: number };

    const timelineItems: TimelineItem[] = useMemo(() => {
        const baseEvents = Array.isArray(systemEvents) ? systemEvents : [];

        const allEvents = [...baseEvents]
            .filter((e) => e && e.id && Number(e.ts || 0) > 0 && String(e.text || "").trim())
            .map((e) => ({
                id: String(e.id),
                ts: Number(e.ts || 0),
                text: String(e.text || "").trim(),
                afterMessageId: e.afterMessageId ? String(e.afterMessageId) : undefined,
            }));

        const eventsAfter: Record<string, TimelineSystemEvent[]> = {};
        const timedEvents: TimelineSystemEvent[] = [];
        for (const e of allEvents) {
            if (e.afterMessageId) {
                (eventsAfter[e.afterMessageId] ||= []).push(e);
            } else {
                timedEvents.push(e);
            }
        }
        timedEvents.sort((a, b) => (a.ts - b.ts) || String(a.id).localeCompare(String(b.id)));

        const items: TimelineItem[] = [];
        let eventCursor = 0;

        for (const m of visibleMessages) {
            const mts = Number(m.created_at || 0);

            // Insert timed events before this message.
            while (eventCursor < timedEvents.length && timedEvents[eventCursor]!.ts < mts) {
                const e = timedEvents[eventCursor]!;
                items.push({ kind: "system", id: e.id, text: e.text, ts: e.ts });
                eventCursor++;
            }

            items.push({ kind: "message", id: m.id, message: m });

            // Insert events that must appear right after this message.
            const afterList = eventsAfter[m.id] || [];
            for (const e of afterList) {
                items.push({ kind: "system", id: e.id, text: e.text, ts: e.ts });
            }

            // For timed events that share the same timestamp as this message,
            // place them after the message to keep UI deterministic.
            while (eventCursor < timedEvents.length && timedEvents[eventCursor]!.ts <= mts) {
                const e = timedEvents[eventCursor]!;
                items.push({ kind: "system", id: e.id, text: e.text, ts: e.ts });
                eventCursor++;
            }
        }

        // Append remaining timed events.
        while (eventCursor < timedEvents.length) {
            const e = timedEvents[eventCursor]!;
            items.push({ kind: "system", id: e.id, text: e.text, ts: e.ts });
            eventCursor++;
        }

        return items;
    }, [systemEvents, visibleMessages]);

    const lastAgentMsgId = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]!;
            if (m.sender_type === "agent") return m.id;
        }
        return null;
    }, [messages]);

    const tailSig = useMemo(() => {
        const last = timelineItems[timelineItems.length - 1];
        if (!last) return "";
        if (last.kind === "system") return `s:${last.id}:${last.ts}`;
        const m = last.message;
        const ts = Number(m.created_at || 0);
        const textLen = m.content_type === "text" ? String(m.content?.text || "").length : 0;
        const attachmentId = m.content_type === "text" ? "" : String(m.content?.attachment_id || "");
        return `m:${m.id}:${ts}:${m.sender_type}:${m.content_type}:${textLen}:${attachmentId}`;
    }, [timelineItems]);

    const tailInfo = useMemo(() => {
        const last = timelineItems[timelineItems.length - 1];
        if (!last) return { kind: "none" as const };
        if (last.kind === "system") return { kind: "system" as const };
        return { kind: "message" as const, senderType: last.message.sender_type };
    }, [timelineItems]);

    const hiddenCount = Math.max(0, messages.length - visibleMessages.length);

    const lastVisibleStartIndex = Math.max(0, messages.length - visibleMessages.length);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const stickToBottomRef = useRef(true);
    const preserveScrollRef = useRef(false);
    const prevScrollHeightRef = useRef(0);
    const lastAutoLoadAtRef = useRef(0);

    const onClickLoadOlder = useCallback(async () => {
        if (!onLoadOlder) return;
        const el = scrollRef.current;
        if (el) {
            preserveScrollRef.current = true;
            prevScrollHeightRef.current = el.scrollHeight;
        }
        await onLoadOlder();
        // Also expand render window after fetching; batch size varies with message length.
        const startIdx = Math.max(0, messages.length - visibleMessages.length);
        const add = computeOlderBatchCount(messages, startIdx, { min: 16, max: 60, budget: 32 });
        setRenderCount((n) => n + Math.max(16, add));
    }, [messages, onLoadOlder, visibleMessages.length]);

    useEffect(() => {
        // If the timeline tail changes (new message/system event):
        // - If user is at bottom => keep following.
        // - If not at bottom => show a banner, EXCEPT when agent sends a message (force jump).
        if (!detail?.id) return;
        if (!tailSig) return;
        if (tailSig === lastTailSigRef.current) return;
        lastTailSigRef.current = tailSig;
        const el = scrollRef.current;
        const atBottom = el
            ? el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_EPS_PX
            : stickToBottomRef.current;
        const isAgentMessage = tailInfo.kind === "message" && tailInfo.senderType === "agent";

        if (atBottom || isAgentMessage) {
            forceToBottomRef.current = true;
            stickToBottomRef.current = true;
            setNewTailCount(0);
        } else {
            setNewTailCount((n) => Math.min(99, n + 1));
        }
    }, [detail?.id, tailInfo.kind, tailInfo.senderType, tailSig]);

    function scrollToBottom(behavior: ScrollBehavior = "smooth") {
        const el = scrollRef.current;
        if (!el) return;
        preserveScrollRef.current = false;
        stickToBottomRef.current = true;
        setNewTailCount(0);

        // Scroll immediately. (Clicking the banner doesn't change dependencies,
        // so relying on the layout effect would do nothing.)
        requestAnimationFrame(() => {
            el.scrollTo({ top: el.scrollHeight, behavior });
            // Prevent a stale pending force-scroll from triggering on the next tail change.
            forceToBottomRef.current = false;
        });
    }

    const newMsgLabel = useMemo(() => {
        if (newTailCount <= 0) return "";
        const base = newTailCount === 1 ? t("workbench.newMessageOne") : t("workbench.newMessageMany");
        return `${newTailCount} ${base}`;
    }, [newTailCount, t]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        function onScroll() {
            const cur = scrollRef.current;
            if (!cur) return;
            const atBottom = cur.scrollTop + cur.clientHeight >= cur.scrollHeight - BOTTOM_EPS_PX;
            stickToBottomRef.current = atBottom;
            if (atBottom) setNewTailCount(0);

            const nearTop = cur.scrollTop <= 24;
            if (!nearTop) return;

            const now = Date.now();
            if (now - lastAutoLoadAtRef.current < 250) return;
            lastAutoLoadAtRef.current = now;

            // 1) If we already have older messages in memory but are hiding them,
            // reveal a batch first.
            if (hiddenCount > 0) {
                preserveScrollRef.current = true;
                prevScrollHeightRef.current = cur.scrollHeight;
                const add = computeOlderBatchCount(messages, lastVisibleStartIndex);
                if (add > 0) setRenderCount((n) => n + add);
                return;
            }

            // 2) Otherwise, fetch older messages from server (if available).
            if (canLoadOlder && onLoadOlder && !loadingOlder) {
                // Reuse the same scroll preservation logic as the button.
                void onClickLoadOlder();
            }
        }
        el.addEventListener("scroll", onScroll);
        return () => el.removeEventListener("scroll", onScroll);
    }, [
        canLoadOlder,
        hiddenCount,
        lastVisibleStartIndex,
        loadingOlder,
        messages,
        onLoadOlder,
        onClickLoadOlder,
    ]);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        if (forceToBottomRef.current) {
            el.scrollTop = el.scrollHeight;
            forceToBottomRef.current = false;
            preserveScrollRef.current = false;
            return;
        }

        if (preserveScrollRef.current) {
            const nextH = el.scrollHeight;
            const delta = nextH - prevScrollHeightRef.current;
            el.scrollTop = el.scrollTop + Math.max(0, delta);
            preserveScrollRef.current = false;
            return;
        }

        if (stickToBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [tailSig, visibleMessages.length, messages.length]);

    function formatTime(tsSeconds: number) {
        const d = new Date(tsSeconds * 1000);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    const readReceiptText = (() => {
        const label = t("workbench.readReceipt");
        const at = Number(peerLastReadAt || 0);
        if (at > 0) return `${label} · ${formatTime(at)}`;
        return label;
    })();

    const customerLabel = useMemo(() => {
        const name = String(detail?.visitor?.name || "").trim();
        const email = String(detail?.visitor?.email || "").trim();
        const who = name && name !== "-" ? name : (email && email !== "-" ? email : "");
        if (who) return who;

        const base = t("workbench.customer");
        const visitorId = String(detail?.visitor?.id || detail?.visitor_id || "").trim();
        const seed = visitorId || String(detail?.id || "").trim();
        if (!seed) return base;
        return `${base}-${stableTag6(seed)}`;
    }, [detail?.id, detail?.visitor?.email, detail?.visitor?.id, detail?.visitor?.name, detail?.visitor_id, t]);

    const agentLabel = useMemo(() => t("workbench.agent"), [t]);

    const isClosed = String(detail?.status || "") === "closed";
    const reopenDisabled = wsStatus !== "connected" || !onReopen;

    return (
        <>
            <div className="cl-chatView">
                <div className="cl-chatTopBar">
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {messages.length ? t("workbench.showingLast", { shown: visibleMessages.length, total: messages.length }) : ""}
                    </Typography.Text>
                </div>

                <div ref={scrollRef} className="cl-timeline">
                    {loadingOlder ? (
                        <div className="cl-timelineTopOverlay" aria-live="polite" aria-busy="true">
                            <div className="cl-timelineTopPill">
                                <Spin size="small" />
                                <span>{t("loading")}</span>
                            </div>
                        </div>
                    ) : null}
                    {(() => {
                        const groupWindowSec = 120;
                        let prevMsg: MessageItem | null = null;

                        return timelineItems.map((it, i) => {
                            if (it.kind === "system") {
                                prevMsg = null;
                                return (
                                    <div key={it.id} className="cl-systemRow">
                                        <div className="cl-systemPill">
                                            <span>{it.text}</span>
                                            <span>·</span>
                                            <span>{formatTime(it.ts)}</span>
                                        </div>
                                    </div>
                                );
                            }

                            const m = it.message;
                            const isAgent = m.sender_type === "agent";
                            const showReadReceipt =
                                Boolean(isAgent) &&
                                Boolean(lastAgentMsgId) &&
                                peerLastRead === lastAgentMsgId &&
                                m.id === lastAgentMsgId;
                            const sameAsPrev =
                                Boolean(prevMsg) &&
                                prevMsg!.sender_type === m.sender_type &&
                                Number(m.created_at || 0) - Number(prevMsg!.created_at || 0) <= groupWindowSec;
                            const isGroupStart = !sameAsPrev;

                            const next = timelineItems[i + 1];
                            const isGroupEnd =
                                !next ||
                                next.kind === "system" ||
                                next.message.sender_type !== m.sender_type ||
                                Number(next.message.created_at || 0) - Number(m.created_at || 0) > groupWindowSec;

                            const showHeader = isGroupStart;
                            const showAvatar = isGroupStart;
                            prevMsg = m;

                            const agentName = isAgent
                                ? String(agentNameCacheRef.current[String(m.sender_id || "").trim()] || "").trim()
                                : "";
                            const headerName = isAgent ? (agentName || agentLabel) : customerLabel;
                            const headerTime = formatTime(Number(m.created_at || 0));

                            const avatarText = firstGlyph(headerName) || (isAgent ? "A" : "C");
                            const avatarHue = hashHue(headerName || (isAgent ? "agent" : "customer"));
                            const avatarBg = `hsl(${avatarHue} 70% 92%)`;
                            const avatarFg = `hsl(${avatarHue} 35% 28%)`;
                            const avatarBorder = `hsl(${avatarHue} 45% 82%)`;

                            const agentAvatarUrl = isAgent
                                ? String(avatarUrlCacheRef.current[String(m.sender_id || "").trim()] || "")
                                : "";

                            const hasAvatarImage = Boolean(isAgent && agentAvatarUrl);
                            const avatarStyle = hasAvatarImage
                                ? undefined
                                : { background: avatarBg, color: avatarFg, borderColor: avatarBorder };

                            const avatarEl = showAvatar ? (
                                <div
                                    className={`cl-avatar ${isAgent ? "is-agent" : "is-customer"} ${hasAvatarImage ? "has-image" : ""}`}
                                    aria-hidden
                                    style={avatarStyle}
                                >
                                    {isAgent && agentAvatarUrl ? (
                                        <img src={agentAvatarUrl} alt="" loading="lazy" />
                                    ) : (
                                        avatarText
                                    )}
                                </div>
                            ) : (
                                <div className="cl-avatarSpacer" aria-hidden />
                            );

                            return (
                                <div
                                    key={it.id}
                                    className={`cl-msgRow ${isAgent ? "is-agent" : "is-customer"} ${
                                        isGroupStart ? "is-groupStart" : "is-groupContinue"
                                    } ${isGroupEnd ? "is-groupEnd" : ""}`}
                                >
                                    {isAgent ? null : avatarEl}

                                    <div className="cl-msgCol">
                                        {showHeader ? (
                                            <div className="cl-msgHeader">
                                                <div className="cl-msgHeaderName" title={headerName}>
                                                    {headerName}
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="cl-bubbleWrap">
                                            <div className="cl-bubble" title={headerTime}>
                                                {m.content_type === "text" ? (
                                                    <div className="cl-bubbleBody">{m.content?.text || ""}</div>
                                                ) : (
                                                    isPreviewableImage(m.content?.mime, m.content?.filename) ? (
                                                        <AttachmentImageBubble
                                                            t={t}
                                                            attachmentId={m.content?.attachment_id}
                                                            filename={m.content?.filename}
                                                            sizeBytes={m.content?.size_bytes}
                                                            getAttachmentUrl={getAttachmentUrl}
                                                            onDownload={onDownload}
                                                            onPreview={(url) => openImagePreview(url)}
                                                            cacheRef={attachmentUrlCacheRef}
                                                            pendingRef={attachmentUrlPendingRef}
                                                        />
                                                    ) : (
                                                        <div className="cl-attachmentRow">
                                                            <FileOutlined />
                                                            <Typography.Text>
                                                                {m.content?.filename || m.content?.attachment_id || "file"}
                                                            </Typography.Text>
                                                            <Typography.Text type="secondary">
                                                                {formatBytes(m.content?.size_bytes)}
                                                            </Typography.Text>
                                                            <Button
                                                                type="link"
                                                                onClick={() => onDownload(m.content?.attachment_id)}
                                                                disabled={!m.content?.attachment_id}
                                                            >
                                                                {t("common.download")}
                                                            </Button>
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            <div className="cl-msgTime" title={headerTime} aria-label={headerTime}>
                                                {headerTime}
                                            </div>
                                        </div>

                                        {showReadReceipt ? (
                                            <div className="cl-readReceipt" aria-label={readReceiptText}>
                                                {readReceiptText}
                                            </div>
                                        ) : null}
                                    </div>

                                    {isAgent ? avatarEl : null}
                                </div>
                            );
                        });
                    })()}
                </div>

                {newTailCount > 0 ? (
                    <div className="cl-newMsgBar" role="status" aria-live="polite">
                        <button type="button" className="cl-newMsgBarMain" onClick={() => scrollToBottom()}>
                            <span className="cl-newMsgDot" aria-hidden />
                            <span className="cl-newMsgText">{newMsgLabel}</span>
                        </button>
                        <div className="cl-newMsgBarActions">
                            <Button size="small" type="text" icon={<DownOutlined />} onClick={() => scrollToBottom()} />
                            <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setNewTailCount(0)} />
                        </div>
                    </div>
                ) : null}

                {isClosed ? (
                    <div className="cl-composer">
                        <div className="cl-composerBody cl-archivedComposerBody">
                            <Typography.Text type="secondary">{t("workbench.archivedComposerHint")}</Typography.Text>
                            <Button
                                type="primary"
                                onClick={() => void onReopen?.()}
                                disabled={reopenDisabled}
                            >
                                {t("workbench.openChat")}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <ChatComposer
                        t={t}
                        draft={draft}
                        setDraft={setDraft}
                        wsStatus={wsStatus}
                        conversationStatus={detail?.status}
                        uploading={uploading}
                        uploadProps={uploadProps}
                        onSendText={onSendText}
                        onOpenQuickReplies={onOpenQuickReplies}
                    />
                )}
            </div>

            {imagePreviewUrl ? (
                <Image
                    style={{ display: "none" }}
                    src={imagePreviewUrl}
                    preview={{
                        visible: true,
                        src: imagePreviewUrl,
                        onVisibleChange: (v) => {
                            if (!v) {
                                setImagePreviewUrl("");
                            }
                        },
                    }}
                />
            ) : null}
        </>
    );
}
