import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, ConfigProvider, Input, Modal, Popover, Select, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ArrowUpOutlined, FileAddOutlined, LeftOutlined, MinusOutlined, PlusOutlined, ScanOutlined, SmileOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { WsClient, type WsInboundEvent, type WsStatus } from "../ws/wsClient";
import { applyWidgetPhrasesToEmbedI18n, normalizeWidgetLanguage } from "../i18nEmbed";
import { isPreviewableImage } from "../utils/attachments";

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    return value as Record<string, unknown>;
}

function getErrorFields(err: unknown): { name?: string; message?: string } {
    const r = asRecord(err);
    if (!r) return {};
    const name = typeof r.name === "string" ? r.name : undefined;
    const message = typeof r.message === "string" ? r.message : undefined;
    return { name, message };
}

function safeJsonParse<T>(s: string): T | null {
    try {
        return JSON.parse(s) as T;
    } catch {
        return null;
    }
}

function parseWidgetPhrases(json: string | null | undefined): Record<string, string> {
    const raw = String(json || "").trim();
    if (!raw) return {};
    const parsed = safeJsonParse<unknown>(raw);
    if (!parsed || typeof parsed !== "object") return {};
    if (Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v;
    }
    return out;
}

type PreChatFieldType = "info" | "name" | "email" | "text" | "textarea" | "select" | "multiselect";
type PreChatField = {
    id: string;
    type: PreChatFieldType;
    label?: string | null;
    required?: boolean;
    options?: string[];
    text?: string | null;
};

function normalizePreChatFields(fields: PreChatField[]): PreChatField[] {
    const seen = new Set<string>();
    const out: PreChatField[] = [];
    for (const f of fields || []) {
        const id = String(f?.id || "").trim();
        const type = String(f?.type || "").trim() as PreChatFieldType;
        if (!id || !type) continue;
        if (seen.has(id)) continue;
        seen.add(id);

        const next: PreChatField = { id, type };
        if (type === "info") {
            next.text = String(f?.text || "").trim() || null;
        } else {
            next.label = String(f?.label || "").trim() || null;
            next.required = Boolean(f?.required);
            if (type === "select" || type === "multiselect") {
                next.options = Array.isArray(f?.options) ? f.options.map((x) => String(x).trim()).filter(Boolean) : undefined;
            }
        }
        out.push(next);
    }
    return out;
}

type WidgetConfig = {
    pre_chat_enabled: boolean;
    pre_chat_fields_json?: string | null;
    theme_color?: string | null;
    launcher_style?: string | null;
    theme_mode?: string | null;
    color_settings_mode?: string | null;
    color_overrides_json?: string | null;
    welcome_text?: string | null;
    cookie_domain?: string | null;
    cookie_samesite?: string | null;
    widget_language?: string | null;
    widget_phrases_json?: string | null;
    pre_chat_message?: string | null;
    pre_chat_name_label?: string | null;
    pre_chat_email_label?: string | null;
    pre_chat_name_required?: boolean;
    pre_chat_email_required?: boolean;
};

type BootstrapRes = {
    visitor_token: string;
    visitor_id: string;
    tenant_id: string;
    site_id: string;
    widget_config: WidgetConfig;
};

type CreateOrRecoverRes = {
    conversation_id: string;
    recovered: boolean;
};

type PublicConversationDetail = {
    id: string;
    status: string;
    channel: string;
    subject?: string | null;
    assigned_agent_user_id?: string | null;
    created_at: number;
    last_msg_at: number;
};

type MessageItem = {
    id: string;
    sender_type: string;
    sender_id: string;
    content_type: string;
    content: {
        text?: string;
        attachment_id?: string;
        filename?: string;
        size_bytes?: number;
        mime?: string;
    };
    created_at: number;
};

type MessagePage = {
    messages: MessageItem[];
    has_more: boolean;
    next_after_msg_id?: string | null;
    reset?: boolean;
};

type PresignUploadResponse = {
    attachment_id: string;
    upload_url: string;
    expires_in_seconds?: number;
    max_upload_bytes?: number;
};

type PresignDownloadResponse = {
    attachment_id: string;
    download_url: string;
    expires_in_seconds?: number;
};

const VISITOR_ID_PREFIX = "chatlive.visitor_id.";
const VISITOR_ID_COOKIE_PREFIX = "chatlive_vid_";
const VISITOR_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // ~400 days

const VISITOR_IDENTITY_PREFIX = "chatlive.visitor_identity.";
const VISITOR_LAST_READ_PREFIX = "chatlive.visitor_last_read.";
const VISITOR_CONVERSATION_PREFIX = "chatlive.visitor_conversation.";

type StoredIdentity = {
    name?: string | null;
    email?: string | null;
    updated_at?: number;
};

type StoredLastRead = {
    id: string;
    at: number;
};

const PM_CHANNEL = "chatlive.widget";
const PM_VERSION = 1;

const MSG = {
    HOST_INIT: "HOST_INIT",
    HOST_SET_OPEN: "HOST_SET_OPEN",
    HOST_SET_THEME: "HOST_SET_THEME",
    HOST_VISIBILITY: "HOST_VISIBILITY",
    HOST_PAGEVIEW: "HOST_PAGEVIEW",

    WIDGET_READY: "WIDGET_READY",
    WIDGET_HEIGHT: "WIDGET_HEIGHT",
    WIDGET_UNREAD: "WIDGET_UNREAD",
    WIDGET_THEME: "WIDGET_THEME",
    WIDGET_REQUEST_OPEN: "WIDGET_REQUEST_OPEN",
    WIDGET_REQUEST_CLOSE: "WIDGET_REQUEST_CLOSE",
} as const;

type HostPageViewPayload = {
    url?: string;
    title?: string;
    referrer?: string;
};

function safeOriginFromUrl(url: string): string {
    try {
        return new URL(url).origin;
    } catch {
        return "";
    }
}

type PmEnvelope = {
    channel: typeof PM_CHANNEL;
    version: typeof PM_VERSION;
    type: string;
    payload?: unknown;
    ts?: number;
};

function isPmEnvelope(data: unknown): data is PmEnvelope {
    const r = asRecord(data);
    if (!r) return false;
    if (r.channel !== PM_CHANNEL) return false;
    if (r.version !== PM_VERSION) return false;
    if (typeof r.type !== "string") return false;
    return true;
}

function getWsUrl(path: string) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}${path}`;
}

async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const resp = await fetch(input, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
    });

    const json: unknown = await resp.json();
    const r = asRecord(json);
    if (!r || typeof r.ok !== "boolean") {
        throw new Error("invalid_response");
    }
    if (!r.ok) {
        throw new Error(typeof r.error === "string" ? r.error : "request_failed");
    }
    return r.data as T;
}

function extractBootstrapOrigin(): string {
    const q = new URLSearchParams(location.search);
    const explicit = q.get("origin");
    if (explicit) return explicit;

    // When embedded as iframe, referrer is the parent page URL.
    if (document.referrer) {
        try {
            return new URL(document.referrer).origin;
        } catch {
            // ignore
        }
    }

    // Fallback for direct open in dev.
    return location.origin;
}

function safeLocalStorageGet(key: string): string | undefined {
    try {
        return localStorage.getItem(key) || undefined;
    } catch {
        return undefined;
    }
}

function safeLocalStorageSet(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeLocalStorageRemove(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function sanitizeCookieKeySegment(s: string): string {
    return (s || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function lastReadStorageKey(siteKey: string, conversationId: string): string {
    const sk = sanitizeCookieKeySegment(siteKey || "");
    const ck = sanitizeCookieKeySegment(conversationId || "");
    return `${VISITOR_LAST_READ_PREFIX}${sk}.${ck}`;
}

function conversationStorageKey(siteKey: string): string {
    const sk = sanitizeCookieKeySegment(siteKey || "");
    return `${VISITOR_CONVERSATION_PREFIX}${sk}`;
}

function loadStoredConversationId(siteKey: string): string | null {
    if (!siteKey) return null;
    const raw = safeLocalStorageGet(conversationStorageKey(siteKey));
    const v = (raw || "").trim();
    return v ? v : null;
}

function saveStoredConversationId(siteKey: string, conversationId: string) {
    if (!siteKey) return;
    const id = (conversationId || "").trim();
    if (!id) return;
    safeLocalStorageSet(conversationStorageKey(siteKey), id);
}

function clearStoredConversationId(siteKey: string) {
    if (!siteKey) return;
    safeLocalStorageRemove(conversationStorageKey(siteKey));
}

function loadLastRead(siteKey: string, conversationId: string): StoredLastRead | null {
    const key = lastReadStorageKey(siteKey, conversationId);
    const raw = safeLocalStorageGet(key);
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as StoredLastRead;
        if (!v || typeof v.id !== "string" || !Number.isFinite(Number(v.at))) return null;
        return { id: v.id, at: Number(v.at) };
    } catch {
        return null;
    }
}

function saveLastRead(siteKey: string, conversationId: string, id: string, at: number) {
    if (!siteKey || !conversationId || !id) return;
    if (!Number.isFinite(at)) return;
    const key = lastReadStorageKey(siteKey, conversationId);
    safeLocalStorageSet(key, JSON.stringify({ id, at } satisfies StoredLastRead));
}

function readCookie(name: string): string | undefined {
    try {
        const parts = (document.cookie || "").split(";");
        for (const raw of parts) {
            const p = raw.trim();
            if (!p) continue;
            const eq = p.indexOf("=");
            if (eq <= 0) continue;
            const k = p.slice(0, eq).trim();
            if (k !== name) continue;
            return decodeURIComponent(p.slice(eq + 1));
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function normalizeSameSite(raw: string | null | undefined): "Lax" | "Strict" | "None" {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "none") return "None";
    if (s === "strict") return "Strict";
    return "Lax";
}

function writeCookie(
    name: string,
    value: string,
    opts: { maxAgeSeconds?: number; domain?: string; path?: string; sameSite?: "Lax" | "Strict" | "None"; secure?: boolean },
) {
    try {
        const maxAgeSeconds = opts.maxAgeSeconds ?? VISITOR_ID_COOKIE_MAX_AGE_SECONDS;
        const path = opts.path ?? "/";
        const sameSite = opts.sameSite ?? "Lax";
        const secure = opts.secure ?? location.protocol === "https:";

        let cookie = `${name}=${encodeURIComponent(value)}`;
        cookie += `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
        cookie += `; Path=${path}`;
        if (opts.domain) cookie += `; Domain=${opts.domain}`;
        cookie += `; SameSite=${sameSite}`;
        if (secure || sameSite === "None") cookie += "; Secure";
        document.cookie = cookie;
    } catch {
        // ignore
    }
}

