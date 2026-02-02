import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Divider, Form, Input, Space, Spin, Switch, Typography } from "antd";
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
    theme_color?: string | null;
    welcome_text?: string | null;
    cookie_domain?: string | null;
    cookie_samesite?: string | null;
    pre_chat_message?: string | null;
    pre_chat_name_label?: string | null;
    pre_chat_email_label?: string | null;
    pre_chat_name_required?: boolean;
    pre_chat_email_required?: boolean;
};

type PreChatFormValues = {
    pre_chat_enabled: boolean;
    pre_chat_message?: string | null;
    pre_chat_name_label?: string | null;
    pre_chat_email_label?: string | null;
    pre_chat_name_required?: boolean;
    pre_chat_email_required?: boolean;
};

export function PreChatFormPage() {
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

    const [currentCfg, setCurrentCfg] = useState<WidgetConfigDto | null>(null);

    const [form] = Form.useForm<PreChatFormValues>();

    const selectedSiteLabel = useMemo(() => {
        const s = sites.find((x) => x.id === siteId) || sites[0];
        if (!s) return "";
        return `${s.name} (${s.public_key})`;
    }, [siteId, sites]);

    const selectedSite = useMemo(() => sites.find((s) => s.id === siteId) || null, [sites, siteId]);

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
                setCurrentCfg(cfg);
                form.setFieldsValue({
                    pre_chat_enabled: Boolean(cfg?.pre_chat_enabled),
                    pre_chat_message: cfg?.pre_chat_message ?? null,
                    pre_chat_name_label: cfg?.pre_chat_name_label ?? null,
                    pre_chat_email_label: cfg?.pre_chat_email_label ?? null,
                    pre_chat_name_required: Boolean(cfg?.pre_chat_name_required),
                    pre_chat_email_required: Boolean(cfg?.pre_chat_email_required),
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

    async function save(values: PreChatFormValues) {
        if (!siteId) return;
        setSaving(true);
        setCfgError("");
        try {
            const pre_chat_enabled = Boolean(values.pre_chat_enabled);
            const pre_chat_message = (values.pre_chat_message ?? "").trim() || null;
            const pre_chat_name_label = (values.pre_chat_name_label ?? "").trim() || null;
            const pre_chat_email_label = (values.pre_chat_email_label ?? "").trim() || null;
            const pre_chat_name_required = Boolean(values.pre_chat_name_required);
            const pre_chat_email_required = Boolean(values.pre_chat_email_required);
            const payload: WidgetConfigDto = {
                ...(currentCfg || { pre_chat_enabled: false }),
                pre_chat_enabled,
                pre_chat_message,
                pre_chat_name_label,
                pre_chat_email_label,
                pre_chat_name_required,
                pre_chat_email_required,
            };
            const res = await http.put<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`, payload);
            setCurrentCfg(res.data);
            form.setFieldsValue({
                pre_chat_enabled: Boolean(res.data?.pre_chat_enabled),
                pre_chat_message: res.data?.pre_chat_message ?? null,
                pre_chat_name_label: res.data?.pre_chat_name_label ?? null,
                pre_chat_email_label: res.data?.pre_chat_email_label ?? null,
                pre_chat_name_required: Boolean(res.data?.pre_chat_name_required),
                pre_chat_email_required: Boolean(res.data?.pre_chat_email_required),
            });
        } catch (e: unknown) {
            setCfgError(errorMessage(e, "save_widget_config_failed"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                <div style={{ flex: "1 1 0" }}>
                    <Card title={t("preChatForm.title")}>
                        {!meLoading && !isAdmin ? (
                            <Alert type="warning" message={t("preChatForm.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                        ) : null}

                        {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
                        {cfgError ? <Alert type="error" message={cfgError} showIcon style={{ marginBottom: 12 }} /> : null}

                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                            <Space wrap>
                                <Typography.Text strong>{t("preChatForm.selectSite")}</Typography.Text>
                                <Typography.Text code>{selectedSiteLabel || "-"}</Typography.Text>
                                {sitesLoading ? <Spin size="small" /> : null}
                                {cfgLoading ? <Spin size="small" /> : null}
                            </Space>

                            <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8 }}>
                                {t("preChatForm.hint")}
                            </Typography.Paragraph>

                            <Form
                                form={form}
                                layout="vertical"
                                initialValues={{ pre_chat_enabled: false }}
                                onFinish={save}
                                style={{ maxWidth: 520 }}
                                disabled={cfgLoading || !isAdmin}
                            >
                                <Form.Item label={t("preChatForm.enabled.label")} name="pre_chat_enabled" valuePropName="checked">
                                    <Switch />
                                </Form.Item>

                                <Divider style={{ margin: "12px 0" }} />

                                <Typography.Text strong>{t("preChatForm.information.title")}</Typography.Text>
                                <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                                    {t("preChatForm.information.hint")}
                                </Typography.Paragraph>
                                <Form.Item label={t("preChatForm.information.messageLabel")} name="pre_chat_message">
                                    <Input.TextArea
                                        autoSize={{ minRows: 2, maxRows: 6 }}
                                        placeholder={t("preChatForm.information.messagePlaceholder")}
                                    />
                                </Form.Item>

                                <Divider style={{ margin: "12px 0" }} />

                                <Typography.Text strong>{t("preChatForm.name.title")}</Typography.Text>
                                <Form.Item label={t("preChatForm.name.labelLabel")} name="pre_chat_name_label">
                                    <Input placeholder={t("preChatForm.name.labelPlaceholder")} />
                                </Form.Item>
                                <Form.Item name="pre_chat_name_required" valuePropName="checked">
                                    <Checkbox>{t("preChatForm.name.required")}</Checkbox>
                                </Form.Item>

                                <Divider style={{ margin: "12px 0" }} />

                                <Typography.Text strong>{t("preChatForm.email.title")}</Typography.Text>
                                <Form.Item label={t("preChatForm.email.labelLabel")} name="pre_chat_email_label">
                                    <Input placeholder={t("preChatForm.email.labelPlaceholder")} />
                                </Form.Item>
                                <Form.Item name="pre_chat_email_required" valuePropName="checked">
                                    <Checkbox>{t("preChatForm.email.required")}</Checkbox>
                                </Form.Item>

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
                </div>

                <div style={{ width: 420, flex: "0 0 420px" }}>
                    <Card title={t("preChatForm.previewTitle")} styles={{ body: { height: 640 } }}>
                        {selectedSite?.public_key ? (
                            <iframe
                                title="visitor-preview"
                                src={`/visitor/embed?site_key=${encodeURIComponent(selectedSite.public_key)}`}
                                style={{ width: "100%", height: "100%", border: 0, borderRadius: 12, overflow: "hidden" }}
                            />
                        ) : (
                            <div style={{ color: "rgba(0,0,0,.45)" }}>{t("preChatForm.previewEmpty")}</div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
