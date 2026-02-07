import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Divider, Form, Input, InputNumber, Radio, Row, Select, Space, Spin, Switch, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { ExclamationCircleOutlined } from "@ant-design/icons";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";
import { compressImageForUpload } from "../utils/imageCompress";
import { WIDGET_LOGO_COMPRESS_OPTS } from "../config/imageUploadCompression";

type SiteItem = {
    id: string;
    name: string;
    public_key: string;
    status: string;
};

type WidgetConfigDto = {
    pre_chat_enabled: boolean;
    pre_chat_fields_json?: string | null;
    theme_color?: string | null;
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

    launcher_style?: string | null;
    theme_mode?: string | null;
    color_settings_mode?: string | null;
    color_overrides_json?: string | null;

    position?: string | null;
    z_index?: number | null;
    launcher_text?: string | null;
    width?: number | null;
    height?: number | null;
    auto_height?: boolean | null;
    auto_height_mode?: string | null;
    min_height?: number | null;
    max_height_ratio?: number | null;
    mobile_breakpoint?: number | null;
    mobile_fullscreen?: boolean | null;
    offset_x?: number | null;
    offset_y?: number | null;
    debug?: boolean | null;
    show_logo?: boolean;
    logo_url?: string | null;
    show_agent_photo?: boolean;
};

type WidgetSnippetResponse = {
    site_id: string;
    site_key: string;
    embed_url: string;
    widget_script_url: string;
    widget_script_versioned_url: string;
    cookie_domain?: string | null;
    cookie_samesite?: string | null;
    snippet_html: string;
};

type PresignWidgetLogoUploadResponse = {
    bucket: string;
    object_key: string;
    upload_url: string;
    expires_in_seconds?: number;
    max_upload_bytes?: number;
};

const DEFAULTS = {
    launcher_style: "bubble",
    theme_mode: "light",
    color_settings_mode: "theme",
    position: "bottom-right",
    z_index: 2147483647,
    launcher_text: "Chat",
    width: 380,
    height: 560,
    auto_height: true,
    auto_height_mode: "fixed",
    min_height: 320,
    max_height_ratio: 0.85,
    mobile_breakpoint: 640,
    mobile_fullscreen: true,
    offset_x: 20,
    offset_y: 20,
    debug: false,
} as const;

const THEME_COLORS = [
    "#000000",
    "#7c3aed",
    "#2563eb",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#06b6d4",
    "#111827",
    "#ffffff",
] as const;

function safeParseJsonObject(s: string | null | undefined): Record<string, string> {
    if (!s) return {};
    try {
        const v = JSON.parse(s);
        if (!v || typeof v !== "object" || Array.isArray(v)) return {};
        const out: Record<string, string> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            const key = String(k || "").trim();
            if (!key) continue;
            const vv = String(val || "").trim();
            if (!vv) continue;
            out[key] = vv;
        }
        return out;
    } catch {
        return {};
    }
}

