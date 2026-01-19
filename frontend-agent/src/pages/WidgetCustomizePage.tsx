import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Divider, Form, Input, Select, Space, Spin, Switch, Typography } from "antd";
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
    anonymous_enabled: boolean;
    theme_color?: string | null;
    welcome_text?: string | null;
    cookie_domain?: string | null;
    cookie_samesite?: string | null;
};

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

    const [form] = Form.useForm<WidgetConfigDto>();

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

    async function save(values: WidgetConfigDto) {
        if (!siteId) return;
        setSaving(true);
        setCfgError("");
        try {
            const res = await http.put<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`, values);
            form.setFieldsValue(res.data);
        } catch (e: unknown) {
            setCfgError(errorMessage(e, "save_widget_config_failed"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("widgetCustomize.title")}>
                {!meLoading && !isAdmin ? (
                    <Alert type="warning" message={t("widgetCustomize.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                ) : null}

                {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
                {cfgError ? <Alert type="error" message={cfgError} showIcon style={{ marginBottom: 12 }} /> : null}

                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Space wrap>
                        <Typography.Text strong>{t("widgetCustomize.selectSite")}</Typography.Text>
                        <Select
                            style={{ minWidth: 420 }}
                            placeholder={t("widgetCustomize.selectSitePlaceholder")}
                            options={siteOptions}
                            value={siteId || undefined}
                            onChange={(v) => setSiteId(v)}
                            disabled={sitesLoading || !isAdmin}
                        />
                        {sitesLoading ? <Spin size="small" /> : null}
                        {cfgLoading ? <Spin size="small" /> : null}
                    </Space>

                    <Typography.Title level={5} style={{ margin: "8px 0 0" }}>
                        {t("widgetCustomize.widgetConfig.title")}
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8 }}>
                        {t("widgetCustomize.widgetConfig.hint")}
                    </Typography.Paragraph>

                    <Form
                        form={form}
                        layout="vertical"
                        initialValues={{ anonymous_enabled: true }}
                        onFinish={save}
                        style={{ maxWidth: 720 }}
                        disabled={cfgLoading || !isAdmin}
                    >
                        <Form.Item
                            label={t("widgetCustomize.widgetConfig.allowAnonymous.label")}
                            name="anonymous_enabled"
                            valuePropName="checked"
                            tooltip={t("widgetCustomize.widgetConfig.allowAnonymous.tooltip")}
                        >
                            <Switch />
                        </Form.Item>

                        <Form.Item
                            label={t("widgetCustomize.widgetConfig.themeColor.label")}
                            name="theme_color"
                            tooltip={t("widgetCustomize.widgetConfig.themeColor.tooltip")}
                        >
                            <Input placeholder={t("widgetCustomize.widgetConfig.themeColor.placeholder")} />
                        </Form.Item>

                        <Form.Item label={t("widgetCustomize.widgetConfig.welcomeText.label")} name="welcome_text">
                            <Input.TextArea
                                placeholder={t("widgetCustomize.widgetConfig.welcomeText.placeholder")}
                                autoSize={{ minRows: 2, maxRows: 4 }}
                            />
                        </Form.Item>

                        <Divider style={{ margin: "12px 0" }} />

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

                        <Space>
                            <Button type="primary" htmlType="submit" loading={saving} disabled={!isAdmin}>
                                {t("common.save")}
                            </Button>
                            <Button
                                onClick={() => form.resetFields()}
                                disabled={saving || !isAdmin}
                            >
                                {t("common.reset")}
                            </Button>
                        </Space>
                    </Form>
                </Space>
            </Card>
        </div>
    );
}
