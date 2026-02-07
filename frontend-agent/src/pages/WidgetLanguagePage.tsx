import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Divider, Form, Grid, Input, Layout, Row, Select, Space, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

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

type PhraseFormValues = {
    widget_language: string;
    welcome_text?: string;
    default_customer_name?: string;
    message_placeholder?: string;
    header_title?: string;

    // Actions / buttons
    minimize?: string;
    retry?: string;
    start_conversation?: string;

    // Identity modal / identity hints
    name_optional?: string;
    email_optional?: string;
    leave_contact_title?: string;
    leave_contact_ok?: string;
    leave_contact_cancel?: string;
    leave_contact_hint?: string;
    identity_error?: string;

    // Pre-chat
    prechat_default_info?: string;
    prechat_name_label?: string;
    prechat_email_label?: string;
    prechat_required_error?: string;
    prechat_at_least_one_error?: string;

    // Composer
    composer_send?: string;
    composer_enter_content_hint?: string;

    // Attachments
    attach_add_file?: string;
    attach_upload_file?: string;
    attach_send_screenshot?: string;
    attach_emoji?: string;
    attach_add?: string;

    // Conversation
    no_messages?: string;
    typing?: string;
    unread?: string;
};

function safeJsonParse<T>(s: string): T | null {
    try {
        return JSON.parse(s) as T;
    } catch {
        return null;
    }
}

