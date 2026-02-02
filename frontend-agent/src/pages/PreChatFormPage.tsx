import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Divider, Form, Input, Select, Space, Spin, Switch, Typography } from "antd";
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
    pre_chat_message?: string | null;
    pre_chat_name_label?: string | null;
    pre_chat_email_label?: string | null;
    pre_chat_name_required?: boolean;
    pre_chat_email_required?: boolean;
};

type PreChatFieldType = "info" | "name" | "email" | "text" | "textarea" | "select" | "multiselect";

type PreChatField = {
    id: string;
    type: PreChatFieldType;
    label?: string | null;
    required?: boolean;
    options?: string[];
    text?: string | null;
};

type PreChatFormValues = {
    pre_chat_enabled: boolean;
};

function safeJsonParse<T>(s: string): T | null {
    try {
        return JSON.parse(s) as T;
    } catch {
        return null;
    }
}

function makeId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function fromLegacy(cfg: WidgetConfigDto | null): PreChatField[] {
    const out: PreChatField[] = [];
    const msg = String(cfg?.pre_chat_message || "").trim();
    if (msg) {
        out.push({ id: makeId("info"), type: "info", text: msg });
    }
    out.push({
        id: "name",
        type: "name",
        label: (cfg?.pre_chat_name_label ?? "") || null,
        required: Boolean(cfg?.pre_chat_name_required),
    });
    out.push({
        id: "email",
        type: "email",
        label: (cfg?.pre_chat_email_label ?? "") || null,
        required: Boolean(cfg?.pre_chat_email_required),
    });
    return out;
}