function normalizeHexColor(s: string): string {
    const t = String(s || "").trim();
    if (!t) return "";
    const v = t.startsWith("#") ? t : `#${t}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return "";
    return v.toUpperCase();
}

function Tile(props: {
    selected: boolean;
    label: string;
    onClick?: () => void;
    icon?: ReactNode;
}) {
    const { selected, label, onClick, icon } = props;
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onClick?.();
            }}
            style={{
                width: 120,
                border: selected ? "2px solid #2563eb" : "1px solid #d9d9d9",
                borderRadius: 10,
                padding: 10,
                cursor: "pointer",
                position: "relative",
                background: "#fff",
            }}
        >
            <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(0,0,0,.65)", marginTop: 6 }}>{label}</div>
            {selected ? (
                <div
                    style={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "#2563eb",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                    }}
                >
                    ✓
                </div>
            ) : null}
        </div>
    );
}

function ColorRow(props: {
    value: string;
    onChange: (next: string) => void;
}) {
    const { value, onChange } = props;
    const normalized = normalizeHexColor(value) || "";
    return (
        <Space wrap size={10}>
            {THEME_COLORS.map((c) => {
                const isSelected = normalized && normalized.toUpperCase() === c.toUpperCase();
                const isWhite = c.toLowerCase() === "#ffffff";
                return (
                    <div
                        key={c}
                        role="button"
                        tabIndex={0}
                        onClick={() => onChange(c)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") onChange(c);
                        }}
                        style={{
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            background: c,
                            border: isSelected ? "2px solid #2563eb" : isWhite ? "1px solid #d9d9d9" : "1px solid rgba(0,0,0,0.08)",
                            boxShadow: isSelected ? "0 0 0 2px rgba(37,99,235,0.2)" : undefined,
                            cursor: "pointer",
                            position: "relative",
                        }}
                        title={c}
                    >
                        {isSelected ? (
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: isWhite ? "#111827" : "#fff",
                                    fontSize: 12,
                                    fontWeight: 800,
                                }}
                            >
                                ✓
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </Space>
    );
}

function ColorField(props: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
}) {
    const { label, value, onChange, placeholder } = props;
    const normalized = normalizeHexColor(value) || value;
    const swatch = normalizeHexColor(value) || "#ffffff";
    return (
        <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
            <div style={{ flex: 1 }}>
                <Typography.Text type="secondary">{label}</Typography.Text>
                <Input
                    value={normalized}
                    placeholder={placeholder || "#RRGGBB"}
                    onChange={(e) => onChange(String(e.target.value || ""))}
                />
            </div>
            <div
                title={normalizeHexColor(value) || ""}
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: swatch,
                    border: "1px solid rgba(0,0,0,0.12)",
                }}
            />
        </div>
    );
}

function escapeAttr(s: string): string {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function appendQueryParams(rawUrl: string, params: Record<string, string>): string {
    const input = String(rawUrl || "").trim();
    if (!input) return input;
    try {
        const base = typeof window !== "undefined" ? window.location.href : "http://localhost/";
        const u = new URL(input, base);
        for (const [k, v] of Object.entries(params || {})) {
            if (!k) continue;
            u.searchParams.set(k, String(v));
        }
        return u.toString();
    } catch {
        // Fallback: best-effort append (assume absolute URL).
        const qs = Object.entries(params || {})
            .filter(([k, v]) => k && v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
        if (!qs) return input;
        return input + (input.includes("?") ? "&" : "?") + qs;
    }
}

function buildPreviewScriptTagHtml(params: {
    scriptUrl: string;
    siteKey: string;
    embedUrl: string;
    values: Partial<WidgetConfigDto> | null | undefined;
}): string {
    const { scriptUrl, siteKey, embedUrl } = params;
    // Keep preview close to production: only pass identity (siteKey) + entry (embedUrl).
    const lines: string[] = [];
    lines.push("<script");
    lines.push("  defer");
    lines.push(`  src=\"${escapeAttr(scriptUrl)}\"`);
    lines.push(`  data-chatlive-site-key=\"${escapeAttr(siteKey)}\"`);
    lines.push(`  data-chatlive-embed-url=\"${escapeAttr(embedUrl)}\"`);
    lines.push("></script>");
    return lines.join("\n");
}