function parsePhraseJson(json: unknown): Record<string, string> {
    const raw = String(json ?? "").trim();
    if (!raw) return {};
    const parsed = safeJsonParse<unknown>(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
}

function mergePhrases(currentJson: string | null | undefined, next: Record<string, string | undefined>): string | null {
    const base = parsePhraseJson(currentJson);
    for (const [k, v] of Object.entries(next)) {
        const vv = String(v ?? "").trim();
        if (!vv) delete base[k];
        else base[k] = vv;
    }
    const keys = Object.keys(base);
    if (!keys.length) return null;
    return JSON.stringify(base);
}

function normalizeWidgetLanguage(v: unknown): "en" | "zh-CN" {
    const s = String(v ?? "").trim();
    if (!s) return "en";
    if (s.toLowerCase() === "en") return "en";
    if (s.toLowerCase() === "zh-cn" || s === "zh-CN") return "zh-CN";
    return "en";
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
        const qs = Object.entries(params || {})
            .filter(([k, v]) => k && v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
        if (!qs) return input;
        return input + (input.includes("?") ? "&" : "?") + qs;
    }
}

function buildPreviewScriptTagHtml(params: { scriptUrl: string; siteKey: string; embedUrl: string }): string {
    const { scriptUrl, siteKey, embedUrl } = params;
    const lines: string[] = [];
    lines.push("<script");
    lines.push("  defer");
    lines.push(`  src=\"${escapeAttr(scriptUrl)}\"`);
    lines.push(`  data-chatlive-site-key=\"${escapeAttr(siteKey)}\"`);
    lines.push(`  data-chatlive-embed-url=\"${escapeAttr(embedUrl)}\"`);
    lines.push("></script>");
    return lines.join("\n");
}

export function WidgetLanguagePage() {
    const { t } = useTranslation();
    const screens = Grid.useBreakpoint();
    const isNarrow = !screens.lg;

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

    const [previewReload] = useState(0);
    const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

    const [currentCfg, setCurrentCfg] = useState<WidgetConfigDto | null>(null);

    const [form] = Form.useForm<PhraseFormValues>();

    const selectedSite = useMemo(() => sites.find((x) => x.id === siteId) || sites[0] || null, [siteId, sites]);

    const selectedSiteLabel = useMemo(() => {
        const s = sites.find((x) => x.id === siteId) || sites[0];
        if (!s) return "";
        return `${s.name} (${s.public_key})`;
    }, [siteId, sites]);

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
                setCurrentCfg(cfg);

                const phrases = parsePhraseJson(cfg?.widget_phrases_json);

                form.setFieldsValue({
                    widget_language: normalizeWidgetLanguage(cfg?.widget_language),
                    welcome_text: String(cfg?.welcome_text || ""),
                    default_customer_name: phrases.default_customer_name || "",
                    message_placeholder: phrases.message_placeholder || "",
                    header_title: phrases.header_title || "",

                    minimize: phrases.minimize || "",
                    retry: phrases.retry || "",
                    start_conversation: phrases.start_conversation || "",

                    name_optional: phrases.name_optional || "",
                    email_optional: phrases.email_optional || "",
                    leave_contact_title: phrases.leave_contact_title || "",
                    leave_contact_ok: phrases.leave_contact_ok || "",
                    leave_contact_cancel: phrases.leave_contact_cancel || "",
                    leave_contact_hint: phrases.leave_contact_hint || "",
                    identity_error: phrases.identity_error || "",

                    prechat_default_info: phrases.prechat_default_info || "",
                    prechat_name_label: phrases.prechat_name_label || "",
                    prechat_email_label: phrases.prechat_email_label || "",
                    prechat_required_error: phrases.prechat_required_error || "",
                    prechat_at_least_one_error: phrases.prechat_at_least_one_error || "",

                    composer_send: phrases.composer_send || "",
                    composer_enter_content_hint: phrases.composer_enter_content_hint || "",

                    attach_add_file: phrases.attach_add_file || "",
                    attach_upload_file: phrases.attach_upload_file || "",
                    attach_send_screenshot: phrases.attach_send_screenshot || "",
                    attach_emoji: phrases.attach_emoji || "",
                    attach_add: phrases.attach_add || "",

                    no_messages: phrases.no_messages || "",
                    typing: phrases.typing || "",
                    unread: phrases.unread || "",
                });
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

    const watchAll = Form.useWatch([], form) as Partial<PhraseFormValues> | undefined;

    const previewConfig = useMemo(() => {
        const v = (watchAll || {}) as Partial<PhraseFormValues>;
        const mergedPhrasesJson = mergePhrases(currentCfg?.widget_phrases_json, {
            default_customer_name: v.default_customer_name,
            message_placeholder: v.message_placeholder,
            header_title: v.header_title,

            minimize: v.minimize,
            retry: v.retry,
            start_conversation: v.start_conversation,

            name_optional: v.name_optional,
            email_optional: v.email_optional,
            leave_contact_title: v.leave_contact_title,
            leave_contact_ok: v.leave_contact_ok,
            leave_contact_cancel: v.leave_contact_cancel,
            leave_contact_hint: v.leave_contact_hint,
            identity_error: v.identity_error,

            prechat_default_info: v.prechat_default_info,
            prechat_name_label: v.prechat_name_label,
            prechat_email_label: v.prechat_email_label,
            prechat_required_error: v.prechat_required_error,
            prechat_at_least_one_error: v.prechat_at_least_one_error,

            composer_send: v.composer_send,
            composer_enter_content_hint: v.composer_enter_content_hint,

            attach_add_file: v.attach_add_file,
            attach_upload_file: v.attach_upload_file,
            attach_send_screenshot: v.attach_send_screenshot,
            attach_emoji: v.attach_emoji,
            attach_add: v.attach_add,

            no_messages: v.no_messages,
            typing: v.typing,
            unread: v.unread,
        });

        const welcomeText = String(v.welcome_text || "").trim();

        return {
            widgetLanguage: normalizeWidgetLanguage(v.widget_language),
            widgetPhrasesJson: mergedPhrasesJson,
            welcomeText: welcomeText ? welcomeText : null,
        };
    }, [currentCfg?.widget_phrases_json, watchAll]);

    useEffect(() => {
        const win = previewIframeRef.current?.contentWindow;
        if (!win) return;
        win.postMessage({ type: "chatlive.preview.config", config: previewConfig }, "*");
    }, [previewConfig, previewReload, selectedSite?.public_key, snippet?.widget_script_url]);

    const previewSrcDoc = useMemo(() => {
        if (!selectedSite?.public_key) return null;
        if (!snippet?.widget_script_url) return null;
        if (!snippet?.embed_url) return null;

        const previewEmbedUrl = appendQueryParams(snippet.embed_url, { chatlive_preview: "1" });
        const scriptTag = buildPreviewScriptTagHtml({
            scriptUrl: snippet.widget_script_url,
            siteKey: selectedSite.public_key,
            embedUrl: previewEmbedUrl,
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
                        if (a && typeof a === 'object') { for (var k in a) out[k] = a[k]; }
                        if (b && typeof b === 'object') { for (var k2 in b) out[k2] = b[k2]; }
                    } catch (e) {}
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
                    } catch (e) {}
                }

                try { apply({}); } catch (e) {}

                window.addEventListener('message', function(ev){
                    try {
                        var d = ev && ev.data;
                        if (!d || typeof d !== 'object') return;
                        if (d.type === 'chatlive.preview.config') apply(d.config || {});
                    } catch (e) {}
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSite?.public_key, snippet?.embed_url, snippet?.widget_script_url, previewReload, t]);

    const previewIframeStyle: CSSProperties = useMemo(
        () => ({ width: "100%", height: "100%", border: 0, borderRadius: 12, overflow: "hidden" }),
        [],
    );

    async function save(values: PhraseFormValues) {
        if (!siteId) return;
        setSaving(true);
        setCfgError("");
        try {
            const base = currentCfg || { pre_chat_enabled: false };

            const mergedPhrasesJson = mergePhrases(base.widget_phrases_json, {
                default_customer_name: values.default_customer_name,
                message_placeholder: values.message_placeholder,
                header_title: values.header_title,

                minimize: values.minimize,
                retry: values.retry,
                start_conversation: values.start_conversation,

                name_optional: values.name_optional,
                email_optional: values.email_optional,
                leave_contact_title: values.leave_contact_title,
                leave_contact_ok: values.leave_contact_ok,
                leave_contact_cancel: values.leave_contact_cancel,
                leave_contact_hint: values.leave_contact_hint,
                identity_error: values.identity_error,

                prechat_default_info: values.prechat_default_info,
                prechat_name_label: values.prechat_name_label,
                prechat_email_label: values.prechat_email_label,
                prechat_required_error: values.prechat_required_error,
                prechat_at_least_one_error: values.prechat_at_least_one_error,

                composer_send: values.composer_send,
                composer_enter_content_hint: values.composer_enter_content_hint,

                attach_add_file: values.attach_add_file,
                attach_upload_file: values.attach_upload_file,
                attach_send_screenshot: values.attach_send_screenshot,
                attach_emoji: values.attach_emoji,
                attach_add: values.attach_add,

                no_messages: values.no_messages,
                typing: values.typing,
                unread: values.unread,
            });

            const payload: WidgetConfigDto = {
                ...base,
                widget_language: normalizeWidgetLanguage(values.widget_language),
                widget_phrases_json: mergedPhrasesJson,
                welcome_text: String(values.welcome_text || "").trim() || null,
            };

            const res = await http.put<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`, payload);
            setCurrentCfg(res.data);

            const phrases = parsePhraseJson(res.data?.widget_phrases_json);
            form.setFieldsValue({
                widget_language: normalizeWidgetLanguage(res.data?.widget_language),
                welcome_text: String(res.data?.welcome_text || ""),
                default_customer_name: phrases.default_customer_name || "",
                message_placeholder: phrases.message_placeholder || "",
                header_title: phrases.header_title || "",

                minimize: phrases.minimize || "",
                retry: phrases.retry || "",
                start_conversation: phrases.start_conversation || "",

                name_optional: phrases.name_optional || "",
                email_optional: phrases.email_optional || "",
                leave_contact_title: phrases.leave_contact_title || "",
                leave_contact_ok: phrases.leave_contact_ok || "",
                leave_contact_cancel: phrases.leave_contact_cancel || "",
                leave_contact_hint: phrases.leave_contact_hint || "",
                identity_error: phrases.identity_error || "",

                prechat_default_info: phrases.prechat_default_info || "",
                prechat_name_label: phrases.prechat_name_label || "",
                prechat_email_label: phrases.prechat_email_label || "",
                prechat_required_error: phrases.prechat_required_error || "",
                prechat_at_least_one_error: phrases.prechat_at_least_one_error || "",

                composer_send: phrases.composer_send || "",
                composer_enter_content_hint: phrases.composer_enter_content_hint || "",

                attach_add_file: phrases.attach_add_file || "",
                attach_upload_file: phrases.attach_upload_file || "",
                attach_send_screenshot: phrases.attach_send_screenshot || "",
                attach_emoji: phrases.attach_emoji || "",
                attach_add: phrases.attach_add || "",

                no_messages: phrases.no_messages || "",
                typing: phrases.typing || "",
                unread: phrases.unread || "",
            });
        } catch (e: unknown) {
            setCfgError(errorMessage(e, "save_widget_config_failed"));
        } finally {
            setSaving(false);
        }
    }

    const header = (
        <>
            {!meLoading && !isAdmin ? <Alert type="warning" message={t("widgetLanguage.adminOnlyHint")} showIcon /> : null}
            {sitesError ? <Alert type="error" message={sitesError} showIcon /> : null}
            {cfgError ? <Alert type="error" message={cfgError} showIcon /> : null}
            {snippetError ? <Alert type="error" message={snippetError} showIcon /> : null}
        </>
    );

    const preview = previewSrcDoc ? (
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
    );

    const editor = (
        <Form
            form={form}
            layout="vertical"
            initialValues={{ widget_language: "en" }}
            onFinish={save}
            disabled={cfgLoading || !isAdmin}
        >
            <Card title={t("widgetLanguage.title")}>
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Space wrap>
                        <Typography.Text strong>{t("widgetLanguage.selectSite")}</Typography.Text>
                        <Typography.Text code>{selectedSiteLabel || "-"}</Typography.Text>
                        {sitesLoading ? <Spin size="small" /> : null}
                        {cfgLoading ? <Spin size="small" /> : null}
                        {snippetLoading ? <Spin size="small" /> : null}
                    </Space>

                    <Form.Item label={t("widgetLanguage.language.label")} name="widget_language" style={{ maxWidth: 360 }}>
                        <Select
                            options={[
                                { value: "en", label: t("common.english") },
                                { value: "zh-CN", label: t("common.chinese") },
                            ]}
                        />
                    </Form.Item>

                    <Divider style={{ margin: "8px 0" }} />

                    <Typography.Title level={5} style={{ margin: 0 }}>
                        {t("widgetLanguage.phrases.title")}
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
                        {t("widgetLanguage.phrases.hint")}
                    </Typography.Paragraph>

                    <Card size="small" title={t("widgetLanguage.phrases.sectionWelcome")} style={{ maxWidth: 720 }}>
                        <Form.Item label={t("widgetLanguage.phrases.welcomeText.label")} name="welcome_text">
                            <Input placeholder={t("widgetLanguage.phrases.welcomeText.placeholder")} />
                        </Form.Item>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.defaultCustomerName.label")} name="default_customer_name">
                                    <Input placeholder={t("widgetLanguage.phrases.defaultCustomerName.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.headerTitle.label")} name="header_title">
                                    <Input placeholder={t("widgetLanguage.phrases.headerTitle.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item label={t("widgetLanguage.phrases.messagePlaceholder.label")} name="message_placeholder">
                            <Input placeholder={t("widgetLanguage.phrases.messagePlaceholder.placeholder")} />
                        </Form.Item>
                    </Card>

                    <Divider style={{ margin: "12px 0" }} />

                    <Card size="small" title={t("widgetLanguage.phrases.sectionActions")} style={{ maxWidth: 720 }}>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.minimize.label")} name="minimize">
                                    <Input placeholder={t("widgetLanguage.phrases.minimize.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.retry.label")} name="retry">
                                    <Input placeholder={t("widgetLanguage.phrases.retry.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item label={t("widgetLanguage.phrases.startConversation.label")} name="start_conversation">
                            <Input placeholder={t("widgetLanguage.phrases.startConversation.placeholder")} />
                        </Form.Item>

                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.nameOptional.label")} name="name_optional">
                                    <Input placeholder={t("widgetLanguage.phrases.nameOptional.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.emailOptional.label")} name="email_optional">
                                    <Input placeholder={t("widgetLanguage.phrases.emailOptional.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item label={t("widgetLanguage.phrases.leaveContactTitle.label")} name="leave_contact_title">
                            <Input placeholder={t("widgetLanguage.phrases.leaveContactTitle.placeholder")} />
                        </Form.Item>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.leaveContactOk.label")} name="leave_contact_ok">
                                    <Input placeholder={t("widgetLanguage.phrases.leaveContactOk.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.leaveContactCancel.label")} name="leave_contact_cancel">
                                    <Input placeholder={t("widgetLanguage.phrases.leaveContactCancel.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item label={t("widgetLanguage.phrases.leaveContactHint.label")} name="leave_contact_hint">
                            <Input placeholder={t("widgetLanguage.phrases.leaveContactHint.placeholder")} />
                        </Form.Item>
                        <Form.Item label={t("widgetLanguage.phrases.identityError.label")} name="identity_error">
                            <Input placeholder={t("widgetLanguage.phrases.identityError.placeholder")} />
                        </Form.Item>
                    </Card>

                    <Divider style={{ margin: "12px 0" }} />

                    <Card size="small" title={t("widgetLanguage.phrases.sectionPreChat")} style={{ maxWidth: 720 }}>
                        <Form.Item label={t("widgetLanguage.phrases.preChatDefaultInfo.label")} name="prechat_default_info">
                            <Input placeholder={t("widgetLanguage.phrases.preChatDefaultInfo.placeholder")} />
                        </Form.Item>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.preChatNameLabel.label")} name="prechat_name_label">
                                    <Input placeholder={t("widgetLanguage.phrases.preChatNameLabel.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.preChatEmailLabel.label")} name="prechat_email_label">
                                    <Input placeholder={t("widgetLanguage.phrases.preChatEmailLabel.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.preChatRequiredError.label")} name="prechat_required_error">
                                    <Input placeholder={t("widgetLanguage.phrases.preChatRequiredError.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.preChatAtLeastOneError.label")} name="prechat_at_least_one_error">
                                    <Input placeholder={t("widgetLanguage.phrases.preChatAtLeastOneError.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    <Divider style={{ margin: "12px 0" }} />

                    <Card size="small" title={t("widgetLanguage.phrases.sectionComposer")} style={{ maxWidth: 720 }}>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.composerSend.label")} name="composer_send">
                                    <Input placeholder={t("widgetLanguage.phrases.composerSend.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.composerEnterContentHint.label")} name="composer_enter_content_hint">
                                    <Input placeholder={t("widgetLanguage.phrases.composerEnterContentHint.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    <Divider style={{ margin: "12px 0" }} />

                    <Card size="small" title={t("widgetLanguage.phrases.sectionAttachments")} style={{ maxWidth: 720 }}>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.attachAddFile.label")} name="attach_add_file">
                                    <Input placeholder={t("widgetLanguage.phrases.attachAddFile.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.attachAdd.label")} name="attach_add">
                                    <Input placeholder={t("widgetLanguage.phrases.attachAdd.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.attachUploadFile.label")} name="attach_upload_file">
                                    <Input placeholder={t("widgetLanguage.phrases.attachUploadFile.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.attachSendScreenshot.label")} name="attach_send_screenshot">
                                    <Input placeholder={t("widgetLanguage.phrases.attachSendScreenshot.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.attachEmoji.label")} name="attach_emoji">
                                    <Input placeholder={t("widgetLanguage.phrases.attachEmoji.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    <Divider style={{ margin: "12px 0" }} />

                    <Card size="small" title={t("widgetLanguage.phrases.sectionConversation")} style={{ maxWidth: 720 }}>
                        <Row gutter={12}>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.noMessages.label")} name="no_messages">
                                    <Input placeholder={t("widgetLanguage.phrases.noMessages.placeholder")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={t("widgetLanguage.phrases.typing.label")} name="typing">
                                    <Input placeholder={t("widgetLanguage.phrases.typing.placeholder")} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item label={t("widgetLanguage.phrases.unread.label")} name="unread">
                            <Input placeholder={t("widgetLanguage.phrases.unread.placeholder")} />
                        </Form.Item>
                    </Card>

                    <Divider style={{ margin: "12px 0" }} />

                    <Space>
                        <Button type="primary" htmlType="submit" loading={saving} disabled={!isAdmin}>
                            {t("common.save")}
                        </Button>
                    </Space>
                </Space>
            </Card>
        </Form>
    );

    if (isNarrow) {
        return (
            <div style={{ maxWidth: 1400, margin: "0 auto", padding: 16 }}>
                {header}

                <Row gutter={16} align="stretch" style={{ marginTop: 12 }}>
                    <Col xs={24} lg={16} xl={16}>
                        {editor}
                    </Col>
                    <Col xs={24} lg={8} xl={8}>
                        <Card title={t("widgetLanguage.preview.title")} styles={{ body: { height: 720 } }}>
                            <div style={{ height: "100%", borderRadius: 12, overflow: "hidden" }}>{preview}</div>
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    }

    return (
        <div
            style={{
                padding: 16,
                height: "calc(100vh - 56px)",
                minHeight: "calc(100vh - 56px)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                maxWidth: 1400,
                margin: "0 auto",
            }}
        >
            {header}

            <Layout style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <Layout.Content style={{ minHeight: 0, overflow: "hidden" }}>
                    <div style={{ height: "100%", overflow: "auto", paddingRight: 12 }}>{editor}</div>
                </Layout.Content>

                <Layout.Sider
                    width={560}
                    theme="light"
                    style={{ borderLeft: "1px solid #f0f0f0", overflow: "hidden", height: "100%" }}
                >
                    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                        <div style={{ padding: 12, borderBottom: "1px solid #f0f0f0" }}>
                            <Typography.Text strong>{t("widgetLanguage.preview.title")}</Typography.Text>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: 12 }}>
                            <div style={{ height: "100%", borderRadius: 12, overflow: "hidden" }}>{preview}</div>
                        </div>
                    </div>
                </Layout.Sider>
            </Layout>
        </div>
    );
}