function normalizeFields(fields: PreChatField[]): PreChatField[] {
    const seen = new Set<string>();
    const cleaned: PreChatField[] = [];

    for (const f of fields || []) {
        const id = String(f?.id || "").trim();
        const type = String(f?.type || "").trim() as PreChatFieldType;
        if (!id) continue;
        if (!type) continue;
        if (seen.has(id)) continue;
        seen.add(id);

        const label = ("label" in f ? String(f.label || "").trim() : "") || null;
        const required = Boolean(f.required);
        const options = Array.isArray(f.options) ? f.options.map((x) => String(x).trim()).filter(Boolean) : undefined;
        const text = ("text" in f ? String(f.text || "").trim() : "") || null;

        const next: PreChatField = { id, type };
        if (type === "info") {
            next.text = text;
        } else {
            next.label = label;
            next.required = required;
            if (type === "select" || type === "multiselect") {
                next.options = options;
            }
        }

        cleaned.push(next);
    }

    return cleaned;
}

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
    const [fields, setFields] = useState<PreChatField[]>([]);

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

                const parsed = safeJsonParse<unknown>(String(cfg?.pre_chat_fields_json || "").trim());
                if (Array.isArray(parsed)) {
                    setFields(normalizeFields(parsed as PreChatField[]));
                } else {
                    setFields(fromLegacy(cfg));
                }

                form.setFieldsValue({
                    pre_chat_enabled: Boolean(cfg?.pre_chat_enabled),
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

    const fieldTypeOptions = useMemo(
        () => [
            { value: "info", label: t("preChatForm.fields.types.info") },
            { value: "name", label: t("preChatForm.fields.types.name") },
            { value: "email", label: t("preChatForm.fields.types.email") },
            { value: "text", label: t("preChatForm.fields.types.text") },
            { value: "textarea", label: t("preChatForm.fields.types.textarea") },
            { value: "select", label: t("preChatForm.fields.types.select") },
            { value: "multiselect", label: t("preChatForm.fields.types.multiselect") },
        ],
        [t],
    );

    const normalizedFieldsJson = useMemo(() => {
        const normalized = normalizeFields(fields);
        return JSON.stringify(normalized);
    }, [fields]);

    async function save(values: PreChatFormValues) {
        if (!siteId) return;
        setSaving(true);
        setCfgError("");
        try {
            const pre_chat_enabled = Boolean(values.pre_chat_enabled);

            // Keep legacy fields in sync (for backward compatibility + server-side fallback).
            const normalized = normalizeFields(fields);
            const info = normalized.find((f) => f.type === "info" && String(f.text || "").trim());
            const nameField = normalized.find((f) => f.id === "name" || f.type === "name");
            const emailField = normalized.find((f) => f.id === "email" || f.type === "email");

            const pre_chat_message = info ? String(info.text || "").trim() || null : null;
            const pre_chat_name_label = nameField ? String(nameField.label || "").trim() || null : null;
            const pre_chat_email_label = emailField ? String(emailField.label || "").trim() || null : null;
            const pre_chat_name_required = Boolean(nameField?.required);
            const pre_chat_email_required = Boolean(emailField?.required);

            const payload: WidgetConfigDto = {
                ...(currentCfg || { pre_chat_enabled: false }),
                pre_chat_enabled,
                pre_chat_fields_json: normalizedFieldsJson,
                pre_chat_message,
                pre_chat_name_label,
                pre_chat_email_label,
                pre_chat_name_required,
                pre_chat_email_required,
            };
            const res = await http.put<WidgetConfigDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget-config`, payload);
            setCurrentCfg(res.data);

            const parsed = safeJsonParse<unknown>(String(res.data?.pre_chat_fields_json || "").trim());
            if (Array.isArray(parsed)) {
                setFields(normalizeFields(parsed as PreChatField[]));
            }

            form.setFieldsValue({
                pre_chat_enabled: Boolean(res.data?.pre_chat_enabled),
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

                                <Typography.Text strong>{t("preChatForm.fields.title")}</Typography.Text>
                                <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                                    {t("preChatForm.fields.hint")}
                                </Typography.Paragraph>

                                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                    {fields.map((f, idx) => {
                                        const type = f.type;
                                        const isInfo = type === "info";
                                        const isSelect = type === "select" || type === "multiselect";

                                        return (
                                            <Card
                                                key={f.id}
                                                size="small"
                                                title={`${t("preChatForm.fields.field")} #${idx + 1}`}
                                                extra={
                                                    <Button
                                                        danger
                                                        size="small"
                                                        onClick={() => setFields((prev) => prev.filter((x) => x.id !== f.id))}
                                                    >
                                                        {t("preChatForm.fields.delete")}
                                                    </Button>
                                                }
                                            >
                                                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                                    <div>
                                                        <Typography.Text type="secondary">{t("preChatForm.fields.type")}</Typography.Text>
                                                        <div style={{ marginTop: 6 }}>
                                                            <Select
                                                                value={type}
                                                                options={fieldTypeOptions}
                                                                style={{ width: "100%" }}
                                                                onChange={(nextType) =>
                                                                    setFields((prev) =>
                                                                        prev.map((x) => (x.id === f.id ? { ...x, type: nextType as PreChatFieldType } : x)),
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    </div>

                                                    {isInfo ? (
                                                        <div>
                                                            <Typography.Text type="secondary">{t("preChatForm.fields.infoText")}</Typography.Text>
                                                            <div style={{ marginTop: 6 }}>
                                                                <Input.TextArea
                                                                    autoSize={{ minRows: 2, maxRows: 6 }}
                                                                    value={String(f.text || "")}
                                                                    placeholder={t("preChatForm.information.messagePlaceholder")}
                                                                    onChange={(e) =>
                                                                        setFields((prev) =>
                                                                            prev.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)),
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>
                                                                <Typography.Text type="secondary">{t("preChatForm.fields.label")}</Typography.Text>
                                                                <div style={{ marginTop: 6 }}>
                                                                    <Input
                                                                        value={String(f.label || "")}
                                                                        placeholder={t("preChatForm.fields.labelPlaceholder")}
                                                                        onChange={(e) =>
                                                                            setFields((prev) =>
                                                                                prev.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)),
                                                                            )
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>

                                                            <Checkbox
                                                                checked={Boolean(f.required)}
                                                                onChange={(e) =>
                                                                    setFields((prev) =>
                                                                        prev.map((x) => (x.id === f.id ? { ...x, required: e.target.checked } : x)),
                                                                    )
                                                                }
                                                            >
                                                                {t("preChatForm.fields.required")}
                                                            </Checkbox>

                                                            {isSelect ? (
                                                                <div>
                                                                    <Typography.Text type="secondary">{t("preChatForm.fields.options")}</Typography.Text>
                                                                    <div style={{ marginTop: 6 }}>
                                                                        <Input.TextArea
                                                                            autoSize={{ minRows: 2, maxRows: 6 }}
                                                                            value={(f.options || []).join("\n")}
                                                                            placeholder={t("preChatForm.fields.optionsPlaceholder")}
                                                                            onChange={(e) => {
                                                                                const nextOpts = e.target.value
                                                                                    .split(/\r?\n/g)
                                                                                    .map((s) => s.trim())
                                                                                    .filter(Boolean);
                                                                                setFields((prev) =>
                                                                                    prev.map((x) => (x.id === f.id ? { ...x, options: nextOpts } : x)),
                                                                                );
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                        </>
                                                    )}
                                                </Space>
                                            </Card>
                                        );
                                    })}

                                    <Space wrap>
                                        <Button
                                            onClick={() =>
                                                setFields((prev) => [
                                                    ...prev,
                                                    { id: makeId("field"), type: "text", label: null, required: false },
                                                ])
                                            }
                                        >
                                            {t("preChatForm.fields.add")}
                                        </Button>
                                        <Button
                                            onClick={() => setFields((prev) => [...prev, { id: makeId("info"), type: "info", text: null }])}
                                        >
                                            {t("preChatForm.fields.addInfo")}
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                setFields((prev) => (prev.some((x) => x.id === "name") ? prev : [...prev, { id: "name", type: "name" }]))
                                            }
                                        >
                                            {t("preChatForm.fields.addName")}
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                setFields((prev) => (prev.some((x) => x.id === "email") ? prev : [...prev, { id: "email", type: "email" }]))
                                            }
                                        >
                                            {t("preChatForm.fields.addEmail")}
                                        </Button>
                                    </Space>
                                </Space>

                                <Space>
                                    <Button type="primary" htmlType="submit" loading={saving} disabled={!isAdmin}>
                                        {t("common.save")}
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            form.resetFields();
                                            setFields(fromLegacy(currentCfg));
                                        }}
                                        disabled={saving || !isAdmin}
                                    >
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
