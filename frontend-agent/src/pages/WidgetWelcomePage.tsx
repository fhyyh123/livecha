import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Divider, Form, Grid, Input, Layout, Row, Select, Space, Spin, Switch, Typography } from "antd";
import { useTranslation } from "react-i18next";

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

type SkillGroupItem = {
    id: string;
    name: string;
    enabled: boolean;
    system_key?: string | null;
    is_fallback?: boolean;
};

type WidgetConfigDto = {
    pre_chat_enabled: boolean;
    pre_chat_fields_json?: string | null;
    theme_color?: string | null;
    welcome_text?: string | null;
    show_welcome_screen?: boolean | null;
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

function escapeAttr(s: string): string {
    return String(s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function appendQueryParams(rawUrl: string, params: Record<string, string>): string {
    if (!rawUrl) return rawUrl;
    let u: URL;
    try {
        u = new URL(rawUrl);
    } catch {
        return rawUrl;
    }

    for (const [k, v] of Object.entries(params || {})) {
        u.searchParams.set(k, v);
    }
    return u.toString();
}

function buildPreviewScriptTagHtml(params: { scriptUrl: string; siteKey: string; embedUrl: string; origin?: string | null; skillGroupId?: string | null }): string {
    const { scriptUrl, siteKey, embedUrl, origin, skillGroupId } = params;

    const parts: string[] = [];
    parts.push("<script");
    parts.push(` src=\"${escapeAttr(scriptUrl)}\"`);
    parts.push(" async");
    parts.push(` data-chatlive-site-key=\"${escapeAttr(siteKey)}\"`);
    parts.push(` data-chatlive-embed-url=\"${escapeAttr(embedUrl)}\"`);
    if (origin) parts.push(` data-chatlive-origin=\"${escapeAttr(origin)}\"`);
    if (skillGroupId) parts.push(` data-chatlive-skill-group-id=\"${escapeAttr(skillGroupId)}\"`);
    parts.push("></script>");

    return parts.join("");
}

function normalizePreviewOriginFromAllowlist(domains: string[], fallbackOrigin: string): string {
    const first = String(domains?.[0] || "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "");

    if (!first) return fallbackOrigin;

    try {
        return new URL(`${window.location.protocol}//${first}`).origin;
    } catch {
        return fallbackOrigin;
    }
}

export function WidgetWelcomePage() {
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

    const [skillGroupsLoading, setSkillGroupsLoading] = useState(false);
    const [skillGroupsError, setSkillGroupsError] = useState<string>("");
    const [skillGroups, setSkillGroups] = useState<SkillGroupItem[]>([]);
    const [skillGroupId, setSkillGroupId] = useState<string>("");

    const [allowlistDomains, setAllowlistDomains] = useState<string[]>([]);

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

    const [currentCfg, setCurrentCfg] = useState<WidgetConfigDto | null>(null);

    const [form] = Form.useForm<Pick<WidgetConfigDto, "welcome_text" | "show_welcome_screen" | "show_logo">>();

    const watchWelcomeText = Form.useWatch("welcome_text", form);
    const watchShowWelcomeScreen = Form.useWatch("show_welcome_screen", form);

    const selectedSite = useMemo(() => sites.find((x) => x.id === siteId) || sites[0] || null, [siteId, sites]);

    const selectedGroup = useMemo(
        () => (skillGroupId ? skillGroups.find((g) => g.id === skillGroupId) || null : null),
        [skillGroupId, skillGroups],
    );

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

        let mounted = true;
        setSkillGroupsLoading(true);
        setSkillGroupsError("");

        http
            .get<SkillGroupItem[]>("/api/v1/skill-groups")
            .then((res) => {
                if (!mounted) return;
                setSkillGroups(Array.isArray(res.data) ? res.data : []);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setSkillGroupsError(errorMessage(e, "load_skill_groups_failed"));
                setSkillGroups([]);
            })
            .finally(() => {
                if (!mounted) return;
                setSkillGroupsLoading(false);
            });

        return () => {
            mounted = false;
        };
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
                setCurrentCfg(cfg);
                form.setFieldsValue({
                    welcome_text: cfg.welcome_text ?? null,
                    show_welcome_screen: cfg.show_welcome_screen ?? true,
                    show_logo: cfg.show_logo ?? true,
                });
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setCfgError(errorMessage(e, "load_widget_config_failed"));
                setCurrentCfg(null);
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

        // Group-level welcome override mode
        if (!skillGroupId) {
            if (!currentCfg) return;
            form.setFieldsValue({
                welcome_text: currentCfg.welcome_text ?? null,
                show_welcome_screen: currentCfg.show_welcome_screen ?? true,
                show_logo: currentCfg.show_logo ?? true,
            });
            return;
        }

        let mounted = true;
        setCfgLoading(true);
        setCfgError("");

        http
            .get<{ skill_group_id: string; welcome_text?: string | null; show_welcome_screen?: boolean | null }>(
                `/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config/welcome-group?skill_group_id=${encodeURIComponent(skillGroupId)}`,
            )
            .then((res) => {
                if (!mounted) return;
                form.setFieldsValue({
                    welcome_text: res.data?.welcome_text ?? null,
                    show_welcome_screen: typeof res.data?.show_welcome_screen === "boolean" ? res.data.show_welcome_screen : true,
                    show_logo: currentCfg?.show_logo ?? true,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, meLoading, siteId, skillGroupId]);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;

        if (!siteId) {
            setAllowlistDomains([]);
            return;
        }

        let mounted = true;
        http
            .get<string[]>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/allowlist`)
            .then((res) => {
                if (!mounted) return;
                setAllowlistDomains(Array.isArray(res.data) ? res.data : []);
            })
            .catch(() => {
                if (!mounted) return;
                setAllowlistDomains([]);
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

    async function save(values: Pick<WidgetConfigDto, "welcome_text" | "show_welcome_screen" | "show_logo">) {
        if (!siteId) return;
        if (!currentCfg) return;

        setSaving(true);
        setCfgError("");
        try {
            if (skillGroupId) {
                const res = await http.put<{ skill_group_id: string; welcome_text?: string | null; show_welcome_screen?: boolean | null }>(
                    `/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config/welcome-group?skill_group_id=${encodeURIComponent(skillGroupId)}`,
                    {
                        skill_group_id: skillGroupId,
                        welcome_text: values.welcome_text ?? null,
                        show_welcome_screen: typeof values.show_welcome_screen === "boolean" ? values.show_welcome_screen : true,
                    },
                );

                form.setFieldsValue({
                    welcome_text: res.data?.welcome_text ?? null,
                    show_welcome_screen: typeof res.data?.show_welcome_screen === "boolean" ? res.data.show_welcome_screen : true,
                    show_logo: currentCfg.show_logo ?? true,
                });
                return;
            }

            const payload: WidgetConfigDto = {
                ...currentCfg,
                welcome_text: values.welcome_text ?? null,
                show_welcome_screen: typeof values.show_welcome_screen === "boolean" ? values.show_welcome_screen : null,
                show_logo: typeof values.show_logo === "boolean" ? values.show_logo : currentCfg.show_logo,
            };

            const res = await http.put<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`, payload);
            setCurrentCfg(res.data);
            form.setFieldsValue({
                welcome_text: res.data.welcome_text ?? null,
                show_welcome_screen: res.data.show_welcome_screen ?? true,
                show_logo: res.data.show_logo ?? true,
            });
        } catch (e: unknown) {
            setCfgError(errorMessage(e, "save_widget_config_failed"));
        } finally {
            setSaving(false);
        }
    }

    async function reloadConfig() {
        if (!siteId) return;
        const res = await http.get<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`);
        setCurrentCfg(res.data);
        form.setFieldsValue({
            welcome_text: res.data.welcome_text ?? null,
            show_welcome_screen: res.data.show_welcome_screen ?? true,
            show_logo: res.data.show_logo ?? true,
        });
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

    const previewConfig = useMemo(() => {
        const asStr = (x: unknown): string | undefined => {
            const s = String(x ?? "").trim();
            return s ? s : undefined;
        };
        const asBool = (x: unknown): boolean | undefined => (typeof x === "boolean" ? x : undefined);

        return {
            skillGroupId: asStr(skillGroupId),
            themeMode: asStr(currentCfg?.theme_mode),
            welcomeText: asStr(watchWelcomeText),
            showWelcomeScreen: asBool(watchShowWelcomeScreen),
        };
    }, [currentCfg?.theme_mode, skillGroupId, watchShowWelcomeScreen, watchWelcomeText]);

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
        const previewOrigin = normalizePreviewOriginFromAllowlist(allowlistDomains, window.location.origin);

        const scriptTag = buildPreviewScriptTagHtml({
            scriptUrl: snippet.widget_script_url,
            siteKey: selectedSite.public_key,
            embedUrl: previewEmbedUrl,
            origin: previewOrigin,
            skillGroupId: skillGroupId || null,
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
      <div class="topbar">${escapeAttr(t("widgetWelcome.preview.fakePage"))}</div>
      <div class="content"></div>
    </div>
    ${scriptTag}
    <script>${bridge}</script>
  </body>
</html>`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowlistDomains, selectedSite?.public_key, snippet?.embed_url, snippet?.widget_script_url, previewReload, t]);

    const previewIframeStyle: CSSProperties = useMemo(
        () => ({ width: "100%", height: "100%", border: 0, borderRadius: 12, overflow: "hidden" }),
        [],
    );

    const editor = (
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
                    initialValues={{ show_welcome_screen: true, show_logo: true }}
                >
                    <Form.Item label={t("widgetWelcome.setupForSite")}>
                        <Select
                            value={siteId}
                            onChange={(v) => {
                                setSiteId(String(v || ""));
                                setSkillGroupId("");
                            }}
                            loading={sitesLoading}
                            options={sites.map((s) => ({ value: s.id, label: s.name }))}
                            placeholder={t("widgetWelcome.selectSite")}
                        />
                    </Form.Item>

                    <Form.Item label={t("widgetWelcome.setupForGroup")}>
                        <Select
                            value={skillGroupId}
                            onChange={(v) => setSkillGroupId(String(v || ""))}
                            loading={skillGroupsLoading}
                            options={[
                                { value: "", label: t("widgetWelcome.allGroups") },
                                ...skillGroups.map((g) => ({ value: g.id, label: g.name })),
                            ]}
                            placeholder={t("widgetWelcome.allGroups")}
                        />
                        {skillGroupsError ? (
                            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
                                {skillGroupsError}
                            </Typography.Text>
                        ) : null}
                        {selectedGroup ? (
                            <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
                                {t("widgetWelcome.groupActiveHint", { name: selectedGroup.name })}
                            </Typography.Text>
                        ) : null}
                    </Form.Item>

                    <Collapse
                        accordion
                        defaultActiveKey={"changeSettings"}
                        items={[
                            {
                                key: "customizeHeader",
                                label: t("widgetWelcome.sections.customizeHeader"),
                                children: (
                                    <>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                            <Typography.Text>{t("widgetWelcome.showLogo")}</Typography.Text>
                                            <Form.Item name="show_logo" valuePropName="checked" noStyle>
                                                <Switch disabled={!!skillGroupId} />
                                            </Form.Item>
                                        </div>

                                        <div style={{ marginTop: 12 }}>
                                            <Space wrap>
                                                <input
                                                    ref={logoFileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: "none" }}
                                                    onChange={(ev) => {
                                                        const f = ev.currentTarget.files?.[0];
                                                        if (f) void uploadLogo(f);
                                                        ev.currentTarget.value = "";
                                                    }}
                                                />
                                                <Button
                                                    onClick={() => logoFileInputRef.current?.click()}
                                                    loading={logoUploading}
                                                    disabled={!isAdmin || !siteId || !!skillGroupId}
                                                >
                                                    {t("widgetWelcome.uploadLogo")}
                                                </Button>
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    {t("widgetWelcome.logoHint")}
                                                </Typography.Text>
                                            </Space>
                                        </div>

                                        {logoUploadError ? <Alert type="warning" showIcon message={logoUploadError} style={{ marginTop: 12 }} /> : null}

                                        <div style={{ marginTop: 16 }}>
                                            <Form.Item label={t("widgetWelcome.welcomeText")} name="welcome_text" style={{ marginBottom: 0 }}>
                                                <Input.TextArea
                                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                                    placeholder={t("widgetWelcome.welcomeTextPlaceholder")}
                                                />
                                            </Form.Item>
                                        </div>
                                    </>
                                ),
                            },
                            {
                                key: "manageContent",
                                label: t("widgetWelcome.sections.manageContent"),
                                children: <></>,
                            },
                            {
                                key: "changeSettings",
                                label: t("widgetWelcome.sections.changeSettings"),
                                children: (
                                    <>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                            <Typography.Text>{t("widgetWelcome.showWelcomeScreen")}</Typography.Text>
                                            <Form.Item name="show_welcome_screen" valuePropName="checked" noStyle>
                                                <Switch />
                                            </Form.Item>
                                        </div>
                                        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                                            {t("widgetWelcome.showWelcomeScreenHint")}
                                        </Typography.Text>
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
                        <Button
                            onClick={() => {
                                if (!siteId) return;
                                if (!currentCfg) return;
                                if (!skillGroupId) {
                                    form.setFieldsValue({
                                        welcome_text: currentCfg.welcome_text ?? null,
                                        show_welcome_screen: currentCfg.show_welcome_screen ?? true,
                                        show_logo: currentCfg.show_logo ?? true,
                                    });
                                    return;
                                }

                                setCfgLoading(true);
                                setCfgError("");
                                http
                                    .get<{ skill_group_id: string; welcome_text?: string | null; show_welcome_screen?: boolean | null }>(
                                        `/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config/welcome-group?skill_group_id=${encodeURIComponent(skillGroupId)}`,
                                    )
                                    .then((res) => {
                                        form.setFieldsValue({
                                            welcome_text: res.data?.welcome_text ?? null,
                                            show_welcome_screen:
                                                typeof res.data?.show_welcome_screen === "boolean" ? res.data.show_welcome_screen : true,
                                            show_logo: currentCfg.show_logo ?? true,
                                        });
                                    })
                                    .catch((e: unknown) => setCfgError(errorMessage(e, "load_widget_config_failed")))
                                    .finally(() => setCfgLoading(false));
                            }}
                            disabled={saving || !isAdmin}
                        >
                            {t("common.reset")}
                        </Button>
                    </Space>
                </Form>
            </Space>
        </Card>
    );

    const previewIframe = previewSrcDoc ? (
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

    const header = (
        <>
            <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 0 }}>
                {t("widgetWelcome.title")}
            </Typography.Title>

            {!meLoading && !isAdmin ? <Alert type="warning" message={t("widgetWelcome.adminOnlyHint")} showIcon /> : null}
            {sitesError ? <Alert type="error" message={sitesError} showIcon /> : null}
            {cfgError ? <Alert type="error" message={cfgError} showIcon /> : null}
            {snippetError ? <Alert type="error" message={snippetError} showIcon /> : null}
        </>
    );

    if (isNarrow) {
        return (
            <div style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
                {header}

                <Row gutter={16} align="top" style={{ marginTop: 12 }}>
                    <Col xs={24} lg={12}>
                        {editor}
                    </Col>
                    <Col xs={24} lg={12}>
                        <Card
                            title={t("widgetWelcome.preview.title")}
                            extra={
                                <Button onClick={() => setPreviewReload((x) => x + 1)} disabled={!previewSrcDoc}>
                                    {t("widgetWelcome.preview.reload")}
                                </Button>
                            }
                        >
                            <div style={{ height: 720 }}>{previewIframe}</div>
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
            }}
        >
            {header}

            <Layout style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <Layout.Content style={{ minHeight: 0, overflow: "hidden" }}>
                    <div style={{ height: "100%", overflow: "auto", paddingRight: 12 }}>{editor}</div>
                </Layout.Content>

                <Layout.Sider width={560} theme="light" style={{ borderLeft: "1px solid #f0f0f0", overflow: "hidden", height: "100%" }}>
                    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                        <div style={{ padding: 12, borderBottom: "1px solid #f0f0f0" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }} align="center">
                                <Typography.Text strong>{t("widgetWelcome.preview.title")}</Typography.Text>
                                <Button onClick={() => setPreviewReload((x) => x + 1)} disabled={!previewSrcDoc}>
                                    {t("widgetWelcome.preview.reload")}
                                </Button>
                            </Space>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: 12 }}>
                            <div style={{ height: "100%", borderRadius: 12, overflow: "hidden" }}>{previewIframe}</div>
                        </div>
                    </div>
                </Layout.Sider>
            </Layout>
        </div>
    );
}
