import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Divider, Form, Input, InputNumber, Radio, Row, Select, Space, Spin, Switch, Typography } from "antd";
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

function buildPreviewScriptTagHtml(params: {
    scriptUrl: string;
    siteKey: string;
    embedUrl: string;
    values: Partial<WidgetConfigDto> | null | undefined;
}): string {
    const { scriptUrl, siteKey, embedUrl, values } = params;
    const v = values || {};

    const themeColor = String(v.theme_color || "").trim();
    const cookieDomain = String(v.cookie_domain || "").trim();
    const cookieSameSite = String(v.cookie_samesite || "").trim();
    const position = String(v.position || "").trim();
    const launcherText = String(v.launcher_text || "").trim();
    const launcherStyle = String(v.launcher_style || "").trim();
    const themeMode = String(v.theme_mode || "").trim();
    const colorSettingsMode = String(v.color_settings_mode || "").trim();
    const colorOverridesJson = String(v.color_overrides_json || "").trim();
    const autoHeightMode = String(v.auto_height_mode || "").trim();

    const zIndex = v.z_index;
    const width = v.width;
    const height = v.height;
    const minHeight = v.min_height;
    const maxHeightRatio = v.max_height_ratio;
    const mobileBreakpoint = v.mobile_breakpoint;
    const mobileFullscreen = v.mobile_fullscreen;
    const offsetX = v.offset_x;
    const offsetY = v.offset_y;
    const debug = v.debug;

    // Backward-compatible default: keep auto-height enabled unless explicitly disabled.
    const autoHeightAttr = v.auto_height === false ? "false" : "true";

    const lines: string[] = [];
    lines.push("<script");
    lines.push("  defer");
    lines.push(`  src=\"${escapeAttr(scriptUrl)}\"`);
    lines.push(`  data-chatlive-site-key=\"${escapeAttr(siteKey)}\"`);
    lines.push(`  data-chatlive-embed-url=\"${escapeAttr(embedUrl)}\"`);
    lines.push(`  data-chatlive-auto-height=\"${autoHeightAttr}\"`);

    if (themeColor) lines.push(`  data-chatlive-theme-color=\"${escapeAttr(themeColor)}\"`);
    if (launcherStyle) lines.push(`  data-chatlive-launcher-style=\"${escapeAttr(launcherStyle)}\"`);
    if (themeMode) lines.push(`  data-chatlive-theme-mode=\"${escapeAttr(themeMode)}\"`);
    if (colorSettingsMode) lines.push(`  data-chatlive-color-settings-mode=\"${escapeAttr(colorSettingsMode)}\"`);
    if (colorOverridesJson) lines.push(`  data-chatlive-color-overrides-json=\"${escapeAttr(colorOverridesJson)}\"`);
    if (position) lines.push(`  data-chatlive-position=\"${escapeAttr(position)}\"`);
    if (typeof zIndex === "number" && Number.isFinite(zIndex)) lines.push(`  data-chatlive-z-index=\"${zIndex}\"`);
    if (launcherText) lines.push(`  data-chatlive-launcher-text=\"${escapeAttr(launcherText)}\"`);
    if (typeof width === "number" && Number.isFinite(width)) lines.push(`  data-chatlive-width=\"${width}\"`);
    if (typeof height === "number" && Number.isFinite(height)) lines.push(`  data-chatlive-height=\"${height}\"`);
    if (autoHeightMode) lines.push(`  data-chatlive-auto-height-mode=\"${escapeAttr(autoHeightMode)}\"`);
    if (typeof minHeight === "number" && Number.isFinite(minHeight)) lines.push(`  data-chatlive-min-height=\"${minHeight}\"`);
    if (typeof maxHeightRatio === "number" && Number.isFinite(maxHeightRatio)) lines.push(`  data-chatlive-max-height-ratio=\"${maxHeightRatio}\"`);
    if (typeof mobileBreakpoint === "number" && Number.isFinite(mobileBreakpoint)) lines.push(`  data-chatlive-mobile-breakpoint=\"${mobileBreakpoint}\"`);
    if (typeof mobileFullscreen === "boolean") lines.push(`  data-chatlive-mobile-fullscreen=\"${mobileFullscreen ? "true" : "false"}\"`);
    if (typeof offsetX === "number" && Number.isFinite(offsetX)) lines.push(`  data-chatlive-offset-x=\"${offsetX}\"`);
    if (typeof offsetY === "number" && Number.isFinite(offsetY)) lines.push(`  data-chatlive-offset-y=\"${offsetY}\"`);
    if (typeof debug === "boolean") lines.push(`  data-chatlive-debug=\"${debug ? "true" : "false"}\"`);
    if (cookieDomain) lines.push(`  data-chatlive-cookie-domain=\"${escapeAttr(cookieDomain)}\"`);
    if (cookieSameSite) lines.push(`  data-chatlive-cookie-samesite=\"${escapeAttr(cookieSameSite)}\"`);

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

    const [form] = Form.useForm<WidgetConfigDto>();

    const selectedSite = useMemo(() => sites.find((x) => x.id === siteId) || sites[0] || null, [siteId, sites]);

    const selectedSiteLabel = useMemo(() => {
        if (!selectedSite) return "";
        return `${selectedSite.name} (${selectedSite.public_key})`;
    }, [selectedSite]);

    const siteOptions = useMemo(
        () => sites.map((s) => ({ value: s.id, label: `${s.name} (${s.public_key})` })),
        [sites],
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

        const previewSrcDoc = useMemo(() => {
                if (!selectedSite?.public_key) return null;
                if (!snippet?.widget_script_versioned_url) return null;
                if (!snippet?.embed_url) return null;

                const scriptTag = buildPreviewScriptTagHtml({
                        scriptUrl: snippet.widget_script_versioned_url,
                        siteKey: selectedSite.public_key,
                        embedUrl: snippet.embed_url,
                        values: watchAll,
                });

                const pageBg = String(watchThemeMode || "").trim().toLowerCase() === "dark" ? "#111827" : "#f5f5f5";
                const css = `
                    html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
                    .page { height: 100%; background: ${pageBg}; position: relative; overflow: hidden; }
                        .topbar { position: absolute; left: 16px; top: 16px; right: 16px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.85);
                                            display: flex; align-items: center; padding: 0 12px; color: #666; font-size: 12px; }
                        .content { position: absolute; left: 16px; right: 16px; top: 68px; bottom: 16px; border-radius: 14px;
                                             background: rgba(255,255,255,0.6); }
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
    </body>
</html>`;
                // Remount is handled by iframe key.
                // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [selectedSite?.public_key, snippet?.embed_url, snippet?.widget_script_versioned_url, watchAll, watchThemeMode, previewReload]);

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
                            <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
                                <Space wrap>
                                    <Typography.Text strong>{t("widgetCustomize.selectSite")}</Typography.Text>
                                    {sitesLoading ? <Spin size="small" /> : null}
                                    {cfgLoading ? <Spin size="small" /> : null}
                                    {snippetLoading ? <Spin size="small" /> : null}
                                </Space>

                                <Select
                                    style={{ minWidth: 320 }}
                                    value={siteId || undefined}
                                    options={siteOptions}
                                    onChange={(v) => setSiteId(String(v || ""))}
                                    placeholder={t("widgetCustomize.selectSitePlaceholder")}
                                    disabled={sitesLoading || !isAdmin}
                                />
                            </Space>

                            <Typography.Text type="secondary">{selectedSiteLabel || "-"}</Typography.Text>

                            <Form
                                form={form}
                                layout="vertical"
                                onFinish={save}
                                disabled={cfgLoading || !isAdmin}
                            >
                                <Form.Item name="pre_chat_enabled" hidden valuePropName="checked">
                                    <Switch />
                                </Form.Item>

                                <Collapse
                                    defaultActiveKey={["install", "appearance", "position"]}
                                    items={[
                                        {
                                            key: "install",
                                            label: t("widgetCustomize.sections.install"),
                                            children: (
                                                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                                    <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                                                        {t("widgetCustomize.install.hint")}
                                                    </Typography.Paragraph>

                                                    <Input.TextArea
                                                        value={snippet?.snippet_html || ""}
                                                        rows={6}
                                                        readOnly
                                                        placeholder={t("widgetCustomize.install.snippetPlaceholder")}
                                                    />
                                                    <Space wrap>
                                                        <Button
                                                            onClick={async () => {
                                                                const txt = snippet?.snippet_html || "";
                                                                if (!txt) return;
                                                                try {
                                                                    await navigator.clipboard.writeText(txt);
                                                                } catch {
                                                                    // ignore
                                                                }
                                                            }}
                                                            disabled={!snippet?.snippet_html}
                                                        >
                                                            {t("widgetCustomize.install.copy")}
                                                        </Button>
                                                    </Space>

                                                    {snippet ? (
                                                        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                                            {t("widgetCustomize.install.script")} {snippet.widget_script_versioned_url}
                                                        </Typography.Paragraph>
                                                    ) : null}
                                                </Space>
                                            ),
                                        },
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
                                                                    <div
                                                                        style={{
                                                                            width: 56,
                                                                            height: 20,
                                                                            borderRadius: 10,
                                                                            border: "1px solid rgba(0,0,0,0.12)",
                                                                            background: "rgba(0,0,0,0.04)",
                                                                        }}
                                                                    />
                                                                }
                                                            />
                                                            <Tile
                                                                selected={String(watchLauncherStyle || DEFAULTS.launcher_style) === "bubble"}
                                                                label={t("widgetCustomize.appearance.minimizedBubble")}
                                                                onClick={() => form.setFieldsValue({ launcher_style: "bubble" })}
                                                                icon={
                                                                    <div
                                                                        style={{
                                                                            width: 34,
                                                                            height: 34,
                                                                            borderRadius: 999,
                                                                            border: "1px solid rgba(0,0,0,0.12)",
                                                                            background: "rgba(0,0,0,0.04)",
                                                                        }}
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

                                                    <Form.Item label={t("widgetCustomize.widgetConfig.welcomeText.label")} name="welcome_text">
                                                        <Input.TextArea
                                                            placeholder={t("widgetCustomize.widgetConfig.welcomeText.placeholder")}
                                                            autoSize={{ minRows: 2, maxRows: 4 }}
                                                        />
                                                    </Form.Item>

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
                                                    <Typography.Text strong>{t("widgetCustomize.cookieStrategy.title")}</Typography.Text>
                                                    <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                                                        {t("widgetCustomize.cookieStrategy.hint")}
                                                    </Typography.Paragraph>

                                                    <Form.Item
                                                        label={t("widgetCustomize.cookieDomain.label")}
                                                        name="cookie_domain"
                                                        tooltip={t("widgetCustomize.cookieDomain.tooltip")}
                                                    >
                                                        <Input placeholder={t("widgetCustomize.cookieDomain.placeholder")} />
                                                    </Form.Item>

                                                    <Form.Item
                                                        label={t("widgetCustomize.cookieSameSite.label")}
                                                        name="cookie_samesite"
                                                        tooltip={t("widgetCustomize.cookieSameSite.tooltip")}
                                                    >
                                                        <Select
                                                            allowClear
                                                            placeholder={t("widgetCustomize.cookieSameSite.placeholder")}
                                                            options={[
                                                                { value: "Lax", label: "Lax" },
                                                                { value: "Strict", label: "Strict" },
                                                                { value: "None", label: "None" },
                                                            ]}
                                                        />
                                                    </Form.Item>

                                                    <Divider style={{ margin: "12px 0" }} />

                                                    <Form.Item label={t("widgetCustomize.fields.debug")} name="debug" valuePropName="checked">
                                                        <Switch />
                                                    </Form.Item>
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