export function WidgetCustomizePage() {
    const { t } = useTranslation();

    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [sitesLoading, setSitesLoading] = useState(false);
    const [sitesError, setSitesError] = useState<string>("");
    const [sites, setSites] = useState<SiteItem[]>([]);
    const [siteId, setSiteId] = useState<string>("");

    const [cfgLoading, setCfgLoading] = useState(false);
    const [cfgError, setCfgError] = useState<string>("");
    const [saving, setSaving] = useState(false);

    const [snippetLoading, setSnippetLoading] = useState(false);
    const [snippetError, setSnippetError] = useState<string>("");
    const [snippet, setSnippet] = useState<WidgetSnippetResponse | null>(null);

    const [previewReload, setPreviewReload] = useState(0);
    const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

    const logoFileInputRef = useRef<HTMLInputElement | null>(null);
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoUploadError, setLogoUploadError] = useState<string>("");

    const [form] = Form.useForm<WidgetConfigDto>();

    const watchLogoUrl = Form.useWatch("logo_url", form);

    const selectedSite = useMemo(() => sites.find((x) => x.id === siteId) || sites[0] || null, [siteId, sites]);

    useEffect(() => {
        let mounted = true;
        setMeLoading(true);
        http
            .get<{ role?: string }>("/api/v1/auth/me")
            .then((res) => {
                if (!mounted) return;
                setMeRole(String(res.data?.role || ""));
            })
            .catch(() => {
                if (!mounted) return;
                setMeRole("");
            })
            .finally(() => {
                if (!mounted) return;
                setMeLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;

        let mounted = true;
        setSitesLoading(true);
        setSitesError("");

        http
            .get<SiteItem[]>("/api/v1/admin/sites")
            .then((res) => {
                if (!mounted) return;
                const list = res.data;
                setSites(list || []);
                if (!siteId && list?.length) setSiteId(list[0].id);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setSitesError(errorMessage(e, "load_sites_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setSitesLoading(false);
            });

        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, meLoading]);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;
        if (!siteId) return;

        let mounted = true;
        setCfgLoading(true);
        setCfgError("");

        http
            .get<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`)
            .then((res) => {
                if (!mounted) return;
                const cfg = res.data;
                form.setFieldsValue(cfg);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setCfgError(errorMessage(e, "load_widget_config_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setCfgLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [form, isAdmin, meLoading, siteId]);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;
        if (!siteId) return;

        let mounted = true;
        setSnippetLoading(true);
        setSnippetError("");

        http
            .get<WidgetSnippetResponse>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget/snippet`)
            .then((res) => {
                if (!mounted) return;
                setSnippet(res.data);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setSnippetError(errorMessage(e, "load_widget_snippet_failed"));
                setSnippet(null);
            })
            .finally(() => {
                if (!mounted) return;
                setSnippetLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [isAdmin, meLoading, siteId]);

    async function save(values: WidgetConfigDto) {
        if (!siteId) return;
        setSaving(true);
        setCfgError("");
        try {
            const res = await http.put<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`, values);
            form.setFieldsValue(res.data);

            // Refresh snippet since it depends on widget_config.
            try {
                setSnippetLoading(true);
                setSnippetError("");
                const sn = await http.get<WidgetSnippetResponse>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget/snippet`);
                setSnippet(sn.data);
            } catch (e2: unknown) {
                setSnippetError(errorMessage(e2, "load_widget_snippet_failed"));
            } finally {
                setSnippetLoading(false);
            }
        } catch (e: unknown) {
            setCfgError(errorMessage(e, "save_widget_config_failed"));
        } finally {
            setSaving(false);
        }
    }

    async function reloadConfig() {
        if (!siteId) return;
        const res = await http.get<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`);
        form.setFieldsValue(res.data);
    }

    async function uploadLogo(file: File) {
        if (!siteId) return;
        if (!file) return;

        setLogoUploading(true);
        setLogoUploadError("");

        try {
            const ct = String(file.type || "").toLowerCase();
            const okType = ct === "image/png" || ct === "image/jpeg" || ct === "image/jpg" || ct === "image/webp" || ct === "image/gif";
            if (!okType) {
                throw new Error("invalid_logo_type");
            }

            const compressed = await compressImageForUpload(file, WIDGET_LOGO_COMPRESS_OPTS);

            const presign = await http.post<PresignWidgetLogoUploadResponse>(
                `/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-logo/presign-upload`,
                {
                    filename: compressed.filename,
                    content_type: compressed.contentType || "application/octet-stream",
                    size_bytes: compressed.blob.size,
                },
            );

            const uploadUrl = String(presign.data?.upload_url || "");
            if (!uploadUrl) throw new Error("upload_url_missing");

            const putRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": compressed.contentType || "application/octet-stream",
                },
                body: compressed.blob,
            });

            if (!putRes.ok) {
                throw new Error(`upload_failed_${putRes.status}`);
            }

            await reloadConfig();
        } catch (e: unknown) {
            setLogoUploadError(errorMessage(e, "upload_logo_failed"));
        } finally {
            setLogoUploading(false);
        }
    }

        const watchAll = Form.useWatch([], form) as Partial<WidgetConfigDto> | undefined;
        const watchThemeColor = Form.useWatch("theme_color", form);
        const watchLauncherStyle = Form.useWatch("launcher_style", form);
        const watchThemeMode = Form.useWatch("theme_mode", form);
        const watchColorSettingsMode = Form.useWatch("color_settings_mode", form);
        const watchColorOverridesJson = Form.useWatch("color_overrides_json", form);

        const colorOverrides = useMemo(() => safeParseJsonObject(watchColorOverridesJson), [watchColorOverridesJson]);

        function setColorOverride(key: string, raw: string) {
            const normalized = normalizeHexColor(raw);
            const next = { ...colorOverrides };
            if (!normalized) delete next[key];
            else next[key] = normalized;
            const json = Object.keys(next).length ? JSON.stringify(next) : null;
            form.setFieldsValue({ color_overrides_json: json } as Partial<WidgetConfigDto>);
        }

        const previewConfig = useMemo(() => {
                const v = (watchAll || {}) as Partial<WidgetConfigDto>;

                const asStr = (x: unknown): string | undefined => {
                        const s = String(x ?? "").trim();
                        return s ? s : undefined;
                };
                const asNum = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
                const asBool = (x: unknown): boolean | undefined => (typeof x === "boolean" ? x : undefined);

                // Keep consistent with preview snippet behavior: autoHeight defaults to true unless explicitly false.
                const autoHeight = v.auto_height === false ? false : true;

                return {
                        themeColor: asStr(v.theme_color),
                        launcherStyle: asStr(v.launcher_style),
                        themeMode: asStr(v.theme_mode),
                        colorSettingsMode: asStr(v.color_settings_mode),
                        colorOverridesJson: asStr(v.color_overrides_json),

                        position: asStr(v.position),
                        zIndex: asNum(v.z_index),
                        launcherText: asStr(v.launcher_text),
                        width: asNum(v.width),
                        height: asNum(v.height),
                        autoHeight,
                        autoHeightMode: asStr(v.auto_height_mode),
                        minHeight: asNum(v.min_height),
                        maxHeightRatio: asNum(v.max_height_ratio),
                        mobileBreakpoint: asNum(v.mobile_breakpoint),
                        mobileFullscreen: asBool(v.mobile_fullscreen),
                        offsetX: asNum(v.offset_x),
                        offsetY: asNum(v.offset_y),
                        debug: asBool(v.debug),

                        cookieDomain: asStr(v.cookie_domain),
                        cookieSameSite: asStr(v.cookie_samesite),
                };
        }, [watchAll]);

        useEffect(() => {
                const win = previewIframeRef.current?.contentWindow;
                if (!win) return;
                win.postMessage({ type: "chatlive.preview.config", config: previewConfig }, "*");
        }, [previewConfig, previewReload, selectedSite?.public_key, snippet?.widget_script_url]);

        const previewSrcDoc = useMemo(() => {
                if (!selectedSite?.public_key) return null;
            if (!snippet?.widget_script_url) return null;
                if (!snippet?.embed_url) return null;

            // Host preview mode: still allow iframe UI to know it's preview.
            // Widget shell will fetch server config; unsaved changes are applied via postMessage overrides.
            const previewEmbedUrl = appendQueryParams(snippet.embed_url, { chatlive_preview: "1" });

                const scriptTag = buildPreviewScriptTagHtml({
                scriptUrl: snippet.widget_script_url,
                        siteKey: selectedSite.public_key,
                        embedUrl: previewEmbedUrl,
                        // Initial values are kept minimal; parent page will live-sync unsaved changes via postMessage.
                        values: {},
                });

                const css = `
                    html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
                    .page { height: 100%; background: #f5f5f5; position: relative; overflow: hidden; }
                        .topbar { position: absolute; left: 16px; top: 16px; right: 16px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.85);
                                            display: flex; align-items: center; padding: 0 12px; color: #666; font-size: 12px; }
                        .content { position: absolute; left: 16px; right: 16px; top: 68px; bottom: 16px; border-radius: 14px;
                                             background: rgba(255,255,255,0.6); }
                `;

                const bridge = `
                    (function(){
                        var BASE = { siteKey: ${JSON.stringify(selectedSite.public_key)}, embedUrl: ${JSON.stringify(previewEmbedUrl)} };

                        function merge(a, b){
                            var out = {};
                            try {
                                if (a && typeof a === 'object') {
                                    for (var k in a) out[k] = a[k];
                                }
                                if (b && typeof b === 'object') {
                                    for (var k2 in b) out[k2] = b[k2];
                                }
                            } catch (e) {
                                // ignore
                            }
                            return out;
                        }

                        function apply(cfg){
                            try {
                                var next = merge(BASE, cfg || {});
                                if (window.ChatLiveWidget && typeof window.ChatLiveWidget.init === 'function') {
                                    window.ChatLiveWidget.init(next);
                                }

                                var mode = (next && next.themeMode ? String(next.themeMode) : '').trim().toLowerCase();
                                var isDark = mode === 'dark';
                                var page = document.querySelector('.page');
                                if (page) page.style.background = isDark ? '#111827' : '#f5f5f5';
                                var topbar = document.querySelector('.topbar');
                                if (topbar) {
                                    topbar.style.background = isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.85)';
                                    topbar.style.color = isDark ? 'rgba(255,255,255,0.72)' : '#666';
                                }
                                var content = document.querySelector('.content');
                                if (content) content.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)';
                            } catch (e) {
                                // ignore
                            }
                        }

                        // Ensure initial init happens even if parent hasn't posted config yet.
                        try { apply({}); } catch (e) { /* ignore */ }

                        window.addEventListener('message', function(ev){
                            try {
                                var d = ev && ev.data;
                                if (!d || typeof d !== 'object') return;
                                if (d.type === 'chatlive.preview.config') apply(d.config || {});
                            } catch (e) {
                                // ignore
                            }
                        });
                    })();
                `;

                return `<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${css}</style>
    </head>
    <body>
        <div class="page">
            <div class="topbar">${escapeAttr(t("widgetCustomize.preview.fakePage"))}</div>
            <div class="content"></div>
        </div>
        ${scriptTag}
        <script>${bridge}</script>
    </body>
</html>`;
                // Remount is handled by iframe key.
                // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [selectedSite?.public_key, snippet?.embed_url, snippet?.widget_script_url, previewReload, t]);

        const previewIframeStyle: CSSProperties = useMemo(
                () => ({ width: "100%", height: "100%", border: 0, borderRadius: 12, overflow: "hidden" }),
                [],
        );

    return (
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
            <Typography.Title level={3} style={{ marginTop: 0 }}>
                {t("widgetCustomize.title")}
            </Typography.Title>

            {!meLoading && !isAdmin ? (
                <Alert type="warning" message={t("widgetCustomize.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
            ) : null}

            {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
            {cfgError ? <Alert type="error" message={cfgError} showIcon style={{ marginBottom: 12 }} /> : null}
            {snippetError ? <Alert type="error" message={snippetError} showIcon style={{ marginBottom: 12 }} /> : null}

            <Row gutter={16} align="top">
                <Col xs={24} lg={12}>
                    <Card>
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                            <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
                                {sitesLoading ? <Spin size="small" /> : null}
                                {cfgLoading ? <Spin size="small" /> : null}
                                {snippetLoading ? <Spin size="small" /> : null}
                            </Space>

                            <Form
                                form={form}
                                layout="vertical"
                                onFinish={save}
                                disabled={cfgLoading || !isAdmin}
                            >
                                <Form.Item name="welcome_text" hidden>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="launcher_style" hidden>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="theme_mode" hidden>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="color_settings_mode" hidden>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="color_overrides_json" hidden>
                                    <Input />
                                </Form.Item>

                                <Form.Item name="pre_chat_enabled" hidden valuePropName="checked">
                                    <Switch />
                                </Form.Item>

                                <Collapse
                                    accordion
                                    defaultActiveKey={"appearance"}
                                    items={[
                                        {
                                            key: "appearance",
                                            label: t("widgetCustomize.sections.appearance"),
                                            children: (
                                                <>
                                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                        {t("widgetCustomize.appearance.minimizedWindow").toUpperCase()}
                                                    </Typography.Text>
                                                    <div style={{ marginTop: 10, marginBottom: 16 }}>
                                                        <Space size={12}>
                                                            <Tile
                                                                selected={String(watchLauncherStyle || DEFAULTS.launcher_style) === "bar"}
                                                                label={t("widgetCustomize.appearance.minimizedBar")}
                                                                onClick={() => form.setFieldsValue({ launcher_style: "bar" })}
                                                                icon={
                                                                    <img
                                                                        src="/LiveChats.png"
                                                                        alt={t("widgetCustomize.appearance.minimizedBar")}
                                                                        style={{ width: 64, height: 26, objectFit: "contain" }}
                                                                    />
                                                                }
                                                            />
                                                            <Tile
                                                                selected={String(watchLauncherStyle || DEFAULTS.launcher_style) === "bubble"}
                                                                label={t("widgetCustomize.appearance.minimizedBubble")}
                                                                onClick={() => form.setFieldsValue({ launcher_style: "bubble" })}
                                                                icon={
                                                                    <img
                                                                        src="/window.png"
                                                                        alt={t("widgetCustomize.appearance.minimizedBubble")}
                                                                        style={{ width: 36, height: 36, objectFit: "contain" }}
                                                                    />
                                                                }
                                                            />
                                                        </Space>
                                                    </div>

                                                    <Typography.Title level={5} style={{ margin: "6px 0 10px" }}>
                                                        {t("widgetCustomize.appearance.themeAndColors")}
                                                    </Typography.Title>

                                                    <div style={{ marginBottom: 14 }}>
                                                        <Space size={12}>
                                                            <Tile
                                                                selected={String(watchThemeMode || DEFAULTS.theme_mode) === "light"}
                                                                label={t("widgetCustomize.appearance.light")}
                                                                onClick={() => form.setFieldsValue({ theme_mode: "light" })}
                                                                icon={<div style={{ width: 18, height: 18, borderRadius: 999, background: "#eab308" }} />}
                                                            />
                                                            <Tile
                                                                selected={String(watchThemeMode || DEFAULTS.theme_mode) === "dark"}
                                                                label={t("widgetCustomize.appearance.dark")}
                                                                onClick={() => form.setFieldsValue({ theme_mode: "dark" })}
                                                                icon={<div style={{ width: 18, height: 18, borderRadius: 999, background: "#111827" }} />}
                                                            />
                                                        </Space>
                                                    </div>

                                                    <Form.Item label={t("widgetCustomize.widgetConfig.themeColor.label")} name="theme_color" tooltip={t("widgetCustomize.widgetConfig.themeColor.tooltip")}
                                                    >
                                                        <Input placeholder={t("widgetCustomize.widgetConfig.themeColor.placeholder")} />
                                                    </Form.Item>

                                                    <div style={{ marginTop: 10 }}>
                                                        <Radio.Group
                                                            value={String(watchColorSettingsMode || DEFAULTS.color_settings_mode)}
                                                            onChange={(e) => form.setFieldsValue({ color_settings_mode: String(e.target.value || "theme") })}
                                                        >
                                                            <Space direction="vertical" size={8}>
                                                                <Radio value="theme">{t("widgetCustomize.appearance.themeColor")}</Radio>
                                                                <Radio value="advanced">
                                                                    <div>
                                                                        <div>{t("widgetCustomize.appearance.moreColorSettings")}</div>
                                                                        <div style={{ fontSize: 12, color: "rgba(0,0,0,.45)", marginTop: 2 }}>
                                                                            {t("widgetCustomize.appearance.moreColorHint")}
                                                                        </div>
                                                                    </div>
                                                                </Radio>
                                                            </Space>
                                                        </Radio.Group>
                                                    </div>

                                                    {String(watchColorSettingsMode || DEFAULTS.color_settings_mode) === "theme" ? (
                                                        <div style={{ marginTop: 12 }}>
                                                            <ColorRow
                                                                value={String(watchThemeColor || "")}
                                                                onChange={(c) => form.setFieldsValue({ theme_color: c })}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div style={{ marginTop: 14 }}>
                                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                                {t("widgetCustomize.appearance.minimizedWidget").toUpperCase()}
                                                            </Typography.Text>

                                                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.bubble")}
                                                                    value={colorOverrides.minimized_bubble || ""}
                                                                    onChange={(v) => setColorOverride("minimized_bubble", v)}
                                                                    placeholder="#0059E1"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.iconColor")}
                                                                    value={colorOverrides.minimized_icon || ""}
                                                                    onChange={(v) => setColorOverride("minimized_icon", v)}
                                                                    placeholder="#FFFFFF"
                                                                />
                                                            </div>

                                                            <Divider style={{ margin: "14px 0" }} />

                                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                                {t("widgetCustomize.appearance.maximizedWidget").toUpperCase()}
                                                            </Typography.Text>

                                                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.chatBackground")}
                                                                    value={colorOverrides.chat_bg || ""}
                                                                    onChange={(v) => setColorOverride("chat_bg", v)}
                                                                    placeholder="#F6F6F7"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.primaryColor")}
                                                                    value={colorOverrides.primary || ""}
                                                                    onChange={(v) => setColorOverride("primary", v)}
                                                                    placeholder="#0059E1"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.customerBubble")}
                                                                    value={colorOverrides.customer_bubble || ""}
                                                                    onChange={(v) => setColorOverride("customer_bubble", v)}
                                                                    placeholder="#0059E1"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.customerText")}
                                                                    value={colorOverrides.customer_text || ""}
                                                                    onChange={(v) => setColorOverride("customer_text", v)}
                                                                    placeholder="#FFFFFF"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.agentBubble")}
                                                                    value={colorOverrides.agent_bubble || ""}
                                                                    onChange={(v) => setColorOverride("agent_bubble", v)}
                                                                    placeholder="#FFFFFF"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.agentText")}
                                                                    value={colorOverrides.agent_text || ""}
                                                                    onChange={(v) => setColorOverride("agent_text", v)}
                                                                    placeholder="#111111"
                                                                />
                                                                <ColorField
                                                                    label={t("widgetCustomize.appearance.systemMessages")}
                                                                    value={colorOverrides.system || ""}
                                                                    onChange={(v) => setColorOverride("system", v)}
                                                                    placeholder="#707070"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <Form.Item label={t("widgetCustomize.fields.launcherText")} name="launcher_text">
                                                        <Input placeholder={DEFAULTS.launcher_text} />
                                                    </Form.Item>
                                                </>
                                            ),
                                        },
                                        {
                                            key: "position",
                                            label: t("widgetCustomize.sections.position"),
                                            children: (
                                                <Row gutter={12}>
                                                    <Col span={24}>
                                                        <Form.Item label={t("widgetCustomize.fields.position")} name="position">
                                                            <Select
                                                                options={[
                                                                    { value: "bottom-right", label: t("widgetCustomize.positions.bottomRight") },
                                                                    { value: "bottom-left", label: t("widgetCustomize.positions.bottomLeft") },
                                                                    { value: "top-right", label: t("widgetCustomize.positions.topRight") },
                                                                    { value: "top-left", label: t("widgetCustomize.positions.topLeft") },
                                                                ]}
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.offsetX")} name="offset_x">
                                                            <InputNumber min={0} max={200} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.offsetY")} name="offset_y">
                                                            <InputNumber min={0} max={200} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={24}>
                                                        <Form.Item label={t("widgetCustomize.fields.zIndex")} name="z_index">
                                                            <InputNumber min={1} max={2147483647} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                            ),
                                        },
                                        {
                                            key: "size",
                                            label: t("widgetCustomize.sections.size"),
                                            children: (
                                                <Row gutter={12}>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.width")} name="width">
                                                            <InputNumber min={280} max={640} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.height")} name="height">
                                                            <InputNumber min={320} max={900} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>

                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.autoHeight")} name="auto_height" valuePropName="checked">
                                                            <Switch />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.autoHeightMode")} name="auto_height_mode">
                                                            <Select
                                                                options={[
                                                                    { value: "fixed", label: t("widgetCustomize.autoHeightModes.fixed") },
                                                                    { value: "grow-only", label: t("widgetCustomize.autoHeightModes.growOnly") },
                                                                    { value: "dynamic", label: t("widgetCustomize.autoHeightModes.dynamic") },
                                                                ]}
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.minHeight")} name="min_height">
                                                            <InputNumber min={240} max={900} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.maxHeightRatio")} name="max_height_ratio">
                                                            <InputNumber min={0.2} max={1} step={0.05} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                            ),
                                        },
                                        {
                                            key: "mobile",
                                            label: t("widgetCustomize.sections.mobile"),
                                            children: (
                                                <Row gutter={12}>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.mobileBreakpoint")} name="mobile_breakpoint">
                                                            <InputNumber min={320} max={2000} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item label={t("widgetCustomize.fields.mobileFullscreen")} name="mobile_fullscreen" valuePropName="checked">
                                                            <Switch />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                            ),
                                        },
                                        {
                                            key: "tweaks",
                                            label: t("widgetCustomize.sections.tweaks"),
                                            children: (
                                                <>
                                                    {(() => {
                                                        const row: CSSProperties = {
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 12,
                                                            padding: "8px 0",
                                                        };
                                                        const left: CSSProperties = { display: "flex", alignItems: "center", gap: 8, minWidth: 0 };
                                                        const right: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" };
                                                        const hintIconStyle: CSSProperties = { color: "rgba(0,0,0,.45)", cursor: "help", fontSize: 14 };

                                                        return (
                                                            <>
                                                                <div style={row}>
                                                                    <div style={left}>
                                                                        <Typography.Text>{t("widgetCustomize.fields.debug")}</Typography.Text>
                                                                    </div>
                                                                    <div style={right}>
                                                                        <Form.Item name="debug" valuePropName="checked" noStyle>
                                                                            <Switch />
                                                                        </Form.Item>
                                                                    </div>
                                                                </div>

                                                                <div style={row}>
                                                                    <div style={left}>
                                                                        <Typography.Text>{t("widgetCustomize.tweaksOptions.showLogo")}</Typography.Text>
                                                                    </div>
                                                                    <div style={right}>
                                                                        <input
                                                                            ref={logoFileInputRef}
                                                                            type="file"
                                                                            accept="image/*"
                                                                            style={{ display: "none" }}
                                                                            onChange={(e) => {
                                                                                const f = e.target.files?.[0];
                                                                                if (!f) return;
                                                                                void uploadLogo(f);
                                                                                // allow re-uploading same file
                                                                                e.currentTarget.value = "";
                                                                            }}
                                                                        />

                                                                        <Button
                                                                            type="link"
                                                                            onClick={() => logoFileInputRef.current?.click()}
                                                                            loading={logoUploading}
                                                                            disabled={!isAdmin}
                                                                            style={{ padding: 0, height: "auto" }}
                                                                        >
                                                                            {t("widgetCustomize.tweaksOptions.uploadLogo")}
                                                                        </Button>

                                                                        <Tooltip title={t("widgetCustomize.tweaksOptions.uploadLogoHint")}>
                                                                            <span aria-label="Help">
                                                                                <ExclamationCircleOutlined style={hintIconStyle} />
                                                                            </span>
                                                                        </Tooltip>

                                                                        {watchLogoUrl ? (
                                                                            <img
                                                                                alt={t("widgetCustomize.tweaksOptions.showLogo")}
                                                                                src={String(watchLogoUrl || "")}
                                                                                style={{ height: 28, width: 28, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(15,23,42,.12)" }}
                                                                            />
                                                                        ) : null}

                                                                        <Form.Item name="show_logo" valuePropName="checked" noStyle>
                                                                            <Switch />
                                                                        </Form.Item>
                                                                    </div>
                                                                </div>

                                                                {logoUploadError ? <Alert type="warning" showIcon message={logoUploadError} style={{ marginBottom: 12 }} /> : null}

                                                                <div style={row}>
                                                                    <div style={left}>
                                                                        <Typography.Text>{t("widgetCustomize.tweaksOptions.showAgentPhoto")}</Typography.Text>
                                                                    </div>
                                                                    <div style={right}>
                                                                        <Form.Item name="show_agent_photo" valuePropName="checked" noStyle>
                                                                            <Switch />
                                                                        </Form.Item>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </>
                                            ),
                                        },
                                    ]}
                                />

                                <Divider style={{ margin: "12px 0" }} />

                                <Space>
                                    <Button type="primary" htmlType="submit" loading={saving} disabled={!isAdmin}>
                                        {t("common.save")}
                                    </Button>
                                    <Button onClick={() => form.resetFields()} disabled={saving || !isAdmin}>
                                        {t("common.reset")}
                                    </Button>
                                </Space>
                            </Form>
                        </Space>
                    </Card>
                </Col>

                <Col xs={24} lg={12}>
                    <Card
                        title={t("widgetCustomize.preview.title")}
                        extra={
                            <Button onClick={() => setPreviewReload((x) => x + 1)} disabled={!previewSrcDoc}>
                                {t("widgetCustomize.preview.reload")}
                            </Button>
                        }
                    >
                        <div style={{ height: 620 }}>
                            {previewSrcDoc ? (
                                <iframe
                                    key={`${selectedSite?.public_key || ""}:${previewReload}`}
                                    title="widget-preview"
                                    srcDoc={previewSrcDoc}
                                    style={previewIframeStyle}
                                    sandbox="allow-scripts allow-same-origin allow-forms"
                                    ref={previewIframeRef}
                                    onLoad={() => {
                                        const win = previewIframeRef.current?.contentWindow;
                                        if (!win) return;
                                        win.postMessage({ type: "chatlive.preview.config", config: previewConfig }, "*");
                                    }}
                                />
                            ) : (
                                <div style={{ color: "rgba(0,0,0,.45)" }}>{t("preChatForm.previewEmpty")}</div>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