function formatPublicError(
    t: (key: string, options?: Record<string, unknown>) => string,
    code: string,
): { title: string; detail?: string } {
    const c = (code || "").trim();
    if (!c) return { title: t("visitorEmbed.requestFailed") };
    if (c === "missing_site_key") return { title: t("visitorEmbed.missingSiteKey"), detail: t("visitorEmbed.missingSiteKeyDetail") };
    if (c === "identity_required") return { title: t("visitorEmbed.identityRequiredTitle"), detail: t("visitorEmbed.identityRequiredDetail") };
    if (c === "origin_not_allowed") return { title: t("visitorEmbed.originNotAllowedTitle"), detail: t("visitorEmbed.originNotAllowedDetail") };
    if (c === "invalid_response") return { title: t("visitorEmbed.invalidResponseTitle"), detail: t("visitorEmbed.invalidResponseDetail") };
    if (c === "bootstrap_failed") return { title: t("visitorEmbed.bootstrapFailed") };
    if (c === "create_failed") return { title: t("visitorEmbed.createFailed") };
    if (c === "send_failed") return { title: t("visitorEmbed.sendFailed") };
    if (c === "load_failed") return { title: t("visitorEmbed.loadFailed") };
    return { title: c };
}

function isMessageItem(value: unknown): value is MessageItem {
    const r = asRecord(value);
    if (!r) return false;
    if (typeof r.id !== "string" || !r.id) return false;
    if (typeof r.sender_type !== "string") return false;
    if (typeof r.created_at !== "number") return false;
    return true;
}

function clamp(n: number, lo: number, hi: number) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

