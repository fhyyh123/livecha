import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Collapse, Row, Col, Select, Space, Spin, Tag, Typography, notification } from "antd";
import { CheckCircleFilled, CopyOutlined, ReloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type SiteItem = {
    id: string;
    name: string;
    public_key: string;
    status: string;
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

type InstallStatusDto = {
    installed: boolean;
    last_seen_at?: string | null;
    last_origin?: string | null;
    last_page_url?: string | null;
};

export function SitesPage() {
    const { t } = useTranslation();
    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    const [sites, setSites] = useState<SiteItem[]>([]);
    const [siteId, setSiteId] = useState<string>("");

    const [snippet, setSnippet] = useState<WidgetSnippetResponse | null>(null);

    const [installStatus, setInstallStatus] = useState<InstallStatusDto | null>(null);
    const [installStatusLoading, setInstallStatusLoading] = useState(false);
    const [installStatusError, setInstallStatusError] = useState<string>("");

    const htmlSnippet = snippet?.snippet_html || "";
    const spaLoaderSnippet = useMemo(() => {
        if (!snippet) return "";
        const cookieDomain = snippet.cookie_domain || "";
        const cookieSameSite = snippet.cookie_samesite || "";
        return [
            `// ${t("sites.spaSnippet.comment1")}\n// ${t("sites.spaSnippet.comment2")}`,
            "(function () {",
            "  if (window.ChatLiveWidget) {",
            "    window.ChatLiveWidget.init({",
            `      siteKey: ${JSON.stringify(snippet.site_key)},`,
            `      embedUrl: ${JSON.stringify(snippet.embed_url)},`,
            ...(cookieDomain ? [`      cookieDomain: ${JSON.stringify(cookieDomain)},`] : []),
            ...(cookieSameSite ? [`      cookieSameSite: ${JSON.stringify(cookieSameSite)},`] : []),
            "      autoHeight: true,",
            "    });",
            "    return;",
            "  }",
            "  var s = document.createElement('script');",
            `  s.src = ${JSON.stringify(snippet.widget_script_versioned_url)};`,
            "  s.defer = true;",
            `  s.dataset.chatliveSiteKey = ${JSON.stringify(snippet.site_key)};`,
            `  s.dataset.chatliveEmbedUrl = ${JSON.stringify(snippet.embed_url)};`,
            "  s.dataset.chatliveAutoHeight = 'true';",
            ...(cookieDomain ? [`  s.dataset.chatliveCookieDomain = ${JSON.stringify(cookieDomain)};`] : []),
            ...(cookieSameSite ? [`  s.dataset.chatliveCookieSamesite = ${JSON.stringify(cookieSameSite)};`] : []),
            "  s.onload = function () {",
            "    if (window.ChatLiveWidget) window.ChatLiveWidget.init({" +
                " siteKey: s.dataset.chatliveSiteKey," +
                " embedUrl: s.dataset.chatliveEmbedUrl," +
                (cookieDomain ? " cookieDomain: s.dataset.chatliveCookieDomain," : "") +
                (cookieSameSite ? " cookieSameSite: s.dataset.chatliveCookieSamesite," : "") +
                " autoHeight: true" +
                " });",
            "  };",
            "  document.head.appendChild(s);",
            "})();",
        ].join("\n");
    }, [snippet, t]);

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
        setLoading(true);
        setError("");
        http.get<SiteItem[]>("/api/v1/admin/sites")
            .then((res) => {
                if (!mounted) return;
                const list = res.data;
                setSites(list || []);
                if (list?.length) setSiteId((prev) => prev || list[0]!.id);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setError(errorMessage(e, "load_sites_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
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
        setLoading(true);
        setError("");
        setSnippet(null);
        setInstallStatusError("");
        setInstallStatus(null);

        http.get<WidgetSnippetResponse>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget/snippet`)
            .then((res) => {
                if (!mounted) return;
                setSnippet(res.data);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setError(errorMessage(e, "load_snippet_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
            });

        setInstallStatusLoading(true);
        http.get<InstallStatusDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/install-status`)
            .then((res) => {
                if (!mounted) return;
                setInstallStatus(res.data);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setInstallStatusError(errorMessage(e, "load_install_status_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setInstallStatusLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [siteId, isAdmin, meLoading]);

    async function refreshInstallStatus() {
        if (!siteId) return;
        setInstallStatusLoading(true);
        setInstallStatusError("");
        try {
            const res = await http.get<InstallStatusDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/install-status`);
            setInstallStatus(res.data);
        } catch (e: unknown) {
            setInstallStatusError(errorMessage(e, "load_install_status_failed"));
        } finally {
            setInstallStatusLoading(false);
        }
    }

    async function copyToClipboard(text: string, copiedMessage: string) {
        const v = String(text || "");
        if (!v) return;
        try {
            await navigator.clipboard.writeText(v);
            notification.success({
                message: copiedMessage,
                placement: "bottomRight",
                duration: 2,
            });
        } catch {
            notification.error({
                message: t("sites.copyFailed"),
                description: t("sites.copyFailedDesc"),
                placement: "bottomRight",
                duration: 2,
            });
        }
    }

    const installed = Boolean(installStatus?.installed);

    return (
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: 24 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 16,
                }}
            >
                <div style={{ minWidth: 320 }}>
                    <Typography.Title level={2} style={{ margin: 0, lineHeight: 1.15 }}>
                        {t("sites.title")}
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                        {t("sites.subtitle")}
                    </Typography.Paragraph>
                </div>

                <div style={{ minWidth: 360 }}>
                    <Typography.Text type="secondary">{t("sites.selectSite")}</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                        <Select
                            style={{ width: "100%", minWidth: 360 }}
                            placeholder={t("sites.selectSitePlaceholder")}
                            options={siteOptions}
                            value={siteId || undefined}
                            onChange={(v) => setSiteId(v)}
                        />
                    </div>
                </div>
            </div>

            {!meLoading && !isAdmin ? (
                <Alert type="warning" message={t("sites.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
            ) : null}

            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}

            {loading ? (
                <div style={{ padding: 24 }}>
                    <Spin />
                </div>
            ) : null}

            {snippet ? (
                <Row gutter={[16, 16]}>
                    <Col xs={24} lg={16}>
                        <Card
                            title={t("sites.manualInstall.title")}
                            extra={
                                <Button
                                    type="primary"
                                    icon={<CopyOutlined />}
                                    onClick={() => void copyToClipboard(htmlSnippet, t("sites.copied"))}
                                    disabled={!htmlSnippet}
                                >
                                    {t("sites.copyCode")}
                                </Button>
                            }
                        >
                            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                                {t("sites.manualInstall.desc")}{" "}
                                <Typography.Text code>{"<head>"}</Typography.Text> / <Typography.Text code>{"<body>"}</Typography.Text>
                            </Typography.Paragraph>

                            <div
                                style={{
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 12,
                                    padding: 12,
                                }}
                            >
                                <pre
                                    style={{
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                        fontFamily:
                                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                                        fontSize: 12,
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {htmlSnippet}
                                </pre>
                            </div>

                            <div style={{ marginTop: 16 }}>
                                <Collapse
                                    items={[
                                        {
                                            key: "advanced",
                                            label: t("sites.advanced.title"),
                                            children: (
                                                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                                    <div>
                                                        <Typography.Text strong>{t("sites.advanced.scriptUrls")}</Typography.Text>
                                                        <div style={{ marginTop: 8 }}>
                                                            <Typography.Paragraph style={{ marginBottom: 6 }}>
                                                                <Typography.Text type="secondary">
                                                                    {t("sites.advanced.scriptRecommended")}
                                                                </Typography.Text>{" "}
                                                                <Typography.Text code>{snippet.widget_script_versioned_url}</Typography.Text>
                                                            </Typography.Paragraph>
                                                            <Typography.Paragraph style={{ marginBottom: 6 }}>
                                                                <Typography.Text type="secondary">{t("sites.advanced.scriptStable")}</Typography.Text>{" "}
                                                                <Typography.Text code>{snippet.widget_script_url}</Typography.Text>
                                                            </Typography.Paragraph>
                                                            <Typography.Paragraph style={{ marginBottom: 0 }}>
                                                                <Typography.Text type="secondary">{t("sites.advanced.embedUrl")}</Typography.Text>{" "}
                                                                <Typography.Text code>{snippet.embed_url}</Typography.Text>
                                                            </Typography.Paragraph>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                                            <Typography.Text strong>{t("sites.advanced.spaInstall")}</Typography.Text>
                                                            <Button
                                                                icon={<CopyOutlined />}
                                                                onClick={() => void copyToClipboard(spaLoaderSnippet, t("sites.copied"))}
                                                                disabled={!spaLoaderSnippet}
                                                            >
                                                                {t("sites.advanced.copySpa")}
                                                            </Button>
                                                        </div>
                                                        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 8 }}>
                                                            {t("sites.advanced.spaHint")}
                                                        </Typography.Paragraph>
                                                        <div
                                                            style={{
                                                                background: "#f8fafc",
                                                                border: "1px solid #e2e8f0",
                                                                borderRadius: 12,
                                                                padding: 12,
                                                            }}
                                                        >
                                                            <pre
                                                                style={{
                                                                    margin: 0,
                                                                    whiteSpace: "pre-wrap",
                                                                    wordBreak: "break-word",
                                                                    fontFamily:
                                                                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                                                                    fontSize: 12,
                                                                    lineHeight: 1.5,
                                                                }}
                                                            >
                                                                {spaLoaderSnippet}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={8}>
                        <Card
                            title={
                                <Space size={8}>
                                    <span>{t("sites.statusCard.title")}</span>
                                    <Tag color={installed ? "green" : "default"} icon={installed ? <CheckCircleFilled /> : undefined}>
                                        {installed ? t("sites.statusCard.installed") : t("sites.statusCard.notInstalled")}
                                    </Tag>
                                </Space>
                            }
                            extra={
                                <Button
                                    icon={<ReloadOutlined />}
                                    onClick={() => void refreshInstallStatus()}
                                    loading={installStatusLoading}
                                >
                                    {t("sites.statusCard.refresh")}
                                </Button>
                            }
                        >
                            {installStatusError ? (
                                <Alert type="error" message={installStatusError} showIcon style={{ marginBottom: 12 }} />
                            ) : null}

                            <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                <div>
                                    <Typography.Text type="secondary">{t("sites.statusCard.lastSeenAt")}</Typography.Text>
                                    <div style={{ marginTop: 6 }}>
                                        <Typography.Text code>
                                            {installStatus?.last_seen_at ? new Date(installStatus.last_seen_at).toLocaleString() : "-"}
                                        </Typography.Text>
                                    </div>
                                </div>

                                <div>
                                    <Typography.Text type="secondary">{t("sites.statusCard.origin")}</Typography.Text>
                                    <div style={{ marginTop: 6 }}>
                                        <Typography.Text code>{installStatus?.last_origin || "-"}</Typography.Text>
                                    </div>
                                </div>

                                <div>
                                    <Typography.Text type="secondary">{t("sites.statusCard.page")}</Typography.Text>
                                    <div style={{ marginTop: 6 }}>
                                        <Typography.Text code>{installStatus?.last_page_url || "-"}</Typography.Text>
                                    </div>
                                </div>
                            </Space>

                            <div style={{ marginTop: 16 }}>
                                <Typography.Text type="secondary">{t("sites.verifyHint")}</Typography.Text>
                                <div style={{ marginTop: 8 }}>
                                    <Typography.Text code>/chatlive/ping.gif</Typography.Text>
                                </div>
                            </div>
                        </Card>

                        <Card title={t("sites.help.title")} style={{ marginTop: 16 }}>
                            <Space direction="vertical" size={8}>
                                <Link to="/settings/security/trusted-domains">{t("sites.help.trustedDomains")}</Link>
                                <Link to="/settings/widget/customize">{t("sites.help.widgetCustomize")}</Link>
                            </Space>
                        </Card>
                    </Col>
                </Row>
            ) : null}
        </div>
    );
}