function safeHexColor(raw: string | null | undefined): string | null {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        const r = s[1];
        const g = s[2];
        const b = s[3];
        return `#${r}${r}${g}${g}${b}${b}`;
    }
    return null;
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const h = safeHexColor(hex);
    if (!h) return null;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return { r, g, b };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
    const toLinear = (v: number) => {
        const s = clamp(v / 255, 0, 1);
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const R = toLinear(rgb.r);
    const G = toLinear(rgb.g);
    const B = toLinear(rgb.b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function textColorForBg(hex: string): string {
    const rgb = parseHexToRgb(hex);
    if (!rgb) return "#111827";
    // Simple heuristic: dark background -> white text.
    const lum = relativeLuminance(rgb);
    return lum < 0.55 ? "#ffffff" : "#111827";
}

function formatTimeShort(epochSeconds: number): string {
    try {
        const d = new Date(epochSeconds * 1000);
        return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

export function VisitorEmbedPage({ siteKey: siteKeyProp }: { siteKey?: string } = {}) {
    const { t, i18n } = useTranslation();
    const q = useMemo(() => new URLSearchParams(location.search), []);
    const siteKey = String(siteKeyProp || q.get("site_key") || "");
    const debugUi = q.get("debug") === "1";
    const isHostPreview = q.get("chatlive_preview") === "1";

    const isTopLevel = typeof window !== "undefined" && window === window.parent;

    const cookieDomain = q.get("cookie_domain") || "";
    const cookieSameSite = normalizeSameSite(q.get("cookie_samesite"));
    const cookieName = useMemo(() => `${VISITOR_ID_COOKIE_PREFIX}${sanitizeCookieKeySegment(siteKey)}`, [siteKey]);

    const allowedParentOrigin = useMemo(() => {
        // Host (parent) should pass its own origin via ?origin=...
        const explicitRaw = q.get("origin") || "";
        const explicit = explicitRaw ? safeOriginFromUrl(explicitRaw) || explicitRaw : "";
        if (explicit) return explicit;
        if (document.referrer) return safeOriginFromUrl(document.referrer);
        return "";
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hostOpenRef = useRef(isTopLevel);
    const unreadRef = useRef(0);
    const lastReadRef = useRef<StoredLastRead | null>(null);
    const pendingPageViewsRef = useRef<HostPageViewPayload[]>([]);
    const hostInitThemeColorRef = useRef<string | null>(null);

    // In some cross-origin iframe contexts, iframe document visibility/focus can be unreliable.
    // Host page (widget.js) can optionally send HOST_VISIBILITY so we can decide read receipts correctly.
    const [hostVisibility, setHostVisibility] = useState<{ visible: boolean; focused: boolean } | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    const [bootstrap, setBootstrap] = useState<BootstrapRes | null>(null);
    const [conversation, setConversation] = useState<CreateOrRecoverRes | null>(null);
    const [detail, setDetail] = useState<PublicConversationDetail | null>(null);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const [preChatCustom, setPreChatCustom] = useState<Record<string, unknown>>({});

    const [identityName, setIdentityName] = useState("");
    const [identityEmail, setIdentityEmail] = useState("");
    const [identityModalOpen, setIdentityModalOpen] = useState(false);
    const [identityError, setIdentityError] = useState<string>("");
    const pendingCloseReasonRef = useRef<string | null>(null);

    const [messages, setMessages] = useState<MessageItem[]>([]);
    const msgIdSetRef = useRef<Record<string, true>>({});

    const [draft, setDraft] = useState("");

    const [peerTyping, setPeerTyping] = useState(false);
    const [peerLastReadMsgId, setPeerLastReadMsgId] = useState<string | null>(null);
    const typingStopTimerRef = useRef<number | null>(null);
    const lastSentReadRef = useRef<string | null>(null);

    const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
    const [uploading, setUploading] = useState(false);

    const wsRef = useRef<WsClient | null>(null);

    const attachmentUrlCacheRef = useRef<Record<string, string>>({});
    const attachmentUrlPendingRef = useRef<Record<string, Promise<string | null>>>({});

    const createOrRecoverInFlightRef = useRef<Promise<CreateOrRecoverRes | null> | null>(null);

    function normalizePageViewPayload(payload: unknown): HostPageViewPayload | null {
        const rec = asRecord(payload);
        if (!rec) return null;
        const url = typeof rec.url === "string" ? rec.url.trim() : "";
        const title = typeof rec.title === "string" ? rec.title.trim() : "";
        const referrer = typeof rec.referrer === "string" ? rec.referrer.trim() : "";
        if (!url) return null;
        return { url, title: title || undefined, referrer: referrer || undefined };
    }

    function enqueuePageView(pv: HostPageViewPayload) {
        const url = String(pv?.url || "").trim();
        if (!url) return;

        const next: HostPageViewPayload[] = [...(pendingPageViewsRef.current || [])];
        const last = next.length ? next[next.length - 1] : null;
        if (last && String(last.url || "").trim() === url) return;
        next.push({ url, title: pv.title, referrer: pv.referrer });

        // Clamp queue size (best-effort).
        pendingPageViewsRef.current = next.slice(-30);
    }

    // Flush queued pageviews once conversation exists.
    useEffect(() => {
        const token = bootstrap?.visitor_token || "";
        const convId = conversation?.conversation_id || "";
        if (!token || !convId) return;

        const pending = pendingPageViewsRef.current || [];
        if (!pending.length) return;

        const snapshot = pending.slice(0);
        pendingPageViewsRef.current = [];

        (async () => {
            for (const p of snapshot) {
                const url = String(p?.url || "").trim();
                if (!url) continue;
                const title = typeof p.title === "string" ? p.title.trim() : "";
                const referrer = typeof p.referrer === "string" ? p.referrer.trim() : "";
                try {
                    await apiFetch<unknown>(`/api/v1/public/conversations/${encodeURIComponent(convId)}/events/page_view`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ url, title: title || undefined, referrer: referrer || undefined }),
                    });
                } catch {
                    // best-effort
                }
            }
        })();
    }, [bootstrap?.visitor_token, conversation?.conversation_id]);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const [visualHeightPx, setVisualHeightPx] = useState<number | null>(null);
    const [hostOpen, setHostOpen] = useState(isTopLevel);
    const [themeColor, setThemeColor] = useState<string | null>(null);
    const [hostThemeMode, setHostThemeMode] = useState<string | null>(null);
    const [hostColorSettingsMode, setHostColorSettingsMode] = useState<string | null>(null);
    const [hostColorOverridesJson, setHostColorOverridesJson] = useState<string | null>(null);
    const [unread, setUnread] = useState(0);

    const preChatEnabled = Boolean(bootstrap?.widget_config?.pre_chat_enabled);
    const legacyPreChatMessage = (bootstrap?.widget_config?.pre_chat_message || "").trim();
    const legacyPreChatNameLabel = (bootstrap?.widget_config?.pre_chat_name_label || "").trim();
    const legacyPreChatEmailLabel = (bootstrap?.widget_config?.pre_chat_email_label || "").trim();
    const legacyPreChatNameRequired = Boolean(bootstrap?.widget_config?.pre_chat_name_required);
    const legacyPreChatEmailRequired = Boolean(bootstrap?.widget_config?.pre_chat_email_required);

    const preChatFields = useMemo(() => {
        const json = String(bootstrap?.widget_config?.pre_chat_fields_json || "").trim();
        const parsed = safeJsonParse<unknown>(json);
        if (Array.isArray(parsed)) {
            return normalizePreChatFields(parsed as PreChatField[]);
        }
        // legacy fallback
        const list: PreChatField[] = [];
        if (legacyPreChatMessage) {
            list.push({ id: "info_1", type: "info", text: legacyPreChatMessage });
        }
        list.push({ id: "name", type: "name", label: legacyPreChatNameLabel || null, required: legacyPreChatNameRequired });
        list.push({ id: "email", type: "email", label: legacyPreChatEmailLabel || null, required: legacyPreChatEmailRequired });
        return list;
    }, [bootstrap?.widget_config?.pre_chat_fields_json, legacyPreChatEmailLabel, legacyPreChatEmailRequired, legacyPreChatMessage, legacyPreChatNameLabel, legacyPreChatNameRequired]);

    const preChatInfoText = useMemo(() => {
        const info = preChatFields.find((f) => f.type === "info" && String(f.text || "").trim());
        return String(info?.text || "").trim() || "";
    }, [preChatFields]);

    const effectiveThemeMode = useMemo(() => {
        const raw = String(hostThemeMode || bootstrap?.widget_config?.theme_mode || "light").trim().toLowerCase();
        return raw === "dark" ? "dark" : "light";
    }, [bootstrap?.widget_config?.theme_mode, hostThemeMode]);

    const effectiveColorSettingsMode = useMemo(() => {
        const raw = String(hostColorSettingsMode || bootstrap?.widget_config?.color_settings_mode || "theme").trim().toLowerCase();
        return raw === "advanced" ? "advanced" : "theme";
    }, [bootstrap?.widget_config?.color_settings_mode, hostColorSettingsMode]);

    const effectiveColorOverridesJson = useMemo(() => {
        if (effectiveColorSettingsMode !== "advanced") return "";
        return String(hostColorOverridesJson || bootstrap?.widget_config?.color_overrides_json || "").trim();
    }, [bootstrap?.widget_config?.color_overrides_json, effectiveColorSettingsMode, hostColorOverridesJson]);

    const colorOverrides = useMemo(() => {
        if (!effectiveColorOverridesJson) return {} as Record<string, string>;
        try {
            const v = JSON.parse(effectiveColorOverridesJson) as unknown;
            if (!v || typeof v !== "object" || Array.isArray(v)) return {};
            const out: Record<string, string> = {};
            for (const [k, rawVal] of Object.entries(v as Record<string, unknown>)) {
                const key = String(k || "").trim();
                if (!key) continue;
                const val = safeHexColor(typeof rawVal === "string" ? rawVal : String(rawVal ?? ""));
                if (!val) continue;
                out[key] = val;
            }
            return out;
        } catch {
            return {};
        }
    }, [effectiveColorOverridesJson]);

    const uiPrimary =
        safeHexColor(colorOverrides.primary) || safeHexColor(themeColor) || safeHexColor(bootstrap?.widget_config?.theme_color) || "#fbbf24";

    const uiPanelBg = effectiveThemeMode === "dark" ? "#111827" : "#ffffff";
    const uiBorder = effectiveThemeMode === "dark" ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)";
    const uiTextMain = effectiveThemeMode === "dark" ? "#e5e7eb" : "#0f172a";
    const uiTextMuted = effectiveThemeMode === "dark" ? "rgba(229,231,235,.65)" : "rgba(15,23,42,.65)";
    const uiChatBg =
        safeHexColor(colorOverrides.chat_bg) || (effectiveThemeMode === "dark" ? "#0b1220" : "#f8fafc");

    const uiCustomerBubble = safeHexColor(colorOverrides.customer_bubble) || uiPrimary;
    const uiCustomerText = safeHexColor(colorOverrides.customer_text) || textColorForBg(uiCustomerBubble);
    const uiAgentBubble =
        safeHexColor(colorOverrides.agent_bubble) || (effectiveThemeMode === "dark" ? "rgba(255,255,255,.06)" : "#ffffff");
    const uiAgentText = safeHexColor(colorOverrides.agent_text) || uiTextMain;
    const uiSystemText = safeHexColor(colorOverrides.system) || uiTextMuted;

    // If pre-chat is enabled, require a conversation (created after form submit) before sending.
    const composerEnabled = Boolean(bootstrap?.visitor_token) && (!preChatEnabled || Boolean(conversation?.conversation_id)) && !uploading;
    const canSend = composerEnabled && !!draft.trim();

    const emojiList = useMemo(
        () => ["😀", "😁", "😂", "🙂", "😉", "😍", "🥳", "👍", "🙏", "🎉", "❤️", "😅", "🤔", "😭"],
        [],
    );

    const [preChatError, setPreChatError] = useState<string>("");

    const textAreaRef = useRef<TextAreaRef | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const [attachOpen, setAttachOpen] = useState(false);
    const [isMobileUi, setIsMobileUi] = useState(false);

    function formatFileStamp() {
        try {
            const d = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        } catch {
            return String(Date.now());
        }
    }

    async function captureAndSendScreenshot() {
        if (uploading) return;
        if (!bootstrap?.visitor_token) return;
        // Pre-chat mode requires form submit first.
        if (preChatEnabled && !conversation?.conversation_id) return;

        // Prefer real screenshot capture when supported.
        const md = navigator.mediaDevices;
        if (!md || typeof md.getDisplayMedia !== "function") {
            // Fallback: allow user to pick an image.
            imageInputRef.current?.click();
            return;
        }

        setAttachOpen(false);
        setError("");
        try {
            const stream: MediaStream = await md.getDisplayMedia({ video: true, audio: false });

            const video = document.createElement("video");
            video.playsInline = true;
            (video as HTMLVideoElement & { srcObject?: MediaStream }).srcObject = stream;

            await new Promise<void>((resolve, reject) => {
                const t = window.setTimeout(() => reject(new Error("screenshot_timeout")), 8000);
                video.onloadedmetadata = () => {
                    window.clearTimeout(t);
                    resolve();
                };
            });

            await video.play();
            const w = Math.max(1, video.videoWidth || 0);
            const h = Math.max(1, video.videoHeight || 0);

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("screenshot_ctx_failed");
            ctx.drawImage(video, 0, 0, w, h);

            // Stop capture ASAP.
            try {
                for (const tr of stream.getTracks()) tr.stop();
            } catch {
                // ignore
            }

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (b) => {
                        if (!b) return reject(new Error("screenshot_blob_failed"));
                        resolve(b);
                    },
                    "image/png",
                    0.92,
                );
            });

            const file = new File([blob], `screenshot-${formatFileStamp()}.png`, { type: "image/png" });
            await sendFile(file);
        } catch (e: unknown) {
            // Common case: user cancels screen share picker.
            const { name, message } = getErrorFields(e);
            const msg = String(name || message || "screenshot_failed");
            // Debug UI removed; keep a lightweight console signal.
            console.warn("[visitor] screenshot failed", msg);

            // If blocked by Permissions-Policy / iframe restrictions, fall back to image picker
            // so the button still "does something".
            try {
                const { name: n0, message: m0 } = getErrorFields(e);
                const m = String(m0 || "").toLowerCase();
                const n = String(n0 || "").toLowerCase();
                const blocked =
                    m.includes("permissions policy") ||
                    m.includes("display-capture") ||
                    n.includes("notallowed") ||
                    n.includes("securityerror");
                if (blocked) imageInputRef.current?.click();
            } catch {
                // ignore
            }
        }
    }

    // Mobile heuristic for UI behaviors (matches widget's default breakpoint strategy).
    useEffect(() => {
        const compute = () => {
            try {
                // IMPORTANT: this page runs inside a fixed-width iframe on desktop.
                // Using `window.innerWidth` would incorrectly classify desktop as "mobile".
                const ua = String(navigator.userAgent || "");
                const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(ua);

                const uaDataMobile = Boolean((navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile);
                const coarse =
                    typeof window.matchMedia === "function" &&
                    (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches);

                setIsMobileUi(Boolean(uaDataMobile || uaMobile || coarse));
            } catch {
                setIsMobileUi(false);
            }
        };

        compute();
        window.addEventListener("resize", compute);
        return () => window.removeEventListener("resize", compute);
    }, []);

    function insertEmoji(emoji: string) {
        try {
            const inst = textAreaRef.current;
            const instRec = asRecord(inst);
            const resizableRec = instRec ? asRecord(instRec.resizableTextArea) : null;
            const el = resizableRec?.textArea instanceof HTMLTextAreaElement ? resizableRec.textArea : null;
            if (!el) {
                setDraft((prev) => prev + emoji);
                return;
            }

            const start = Number(el.selectionStart);
            const end = Number(el.selectionEnd);
            if (!Number.isFinite(start) || !Number.isFinite(end)) {
                setDraft((prev) => prev + emoji);
                return;
            }

            const next = draft.slice(0, start) + emoji + draft.slice(end);
            setDraft(next);
            window.setTimeout(() => {
                try {
                    el.focus();
                    const pos = start + emoji.length;
                    el.setSelectionRange(pos, pos);
                } catch {
                    // ignore
                }
            }, 0);
        } catch {
            setDraft((prev) => prev + emoji);
        }
    }

    const hasIdentity = useMemo(() => {
        const n = identityName.trim();
        const e = identityEmail.trim();
        return !!n || !!e;
    }, [identityEmail, identityName]);

    const lastMsgId = useMemo(() => (messages.length ? messages[messages.length - 1].id : ""), [messages]);

    function maybeSendRead(convId: string) {
        if (!convId) return;
        if (!hostOpenRef.current) return;
        if (wsRef.current?.getStatus() !== "connected") return;

        // Only mark as read when the page is actually visible.
        // NOTE: In some browsers/iframe contexts, `document.visibilityState` may be overly strict.
        // We accept either "visible" OR a focused document as sufficient.
        try {
            if (hostVisibility) {
                if (!hostVisibility.visible && !hostVisibility.focused) return;
            } else {
                const vs = typeof document !== "undefined" ? (document as Document).visibilityState : undefined;
                const isVisible = !vs || vs === "visible";
                const isFocused = typeof document !== "undefined" && typeof document.hasFocus === "function" ? document.hasFocus() : true;
                if (!isVisible && !isFocused) {
                    return;
                }
            }
        } catch {
            // ignore
        }

        // Visitor marks read up to the latest agent message.
        let lastAgentId: string | null = null;
        let lastAgentAt = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m?.sender_type === "agent" && m.id) {
                lastAgentId = m.id;
                lastAgentAt = Number(m.created_at || 0);
                break;
            }
        }
        if (!lastAgentId) return;
        if (lastSentReadRef.current === lastAgentId) return;
        lastSentReadRef.current = lastAgentId;
        wsRef.current?.sendRead(convId, lastAgentId);
        if (lastAgentAt > 0) {
            const stored = { id: lastAgentId, at: lastAgentAt } as StoredLastRead;
            lastReadRef.current = stored;
            saveLastRead(siteKey, convId, stored.id, stored.at);
        }
    }

    function postToHost(type: string, payload?: unknown) {
        if (window === window.parent) return;
        const targetOrigin = allowedParentOrigin || "*";
        try {
            window.parent.postMessage(
                {
                    channel: PM_CHANNEL,
                    version: PM_VERSION,
                    type,
                    payload: payload || null,
                    ts: Date.now(),
                },
                targetOrigin,
            );
        } catch {
            // ignore
        }
    }

    function addMessages(list: MessageItem[], source: "live" | "history" = "live") {
        if (!list?.length) return;

        // NOTE: this function is called from WS callbacks created once. Do NOT depend on
        // closed-over `messages` state, otherwise a stale closure will overwrite history.
        const idSet = msgIdSetRef.current;
        const fresh: MessageItem[] = [];
        let newAgentCount = 0;
        const lastReadAt = Number(lastReadRef.current?.at || 0) || 0;

        for (const m of list) {
            if (!m?.id) continue;
            if (idSet[m.id]) continue;
            idSet[m.id] = true;
            fresh.push(m);
            if (m.sender_type === "agent") {
                if (source === "history") {
                    if (!lastReadAt || Number(m.created_at || 0) <= lastReadAt) continue;
                }
                newAgentCount += 1;
            }
        }
        if (!fresh.length) return;

        setMessages((prev) => {
            const merged = [...prev, ...fresh];
            merged.sort((a, b) => (a.created_at - b.created_at) || (a.id > b.id ? 1 : -1));
            return merged;
        });

        // Unread strategy (simple & predictable): only count agent messages while host panel is closed.
        if (newAgentCount > 0 && !hostOpenRef.current) {
            setUnread((prev) => {
                const next = prev + newAgentCount;
                unreadRef.current = next;
                postToHost(MSG.WIDGET_UNREAD, { unread: next });
                return next;
            });
        }
    }

    // Setup minimal page CSS to make height measurements stable in iframe.
    useEffect(() => {
        try {
            document.documentElement.style.height = "100%";
            document.documentElement.style.overflow = "hidden";
            document.documentElement.style.background = "transparent";
            document.body.style.margin = "0";
            document.body.style.padding = "0";
            document.body.style.height = "100%";
            document.body.style.overflow = "hidden";
            document.body.style.background = "transparent";
        } catch {
            // ignore
        }
    }, []);

    // Mobile viewport quirks (keyboard / address bar / pinch-zoom): keep the root container aligned
    // to the visual viewport to reduce hit-testing offsets inside iframes.
    useEffect(() => {
        if (window === window.parent) return;
        const vv = window.visualViewport;
        if (!vv) return;

        let raf = 0;

        const apply = () => {
            try {
                if (raf) window.cancelAnimationFrame(raf);
                raf = window.requestAnimationFrame(() => {
                    const s = Number(vv.scale);
                    const dpr = Number(window.devicePixelRatio);
                    const zoomed = (Number.isFinite(s) && Math.abs(s - 1) > 0.01) || (Number.isFinite(dpr) && Math.abs(dpr - Math.round(dpr)) > 0.01);
                    if (zoomed) {
                        // DevTools device emulation zoom: avoid forcing heights from visualViewport.
                        setVisualHeightPx(null);
                        document.documentElement.style.height = "100%";
                        document.body.style.height = "100%";
                        return;
                    }

                    const h = Math.max(1, Number(vv.height) || 0);
                    setVisualHeightPx(h);
                    document.documentElement.style.height = `${h}px`;
                    document.body.style.height = `${h}px`;
                });
            } catch {
                // ignore
            }
        };

        apply();
        vv.addEventListener("resize", apply);
        vv.addEventListener("scroll", apply);
        window.addEventListener("orientationchange", apply);

        return () => {
            try {
                vv.removeEventListener("resize", apply);
                vv.removeEventListener("scroll", apply);
                window.removeEventListener("orientationchange", apply);
                if (raf) window.cancelAnimationFrame(raf);
            } catch {
                // ignore
            }
        };
    }, []);

    // Load stored identity (best-effort).
    useEffect(() => {
        if (!siteKey) return;
        const raw = safeLocalStorageGet(VISITOR_IDENTITY_PREFIX + siteKey);
        if (!raw) return;
        try {
            const v = JSON.parse(raw) as StoredIdentity;
            if (typeof v?.name === "string") setIdentityName(v.name);
            if (typeof v?.email === "string") setIdentityEmail(v.email);
        } catch {
            // ignore
        }
    }, [siteKey]);

    // postMessage bridge: listen host commands.
    useEffect(() => {
        function onMessage(ev: MessageEvent) {
            if (window === window.parent) return;
            if (allowedParentOrigin && ev.origin !== allowedParentOrigin) return;
            if (ev.source !== window.parent) return;

            const data: unknown = ev.data;
            if (!isPmEnvelope(data)) return;

            const payload = data.payload ?? null;
            const payloadRec = asRecord(payload);

            if (data.type === MSG.HOST_INIT) {
                const open = Boolean(payloadRec?.open);
                hostOpenRef.current = open;
                setHostOpen(open);
                const themeColor = typeof payloadRec?.themeColor === "string" ? payloadRec.themeColor : null;
                hostInitThemeColorRef.current = themeColor || null;
                if (themeColor) setThemeColor(themeColor);

                if (typeof payloadRec?.themeMode === "string") setHostThemeMode(payloadRec.themeMode);
                if (typeof payloadRec?.colorSettingsMode === "string") setHostColorSettingsMode(payloadRec.colorSettingsMode);
                if (typeof payloadRec?.colorOverridesJson === "string") setHostColorOverridesJson(payloadRec.colorOverridesJson);

                const pv = normalizePageViewPayload(payloadRec?.page);
                if (pv) enqueuePageView(pv);
                return;
            }

            if (data.type === MSG.HOST_PAGEVIEW) {
                const pv = normalizePageViewPayload(payload);
                if (pv) enqueuePageView(pv);
                return;
            }

            if (data.type === MSG.HOST_SET_OPEN) {
                const open = Boolean(payloadRec?.open);
                hostOpenRef.current = open;
                setHostOpen(open);

                if (open) {
                    // Reset unread on open.
                    setUnread(0);
                    unreadRef.current = 0;
                    postToHost(MSG.WIDGET_UNREAD, { unread: 0 });
                }
                return;
            }

            if (data.type === MSG.HOST_SET_THEME) {
                const themeColor = typeof payloadRec?.themeColor === "string" ? payloadRec.themeColor : null;
                if (themeColor) {
                    setThemeColor(themeColor);
                } else if (payloadRec?.themeColor === null) {
                    setThemeColor(null);
                }
                return;
            }

            if (data.type === MSG.HOST_VISIBILITY) {
                const visible = payloadRec?.visible === false ? false : true;
                const focused = payloadRec?.focused === false ? false : true;
                setHostVisibility({ visible, focused });
                return;
            }
        }

        window.addEventListener("message", onMessage);

        // Announce readiness.
        postToHost(MSG.WIDGET_READY, {
            capabilities: {
                height: true,
                unread: true,
                theme: true,
                requestOpenClose: true,
            },
        });

        return () => {
            window.removeEventListener("message", onMessage);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Dynamic height reporting.
    useEffect(() => {
        if (window === window.parent) return;
        const el = containerRef.current;
        if (!el) return;

        let raf = 0;
        const report = () => {
            if (raf) window.cancelAnimationFrame(raf);
            raf = window.requestAnimationFrame(() => {
                const rect = el.getBoundingClientRect();
                const next = Math.ceil(rect.height);
                // Add a tiny buffer to avoid sub-pixel scrollbars.
                postToHost(MSG.WIDGET_HEIGHT, { height: next + 2 });
            });
        };

        report();
        const ro = new ResizeObserver(() => report());
        ro.observe(el);
        window.addEventListener("resize", report);

        return () => {
            try {
                ro.disconnect();
            } catch {
                // ignore
            }
            window.removeEventListener("resize", report);
            if (raf) window.cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function doBootstrap() {
        if (!siteKey) {
            setError("missing_site_key");
            return;
        }

        setLoading(true);
        setError("");
        try {
            const origin = extractBootstrapOrigin();
            const storedVisitorId = readCookie(cookieName) || safeLocalStorageGet(VISITOR_ID_PREFIX + siteKey) || undefined;

            const data = await apiFetch<BootstrapRes>(`/api/v1/public/widget/bootstrap?site_key=${encodeURIComponent(siteKey)}`, {
                method: "POST",
                body: JSON.stringify({ site_key: siteKey, origin, visitor_id: storedVisitorId }),
            });

            // Apply per-site phrases to the embed i18n instance (so they affect all t("visitorEmbed.*") calls).
            const nextLang = normalizeWidgetLanguage(data?.widget_config?.widget_language);
            const phrases = parseWidgetPhrases(data?.widget_config?.widget_phrases_json || null);
            applyWidgetPhrasesToEmbedI18n(i18n, nextLang, phrases);

            safeLocalStorageSet(VISITOR_ID_PREFIX + siteKey, data.visitor_id);
            writeCookie(cookieName, data.visitor_id, {
                domain: cookieDomain || undefined,
                sameSite: cookieSameSite,
                secure: location.protocol === "https:" || cookieSameSite === "None",
            });
            setBootstrap(data);

            // Apply per-site widget language without leaking into the agent/admin app.
            if (i18n.language !== nextLang) {
                void i18n.changeLanguage(nextLang);
            }

            // If the visitor previously chatted, restore the conversation id from storage so we can
            // show history immediately on refresh, without calling createOrRecover().
            const storedConvId = loadStoredConversationId(siteKey);
            if (storedConvId) {
                setConversation((prev) => (prev?.conversation_id ? prev : { conversation_id: storedConvId, recovered: true }));
            }

            const cfgTheme = data?.widget_config?.theme_color || null;
            const cfgLauncherStyle = String((data as unknown as { widget_config?: { launcher_style?: unknown } })?.widget_config?.launcher_style || "").trim();
            const cfgPosition = String((data as unknown as { widget_config?: { position?: unknown } })?.widget_config?.position || "").trim();
            const cfgZIndexRaw = (data as unknown as { widget_config?: { z_index?: unknown } })?.widget_config?.z_index;
            const cfgOffsetXRaw = (data as unknown as { widget_config?: { offset_x?: unknown } })?.widget_config?.offset_x;
            const cfgOffsetYRaw = (data as unknown as { widget_config?: { offset_y?: unknown } })?.widget_config?.offset_y;

            const cfgZIndex = typeof cfgZIndexRaw === "number" ? cfgZIndexRaw : Number.isFinite(Number(cfgZIndexRaw)) ? Number(cfgZIndexRaw) : null;
            const cfgOffsetX = typeof cfgOffsetXRaw === "number" ? cfgOffsetXRaw : Number.isFinite(Number(cfgOffsetXRaw)) ? Number(cfgOffsetXRaw) : null;
            const cfgOffsetY = typeof cfgOffsetYRaw === "number" ? cfgOffsetYRaw : Number.isFinite(Number(cfgOffsetYRaw)) ? Number(cfgOffsetYRaw) : null;

            // In preview mode, prefer host-provided (unsaved) visuals.
            if (typeof cfgTheme === "string" && cfgTheme && (!isHostPreview || !hostInitThemeColorRef.current)) {
                setThemeColor(cfgTheme);
            }

            if (!isHostPreview) {
                // Sync host launcher UI with server-side widget config.
                // This allows changing launcher_style (bubble/bar) from admin without re-pasting the snippet.
                postToHost(MSG.WIDGET_THEME, {
                    themeColor: typeof cfgTheme === "string" && cfgTheme ? cfgTheme : null,
                    launcherStyle: cfgLauncherStyle || null,
                    position: cfgPosition || null,
                    zIndex: cfgZIndex,
                    offsetX: cfgOffsetX,
                    offsetY: cfgOffsetY,
                });
            }
        } catch (e: unknown) {
            setError(getErrorFields(e).message || "bootstrap_failed");
        } finally {
            setLoading(false);
        }
    }

    const headerTitle = t("visitorEmbed.headerTitle");
    const composerPlaceholder = t("visitorEmbed.composer.placeholder");

    // Persist conversation id so refresh can restore history without creating.
    useEffect(() => {
        if (!siteKey) return;
        const convId = conversation?.conversation_id;
        if (convId) saveStoredConversationId(siteKey, convId);
    }, [siteKey, conversation?.conversation_id]);

    async function createOrRecover(override?: { name?: string; email?: string }): Promise<CreateOrRecoverRes | null> {
        if (!bootstrap) return null;
        if (createOrRecoverInFlightRef.current) return createOrRecoverInFlightRef.current;

        const p = (async () => {
            setLoading(true);
            setError("");
            try {
                const reqName = (override?.name ?? (preChatEnabled ? name : identityName)).trim();
                const reqEmail = (override?.email ?? (preChatEnabled ? email : identityEmail)).trim();

                const pre_chat_fields = preChatEnabled ? preChatCustom : {};

                const res = await apiFetch<CreateOrRecoverRes>("/api/v1/public/conversations", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${bootstrap.visitor_token}` },
                    body: JSON.stringify({
                        channel: "web",
                        subject: "",
                        name: reqName || undefined,
                        email: reqEmail || undefined,
                        pre_chat_fields,
                    }),
                });
                setConversation(res);
                return res;
            } catch (e: unknown) {
                setError(getErrorFields(e).message || "create_failed");
                return null;
            } finally {
                setLoading(false);
            }
        })();

        createOrRecoverInFlightRef.current = p;
        try {
            return await p;
        } finally {
            createOrRecoverInFlightRef.current = null;
        }
    }

    function persistIdentity(next: { name?: string; email?: string }) {
        if (!siteKey) return;
        const payload: StoredIdentity = {
            name: next.name?.trim() || null,
            email: next.email?.trim() || null,
            updated_at: Math.floor(Date.now() / 1000),
        };
        if (!payload.name && !payload.email) {
            safeLocalStorageRemove(VISITOR_IDENTITY_PREFIX + siteKey);
            return;
        }
        safeLocalStorageSet(VISITOR_IDENTITY_PREFIX + siteKey, JSON.stringify(payload));
    }

    function shouldAskIdentityOnClose(): boolean {
        if (preChatEnabled) return false;
        if (hasIdentity) return false;
        // Avoid being annoying: only ask after user had any activity.
        if (messages.length > 0) return true;
        if (draft.trim()) return true;
        if (detail?.status) return true;
        return false;
    }

    async function confirmIdentityAndClose() {
        setIdentityError("");
        const n = identityName.trim();
        const e = identityEmail.trim();
        if (!n && !e) {
            setIdentityError(t("visitorEmbed.identityError"));
            return;
        }

        persistIdentity({ name: n, email: e });

        // Best-effort: also persist to backend by calling create/recover with identity.
        await createOrRecover({ name: n, email: e });

        const reason = pendingCloseReasonRef.current || "minimize";
        pendingCloseReasonRef.current = null;
        setIdentityModalOpen(false);
        postToHost(MSG.WIDGET_REQUEST_CLOSE, { reason, identity: { name: n || undefined, email: e || undefined } });
    }

    function skipIdentityAndClose() {
        const reason = pendingCloseReasonRef.current || "minimize";
        pendingCloseReasonRef.current = null;
        setIdentityModalOpen(false);
        setIdentityError("");
        postToHost(MSG.WIDGET_REQUEST_CLOSE, { reason, identity: null });
    }

    async function loadDetailAndHistory(conversationId: string) {
        if (!bootstrap) return;
        const token = bootstrap.visitor_token;

        const d = await apiFetch<PublicConversationDetail>(`/api/v1/public/conversations/${encodeURIComponent(conversationId)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });
        setDetail(d);

        const page = await apiFetch<MessagePage>(
            `/api/v1/public/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
            {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            },
        );

        msgIdSetRef.current = {};
        setMessages([]);
        for (const m of page.messages || []) {
            if (m?.id) msgIdSetRef.current[m.id] = true;
        }
        const history = page.messages || [];
        setMessages(history);

        // Initialize last-read from storage and compute unread based on history.
        const stored = loadLastRead(siteKey, conversationId);
        lastReadRef.current = stored;

        let nextUnread = 0;
        if (!hostOpenRef.current && stored?.at) {
            for (const m of history) {
                if (m?.sender_type !== "agent") continue;
                if (Number(m.created_at || 0) > Number(stored.at)) nextUnread += 1;
            }
        }

        if (hostOpenRef.current && history.length) {
            let lastAgent: MessageItem | null = null;
            for (let i = history.length - 1; i >= 0; i--) {
                const m = history[i];
                if (m?.sender_type === "agent" && m.id) {
                    lastAgent = m;
                    break;
                }
            }
            if (lastAgent) {
                const at = Number(lastAgent.created_at || 0);
                if (at > 0) {
                    lastReadRef.current = { id: lastAgent.id, at };
                    saveLastRead(siteKey, conversationId, lastAgent.id, at);
                }
            }
        }

        setUnread(nextUnread);
        unreadRef.current = nextUnread;
        postToHost(MSG.WIDGET_UNREAD, { unread: nextUnread });
    }

    const getAttachmentUrl = useCallback(
        async (attachmentId?: string): Promise<string | null> => {
            const id = String(attachmentId || "");
            if (!id) return null;
            if (!bootstrap?.visitor_token) return null;

            const cached = attachmentUrlCacheRef.current[id];
            if (cached) return cached;

            const pending = attachmentUrlPendingRef.current[id];
            const p =
                pending ||
                (attachmentUrlPendingRef.current[id] = apiFetch<PresignDownloadResponse>(
                    `/api/v1/attachments/${encodeURIComponent(id)}/presign-download`,
                    {
                        method: "GET",
                        headers: { Authorization: `Bearer ${bootstrap.visitor_token}` },
                    },
                )
                    .then((res) => {
                        const url = res?.download_url ? String(res.download_url) : "";
                        if (url) attachmentUrlCacheRef.current[id] = url;
                        return url || null;
                    })
                    .catch(() => null)
                    .finally(() => {
                        delete attachmentUrlPendingRef.current[id];
                    }));

            return await p;
        },
        [bootstrap?.visitor_token],
    );

    function InlineImageAttachment(props: { attachmentId?: string; filename?: string; sizeKb?: number | null }) {
        const { attachmentId, filename, sizeKb } = props;
        const [url, setUrl] = useState<string | null>(null);

        useEffect(() => {
            let alive = true;
            void getAttachmentUrl(attachmentId).then((u) => {
                if (!alive) return;
                setUrl(u);
            });
            return () => {
                alive = false;
            };
        }, [attachmentId, getAttachmentUrl]);

        if (!url) {
            return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontWeight: 600 }}>{filename || attachmentId || "image"}</div>
                    {sizeKb !== null ? <div style={{ fontSize: 12, color: "rgba(17,24,39,.65)" }}>{sizeKb} KB</div> : null}
                    <Button type="link" onClick={() => onDownload(attachmentId)} disabled={!attachmentId} style={{ padding: 0, height: "auto" }}>
                        {t("common.download")}
                    </Button>
                </div>
            );
        }

        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <img
                    src={url}
                    alt={filename || "image"}
                    loading="lazy"
                    style={{ display: "block", maxWidth: "min(260px, 65vw)", maxHeight: 320, height: "auto", borderRadius: 10, cursor: "pointer" }}
                    onClick={() => window.open(url, "_blank")}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600 }}>{filename || attachmentId || "image"}</div>
                    {sizeKb !== null ? <div style={{ fontSize: 12, color: "rgba(17,24,39,.65)" }}>{sizeKb} KB</div> : null}
                    <Button type="link" onClick={() => window.open(url, "_blank")} style={{ padding: 0, height: "auto" }}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        );
    }

    function renderMessageContent(m: MessageItem) {
        if (m.content_type === "text") {
            return <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content?.text || ""}</div>;
        }
        if (m.content_type === "file") {
            const name = m.content?.filename || m.content?.attachment_id || "file";
            const sizeKb = typeof m.content?.size_bytes === "number" ? Math.max(1, Math.round((m.content.size_bytes / 1024) * 10) / 10) : null;
            const isImg = isPreviewableImage(m.content?.mime, m.content?.filename);

            if (isImg) {
                return <InlineImageAttachment attachmentId={m.content?.attachment_id} filename={name} sizeKb={sizeKb} />;
            }
            return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    {sizeKb !== null ? <div style={{ fontSize: 12, color: "rgba(17,24,39,.65)" }}>{sizeKb} KB</div> : null}
                    <Button type="link" onClick={() => onDownload(m.content?.attachment_id)} disabled={!m.content?.attachment_id} style={{ padding: 0, height: "auto" }}>
                        {t("common.download")}
                    </Button>
                </div>
            );
        }
        return <div style={{ fontSize: 12, color: "rgba(17,24,39,.6)" }}>{t("visitorEmbed.unsupportedContent", { type: m.content_type })}</div>;
    }

    function isSystemMessage(m: MessageItem): boolean {
        const t = String(m?.sender_type || "").toLowerCase();
        return t === "system";
    }

    function connectWs(conversationId: string) {
        if (!bootstrap) return;
        if (wsRef.current) return;

        const token = bootstrap.visitor_token;
        const url = () => {
            const qs = new URLSearchParams({
                token,
                client: "visitor",
                conversation_id: conversationId,
            });
            return getWsUrl(`/ws/public?${qs.toString()}`);
        };

        const ws = new WsClient({
            url,
            getToken: () => token,
            client: "visitor",
            onStatus: (s) => {
                setWsStatus(s);
                if (s === "connected") {
                    // Best-effort: also SUB+SYNC in case the server doesn't auto-sub.
                    window.setTimeout(() => {
                        ws.subscribe(conversationId);
                        ws.sync(conversationId, lastMsgId || null);
                    }, 80);
                }
            },
            onEvent: (e: WsInboundEvent) => {
                if (!e || typeof e !== "object") return;
                if (e.type === "MSG") {
                    if (isMessageItem(e.msg)) addMessages([e.msg], "live");
                    return;
                }
                if (e.type === "SYNC_RES") {
                    const list = Array.isArray(e.messages) ? e.messages.filter(isMessageItem) : [];
                    if (list.length) addMessages(list, "history");
                    return;
                }

                if (e.type === "TYPING") {
                    const r = asRecord(e);
                    const senderRole = typeof r?.sender_role === "string" ? r.sender_role : "";
                    if (senderRole !== "agent") return;
                    setPeerTyping(Boolean(r?.is_typing));
                    return;
                }

                if (e.type === "READ") {
                    const r = asRecord(e);
                    const senderRole = typeof r?.sender_role === "string" ? r.sender_role : "";
                    if (senderRole !== "agent") return;
                    const lastRead = typeof r?.last_read_msg_id === "string" ? r.last_read_msg_id : "";
                    if (!lastRead) return;
                    setPeerLastReadMsgId(lastRead);
                    return;
                }
            },
        });

        wsRef.current = ws;
        ws.connect();
    }

    async function sendText() {
        const text = draft.trim();
        if (!text) return;
        if (!bootstrap?.visitor_token) return;
        // Pre-chat mode requires form submit first.
        if (preChatEnabled && !conversation?.conversation_id) return;

        // LiveChat-like behavior: create/recover only at first send.
        const convId = conversation?.conversation_id || (await createOrRecover())?.conversation_id || null;
        if (!convId) return;

        // Prefer WS
        if (wsRef.current?.getStatus() === "connected") {
            wsRef.current.sendText(convId, text);
            setDraft("");
            return;
        }

        // HTTP fallback
        try {
            await apiFetch<unknown>(`/api/v1/public/conversations/${encodeURIComponent(convId)}/messages`, {
                method: "POST",
                headers: { Authorization: `Bearer ${bootstrap.visitor_token}` },
                body: JSON.stringify({ text }),
            });
            setDraft("");
            // Pull latest if WS is down
            await loadDetailAndHistory(convId);
        } catch (e: unknown) {
            setError(getErrorFields(e).message || "send_failed");
        }
    }

    async function presignUpload(file: File, convId: string) {
        if (!bootstrap?.visitor_token) throw new Error("missing_token");
        const res = await apiFetch<PresignUploadResponse>("/api/v1/attachments/presign-upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${bootstrap.visitor_token}` },
            body: JSON.stringify({
                conversation_id: convId,
                filename: file.name,
                content_type: file.type || "application/octet-stream",
                size_bytes: file.size,
            }),
        });
        if (!res?.attachment_id || !res?.upload_url) throw new Error("presign_failed");
        return res;
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

    async function sendFile(file: File) {
        if (!file) return;
        if (!bootstrap?.visitor_token) return;
        // Pre-chat mode requires form submit first.
        if (preChatEnabled && !conversation?.conversation_id) return;

        // LiveChat-like behavior: create/recover only at first send.
        const convId = conversation?.conversation_id || (await createOrRecover())?.conversation_id || null;
        if (!convId) return;
        setUploading(true);
        setError("");

        try {
            const presigned = await presignUpload(file, convId);
            await uploadToPresignedUrl(presigned.upload_url, file);

            // Prefer WS (so agent gets real-time MSG broadcast)
            if (wsRef.current?.getStatus() === "connected") {
                wsRef.current.sendFile(convId, presigned.attachment_id);
                return;
            }

            // HTTP fallback: create the file message
            await apiFetch<unknown>(`/api/v1/public/conversations/${encodeURIComponent(convId)}/messages/file`, {
                method: "POST",
                headers: { Authorization: `Bearer ${bootstrap.visitor_token}` },
                body: JSON.stringify({ attachment_id: presigned.attachment_id }),
            });

            await loadDetailAndHistory(convId);
        } catch (e: unknown) {
            setError(getErrorFields(e).message || "send_failed");
        } finally {
            setUploading(false);
        }
    }

    async function onDownload(attachmentId?: string) {
        const url = await getAttachmentUrl(attachmentId);
        if (url) window.open(url, "_blank");
    }

    useEffect(() => {
        doBootstrap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ESC to request close (iframe -> host).
    useEffect(() => {
        if (window === window.parent) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key !== "Escape") return;
            postToHost(MSG.WIDGET_REQUEST_CLOSE, { reason: "escape" });
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const convId = conversation?.conversation_id;
        if (!bootstrap || !convId) return;
        loadDetailAndHistory(convId).catch((e) => {
            const msg = getErrorFields(e).message || "load_failed";
            // Stale storage / visitor mismatch: drop local cached conversation id and reset.
            if (msg === "conversation_not_found" || msg === "forbidden") {
                clearStoredConversationId(siteKey);
                setConversation(null);
                setDetail(null);
                setMessages([]);
                setError("");
                return;
            }
            setError(msg);
        });
        connectWs(convId);
        return () => {
            wsRef.current?.close();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation?.conversation_id]);

    // Emit typing events (debounced).
    useEffect(() => {
        const convId = conversation?.conversation_id;
        if (!convId) return;
        if (wsRef.current?.getStatus() !== "connected") return;

        if (typingStopTimerRef.current) {
            window.clearTimeout(typingStopTimerRef.current);
            typingStopTimerRef.current = null;
        }

        const active = Boolean(draft.trim());
        wsRef.current?.sendTyping(convId, active);

        if (active) {
            typingStopTimerRef.current = window.setTimeout(() => {
                typingStopTimerRef.current = null;
                wsRef.current?.sendTyping(convId, false);
            }, 1200);
        }

        return () => {
            if (typingStopTimerRef.current) {
                window.clearTimeout(typingStopTimerRef.current);
                typingStopTimerRef.current = null;
            }
        };
    }, [draft, conversation?.conversation_id, wsStatus]);

    // Emit read receipts when panel is open and messages update.
    useEffect(() => {
        const convId = conversation?.conversation_id;
        if (!convId) return;
        maybeSendRead(convId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, hostOpen, conversation?.conversation_id, wsStatus, hostVisibility]);

    // If messages arrive while the tab/window is hidden, we intentionally do NOT send read receipts.
    // When the page becomes visible again, re-check and send once.
    useEffect(() => {
        const convId = conversation?.conversation_id;
        if (!convId) return;

        const maybe = () => {
            try {
                const vs = typeof document !== "undefined" ? (document as Document).visibilityState : undefined;
                const isVisible = !vs || vs === "visible";
                const isFocused = typeof document !== "undefined" && typeof document.hasFocus === "function" ? document.hasFocus() : true;
                if (!isVisible && !isFocused) return;
            } catch {
                // ignore
            }
            maybeSendRead(convId);
        };

        const onVis = () => maybe();
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("focus", onVis);

        return () => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("focus", onVis);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation?.conversation_id]);

    // Keep the newest message visible (LiveChat-like behavior).
    useEffect(() => {
        if (!hostOpenRef.current) return;
        const el = messagesEndRef.current;
        if (!el) return;
        try {
            el.scrollIntoView({ block: "end" });
        } catch {
            // ignore
        }
    }, [messages.length, hostOpen]);

    function onComposerKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
        if (e.key !== "Enter") return;
        // Enter to send, Shift+Enter for newline.
        if (e.shiftKey) return;
        e.preventDefault();
        void sendText();
    }

    const isPreChatScreen = preChatEnabled && !conversation?.conversation_id;

    return (
        <ConfigProvider
            theme={
                uiPrimary
                    ? {
                          token: {
                              colorPrimary: uiPrimary,
                          },
                      }
                    : undefined
            }
        >
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    // Use viewport units by default to avoid relying on parent height propagation,
                    // which can be fragile in iframes and cause the content to grow (no scroll).
                    height: visualHeightPx ? `${visualHeightPx}px` : "100vh",
                    margin: 0,
                    padding: 0,
                    boxSizing: "border-box",
                    display: "flex",
                    background: "transparent",
                }}
            >
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        background: uiPanelBg,
                        borderRadius: 18,
                        overflow: "hidden",
                        boxShadow: "0 18px 50px rgba(0,0,0,.16)",
                        border: `1px solid ${uiBorder}`,
                        margin: 0,
                        minHeight: 0,
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            flex: "0 0 auto",
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "12px 10px",
                            background: uiChatBg,
                        }}
                    >
                        <div style={{ position: "absolute", left: 10, display: "flex", alignItems: "center" }}>
                            <Button
                                type="text"
                                size="small"
                                icon={<LeftOutlined />}
                                aria-label={t("visitorEmbed.backAria")}
                                style={{ width: 32, height: 32 }}
                                onClick={() => {
                                    // In embedded mode, this behaves like minimize.
                                    if (window !== window.parent) {
                                        if (shouldAskIdentityOnClose()) {
                                            pendingCloseReasonRef.current = "back";
                                            setIdentityModalOpen(true);
                                        } else {
                                            postToHost(MSG.WIDGET_REQUEST_CLOSE, { reason: "back" });
                                        }
                                    }
                                }}
                            />
                        </div>

                        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                            <div
                                style={{
                                    maxWidth: "92%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "6px 12px",
                                    borderRadius: 999,
                                    background: uiPanelBg,
                                    border: `1px solid ${uiBorder}`,
                                    boxShadow: "0 10px 20px rgba(0,0,0,.08)",
                                }}
                            >
                                <div
                                    aria-hidden
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 10,
                                        background: uiPrimary,
                                        flex: "0 0 auto",
                                    }}
                                />
                                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.1, textAlign: "center" }}>
                                    <div style={{ fontWeight: 800, color: uiTextMain, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {headerTitle}
                                    </div>
                                    {!hostOpen && unread ? (
                                        <div style={{ fontSize: 12, color: uiTextMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            <span style={{ color: "#ef4444", fontWeight: 700 }}>{t("visitorEmbed.unread", { count: unread })}</span>
                                            {peerTyping ? <span style={{ color: "#7c3aed", fontWeight: 600 }}>{t("visitorEmbed.typing")}</span> : null}
                                        </div>
                                    ) : peerTyping ? (
                                        <div style={{ fontSize: 12, color: uiTextMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            <span style={{ color: "#7c3aed", fontWeight: 600 }}>{t("visitorEmbed.typing")}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div style={{ position: "absolute", right: 10, display: "flex", alignItems: "center", gap: 4 }}>
                            {window !== window.parent ? (
                                <Tooltip title={t("visitorEmbed.minimize")}>
                                    <Button
                                        size="small"
                                        type="text"
                                        aria-label={t("visitorEmbed.minimizeAria")}
                                        icon={<MinusOutlined />}
                                        style={{ width: 32, height: 32 }}
                                        onClick={() => {
                                            if (shouldAskIdentityOnClose()) {
                                                pendingCloseReasonRef.current = "minimize";
                                                setIdentityModalOpen(true);
                                            } else {
                                                postToHost(MSG.WIDGET_REQUEST_CLOSE, { reason: "minimize" });
                                            }
                                        }}
                                    />
                                </Tooltip>
                            ) : null}
                        </div>
                    </div>

                    {/* Scrollable content */}
                    <div
                        style={{
                            flex: "1 1 auto",
                            overflowY: "auto",
                            minHeight: 0,
                            WebkitOverflowScrolling: "touch",
                            overscrollBehavior: "contain",
                            background: uiChatBg,
                            padding: "14px 12px",
                            borderBottomLeftRadius: isPreChatScreen ? 18 : undefined,
                            borderBottomRightRadius: isPreChatScreen ? 18 : undefined,
                        }}
                    >
                        {!siteKey ? <div style={{ color: "#ef4444", fontWeight: 700 }}>{t("visitorEmbed.missingSiteKey")}</div> : null}

                        {error ? (
                            <Alert
                                type="error"
                                showIcon
                                message={formatPublicError(t, error).title}
                                description={formatPublicError(t, error).detail}
                                style={{ marginBottom: 8 }}
                                action={
                                    error === "bootstrap_failed" || error === "invalid_response" ? (
                                        <Button size="small" onClick={doBootstrap} loading={loading}>
                                            {t("visitorEmbed.retry")}
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : null}

                        {bootstrap?.widget_config?.welcome_text ? (
                            <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 14px" }}>
                                <div
                                    style={{
                                        maxWidth: "92%",
                                        background: effectiveThemeMode === "dark" ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)",
                                        color: effectiveThemeMode === "dark" ? "rgba(229,231,235,.85)" : "rgba(15,23,42,.7)",
                                        padding: "8px 12px",
                                        borderRadius: 999,
                                        fontSize: 12,
                                        textAlign: "center",
                                    }}
                                >
                                    {bootstrap.widget_config.welcome_text}
                                </div>
                            </div>
                        ) : null}

                        {isPreChatScreen ? (
                            <div style={{ background: uiPanelBg, borderRadius: 14, padding: 12, border: `1px solid ${uiBorder}`, marginBottom: 12 }}>
                                <div style={{ color: uiTextMuted, fontSize: 13, marginBottom: 10 }}>
                                    {preChatInfoText || t("visitorEmbed.preChat.defaultInfo")}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {preChatFields
                                        .filter((f) => f.type !== "info")
                                        .map((f) => {
                                            const label =
                                                String(f.label || "").trim() ||
                                                (f.type === "name" ? t("visitorEmbed.preChat.nameLabel") : f.type === "email" ? t("visitorEmbed.preChat.emailLabel") : f.id);
                                            const required = Boolean(f.required);
                                            const star = required ? " *" : "";

                                            if (f.type === "name") {
                                                return (
                                                    <div key={f.id}>
                                                        <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)", marginBottom: 4 }}>{label + star}</div>
                                                        <Input
                                                            value={name}
                                                            onChange={(e) => {
                                                                setName(e.target.value);
                                                                setPreChatError("");
                                                            }}
                                                            placeholder={t("visitorEmbed.nameOptional")}
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (f.type === "email") {
                                                return (
                                                    <div key={f.id}>
                                                        <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)", marginBottom: 4 }}>{label + star}</div>
                                                        <Input
                                                            value={email}
                                                            onChange={(e) => {
                                                                setEmail(e.target.value);
                                                                setPreChatError("");
                                                            }}
                                                            placeholder={t("visitorEmbed.emailOptional")}
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (f.type === "textarea") {
                                                return (
                                                    <div key={f.id}>
                                                        <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)", marginBottom: 4 }}>{label + star}</div>
                                                        <Input.TextArea
                                                            autoSize={{ minRows: 2, maxRows: 6 }}
                                                            value={String(preChatCustom[f.id] || "")}
                                                            onChange={(e) => {
                                                                setPreChatCustom((prev) => ({ ...prev, [f.id]: e.target.value }));
                                                                setPreChatError("");
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (f.type === "select" || f.type === "multiselect") {
                                                const options = (f.options || []).map((x) => ({ value: x, label: x }));
                                                const multiple = f.type === "multiselect";
                                                const v = preChatCustom[f.id];
                                                const value = multiple ? (Array.isArray(v) ? v.map(String) : []) : typeof v === "string" ? v : undefined;
                                                return (
                                                    <div key={f.id}>
                                                        <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)", marginBottom: 4 }}>{label + star}</div>
                                                        <Select
                                                            style={{ width: "100%" }}
                                                            options={options}
                                                            mode={multiple ? "multiple" : undefined}
                                                            value={value as any}
                                                            onChange={(next) => {
                                                                setPreChatCustom((prev) => ({ ...prev, [f.id]: next }));
                                                                setPreChatError("");
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            }

                                            // default: text
                                            return (
                                                <div key={f.id}>
                                                    <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)", marginBottom: 4 }}>{label + star}</div>
                                                    <Input
                                                        value={String(preChatCustom[f.id] || "")}
                                                        onChange={(e) => {
                                                            setPreChatCustom((prev) => ({ ...prev, [f.id]: e.target.value }));
                                                            setPreChatError("");
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}

                                    {preChatError ? <Alert type="warning" showIcon message={preChatError} /> : null}

                                    <Button
                                        onClick={() => {
                                            const n = name.trim();
                                            const e = email.trim();
                                            const inputs = preChatFields.filter((f) => f.type !== "info");

                                            let hasAnyInput = false;
                                            let hasRequired = false;
                                            let hasAnyValue = false;

                                            for (const f of inputs) {
                                                hasAnyInput = true;
                                                const required = Boolean(f.required);
                                                if (required) hasRequired = true;

                                                let v: unknown;
                                                if (f.type === "name") v = n;
                                                else if (f.type === "email") v = e;
                                                else v = preChatCustom[f.id];

                                                const nonEmpty =
                                                    (typeof v === "string" && v.trim()) ||
                                                    (Array.isArray(v) && v.length) ||
                                                    (v && typeof v === "object" && Object.keys(v as object).length) ||
                                                    (!!v && typeof v !== "string");
                                                if (nonEmpty) hasAnyValue = true;

                                                if (required && !nonEmpty) {
                                                    const label =
                                                        String(f.label || "").trim() ||
                                                        (f.type === "name"
                                                            ? t("visitorEmbed.preChat.nameLabel")
                                                            : f.type === "email"
                                                                ? t("visitorEmbed.preChat.emailLabel")
                                                                : f.id);
                                                    setPreChatError(t("visitorEmbed.preChat.requiredError", { label }));
                                                    return;
                                                }
                                            }

                                            if (hasAnyInput && !hasRequired && !hasAnyValue) {
                                                setPreChatError(t("visitorEmbed.preChat.atLeastOneError"));
                                                return;
                                            }

                                            void createOrRecover();
                                        }}
                                        loading={loading}
                                        type="primary"
                                    >
                                        {t("visitorEmbed.startConversation")}
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        <Modal
                            title={t("visitorEmbed.leaveContactTitle")}
                            open={identityModalOpen}
                            onCancel={skipIdentityAndClose}
                            okText={t("visitorEmbed.leaveContactOk")}
                            cancelText={t("visitorEmbed.leaveContactCancel")}
                            okButtonProps={{ disabled: loading }}
                            cancelButtonProps={{ disabled: loading }}
                            onOk={confirmIdentityAndClose}
                        >
                            <div style={{ color: "rgba(15,23,42,.65)", fontSize: 13, marginBottom: 10 }}>
                                {t("visitorEmbed.leaveContactHint")}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <Input value={identityName} onChange={(e) => setIdentityName(e.target.value)} placeholder={t("visitorEmbed.nameOptional")} />
                                <Input value={identityEmail} onChange={(e) => setIdentityEmail(e.target.value)} placeholder={t("visitorEmbed.emailOptional")} />
                                {identityError ? <Alert type="warning" showIcon message={identityError} /> : null}
                            </div>
                        </Modal>

                        {debugUi && conversation?.conversation_id ? (
                            <div style={{ fontSize: 12, color: "rgba(15,23,42,.55)", marginBottom: 8 }}>
                                {t("visitorEmbed.conversationLabel", { id: conversation.conversation_id })} {conversation.recovered ? t("visitorEmbed.recovered") : t("visitorEmbed.created")}
                            </div>
                        ) : null}

                        {!isPreChatScreen ? (
                            <>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {messages.length === 0 ? (
                                        <div style={{ display: "flex", justifyContent: "center", padding: "18px 0" }}>
                                            <div style={{ fontSize: 13, color: "rgba(15,23,42,.45)" }}>{t("visitorEmbed.noMessages")}</div>
                                        </div>
                                    ) : null}

                                    {messages.map((m) => {
                                        const system = isSystemMessage(m);
                                        const sender = String(m.sender_type || "");
                                        const isCustomer = sender === "customer";
                                        const isAgent = sender === "agent";

                                        if (system) {
                                            return (
                                                <div key={m.id} style={{ display: "flex", justifyContent: "center" }}>
                                                    <div
                                                        style={{
                                                            maxWidth: "92%",
                                                            background: effectiveThemeMode === "dark" ? "rgba(255,255,255,.10)" : "rgba(15,23,42,.08)",
                                                            color: uiSystemText,
                                                            padding: "8px 12px",
                                                            borderRadius: 999,
                                                            fontSize: 12,
                                                            textAlign: "center",
                                                        }}
                                                    >
                                                        {m.content?.text || ""}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const rowStyle: CSSProperties = {
                                            display: "flex",
                                            flexDirection: isCustomer ? "row-reverse" : "row",
                                            alignItems: "flex-end",
                                            gap: 8,
                                        };

                                        const bubbleStyle: CSSProperties = {
                                            maxWidth: "78%",
                                            padding: "10px 12px",
                                            borderRadius: 18,
                                            boxShadow: "0 8px 24px rgba(0,0,0,.06)",
                                            border: isCustomer ? "none" : `1px solid ${uiBorder}`,
                                            background: isCustomer ? uiCustomerBubble : uiAgentBubble,
                                            color: isCustomer ? uiCustomerText : uiAgentText,
                                        };

                                        const avatarStyle: CSSProperties = {
                                            width: 28,
                                            height: 28,
                                            borderRadius: 12,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            background: isAgent ? (effectiveThemeMode === "dark" ? "rgba(255,255,255,.10)" : "#111827") : "transparent",
                                            color: "#fff",
                                            fontSize: 12,
                                            fontWeight: 800,
                                            flex: "0 0 auto",
                                            boxShadow: isAgent ? "0 10px 20px rgba(0,0,0,.12)" : undefined,
                                            visibility: isAgent ? "visible" : "hidden",
                                        };

                                        const metaStyle: CSSProperties = {
                                            fontSize: 11,
                                            color: effectiveThemeMode === "dark" ? "rgba(229,231,235,.45)" : "rgba(15,23,42,.45)",
                                            marginTop: 4,
                                            display: "flex",
                                            justifyContent: isCustomer ? "flex-end" : "flex-start",
                                            gap: 8,
                                            paddingLeft: isCustomer ? 0 : 36,
                                            paddingRight: isCustomer ? 0 : 0,
                                        };

                                        const showRead = peerLastReadMsgId && isCustomer && m.id === peerLastReadMsgId;

                                        return (
                                            <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                                                <div style={rowStyle}>
                                                    <div style={avatarStyle} aria-hidden>
                                                        S
                                                    </div>
                                                    <div style={bubbleStyle}>{renderMessageContent(m)}</div>
                                                </div>
                                                <div style={metaStyle}>
                                                    <span>{formatTimeShort(m.created_at)}</span>
                                                    {showRead ? <span style={{ color: uiTextMuted, fontWeight: 600 }}>Read</span> : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div ref={messagesEndRef} />
                            </>
                        ) : null}

                    </div>

                    {/* Bottom composer (pinned) */}
                    {!isPreChatScreen ? (
                        <div
                            style={{
                                flex: "0 0 auto",
                                padding: "14px 12px",
                                borderTop: `1px solid ${uiBorder}`,
                                background: uiPanelBg,
                                borderBottomLeftRadius: 18,
                                borderBottomRightRadius: 18,
                                paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                            {/* Hidden inputs for attachment actions */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    try {
                                        const f = e.target.files && e.target.files[0];
                                        if (f) await sendFile(f);
                                    } finally {
                                        // Allow selecting same file again.
                                        if (fileInputRef.current) fileInputRef.current.value = "";
                                    }
                                }}
                            />
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    try {
                                        const f = e.target.files && e.target.files[0];
                                        if (f) await sendFile(f);
                                    } finally {
                                        if (imageInputRef.current) imageInputRef.current.value = "";
                                    }
                                }}
                            />

                            {isMobileUi ? (
                                <Tooltip title={t("visitorEmbed.attach.addFile")}>
                                    <Button
                                        type="text"
                                        aria-label={t("visitorEmbed.attach.addFile")}
                                        icon={<PlusOutlined />}
                                        disabled={!composerEnabled}
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 999,
                                            background: effectiveThemeMode === "dark" ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)",
                                            color: uiTextMain,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    />
                                </Tooltip>
                            ) : (
                                <Popover
                                    trigger="click"
                                    placement="topLeft"
                                    open={attachOpen}
                                    onOpenChange={(o) => setAttachOpen(o)}
                                    content={
                                        <div style={{ display: "flex", flexDirection: "column", padding: 4, minWidth: 190 }}>
                                            <Button
                                                type="text"
                                                icon={<FileAddOutlined />}
                                                style={{ justifyContent: "flex-start", height: 38 }}
                                                disabled={!composerEnabled}
                                                onClick={() => {
                                                    setAttachOpen(false);
                                                    fileInputRef.current?.click();
                                                }}
                                            >
                                                {t("visitorEmbed.attach.uploadFile")}
                                            </Button>
                                            <Button
                                                type="text"
                                                icon={<ScanOutlined />}
                                                style={{ justifyContent: "flex-start", height: 38 }}
                                                disabled={!composerEnabled}
                                                onClick={() => void captureAndSendScreenshot()}
                                            >
                                                {t("visitorEmbed.attach.sendScreenshot")}
                                            </Button>
                                        </div>
                                    }
                                >
                                    <Tooltip title={t("visitorEmbed.attach.add")}>
                                        <Button
                                            type="text"
                                            aria-label={t("visitorEmbed.attach.add")}
                                            icon={<PlusOutlined />}
                                            disabled={!composerEnabled}
                                            style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 999,
                                                background: effectiveThemeMode === "dark" ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)",
                                                color: uiTextMain,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        />
                                    </Tooltip>
                                </Popover>
                            )}

                            <div
                                style={{
                                    flex: "1 1 auto",
                                    minWidth: 0,
                                    display: "flex",
                                    alignItems: "flex-end",
                                    gap: 6,
                                    background: effectiveThemeMode === "dark" ? "rgba(255,255,255,.06)" : "#ffffff",
                                    border: `1px solid ${effectiveThemeMode === "dark" ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.12)"}`,
                                    borderRadius: 999,
                                    padding: "6px 6px 6px 12px",
                                    boxShadow: "0 10px 28px rgba(0,0,0,.06)",
                                }}
                            >
                                <Input.TextArea
                                    ref={textAreaRef}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder={composerPlaceholder}
                                    autoSize={{ minRows: 1, maxRows: 4 }}
                                    onKeyDown={onComposerKeyDown}
                                    disabled={!composerEnabled}
                                    style={{
                                        flex: "1 1 auto",
                                        minWidth: 0,
                                        border: 0,
                                        boxShadow: "none",
                                        background: "transparent",
                                        resize: "none",
                                        padding: "8px 4px",
                                        fontSize: 14,
                                        lineHeight: 1.35,
                                        color: uiTextMain,
                                    }}
                                />

                                <Popover
                                    trigger="click"
                                    placement="topRight"
                                    content={
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, padding: 4 }}>
                                            {emojiList.map((e) => (
                                                <button
                                                    key={e}
                                                    type="button"
                                                    onClick={() => insertEmoji(e)}
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        borderRadius: 10,
                                                        border: "1px solid rgba(15,23,42,.10)",
                                                        background: "#fff",
                                                        cursor: "pointer",
                                                        fontSize: 16,
                                                        lineHeight: "28px",
                                                    }}
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    }
                                >
                                    <Tooltip title={t("visitorEmbed.attach.emoji")}>
                                        <Button
                                            type="text"
                                            aria-label={t("visitorEmbed.attach.emoji")}
                                            icon={<SmileOutlined />}
                                            disabled={!composerEnabled}
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 999,
                                                background: "rgba(15,23,42,.04)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        />
                                    </Tooltip>
                                </Popover>

                                <Tooltip title={canSend ? t("visitorEmbed.composer.send") : t("visitorEmbed.composer.enterContentHint")}>
                                    <Button
                                        type="text"
                                        aria-label={t("visitorEmbed.composer.send")}
                                        icon={<ArrowUpOutlined />}
                                        onClick={sendText}
                                        disabled={!canSend || loading}
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 999,
                                            background: canSend ? "#111827" : "rgba(15,23,42,.14)",
                                            color: canSend ? "#ffffff" : "rgba(15,23,42,.55)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    />
                                </Tooltip>
                            </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </ConfigProvider>
    );
}
