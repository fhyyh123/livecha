import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Divider, Form, Input, Row, Select, Space, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";

import i18n from "../i18n";
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

function Preview({ lang, welcomeText, phrases }: { lang: "en" | "zh-CN"; welcomeText: string; phrases: Record<string, string> }) {
    const fixedT = useMemo(() => i18n.getFixedT(lang), [lang]);

    const headerTitle = phrases.header_title || fixedT("visitorEmbed.headerTitle");
    const composerPlaceholder = phrases.message_placeholder || fixedT("visitorEmbed.composer.placeholder");

    const welcome = welcomeText.trim() || fixedT("widgetLanguage.preview.welcomeFallback");
    const customerBubble = fixedT("widgetLanguage.preview.customerBubble");
    const agentBubble = fixedT("widgetLanguage.preview.agentBubble");

    return (
        <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
            <div
                style={{
                    width: 340,
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,.10)",
                    overflow: "hidden",
                    background: "#fff",
                    boxShadow: "0 20px 45px rgba(0,0,0,.08)",
                }}
            >
                <div style={{ padding: 12, borderBottom: "1px solid rgba(15,23,42,.06)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 10, background: "#2563eb" }} />
                    <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {headerTitle}
                    </div>
                </div>

                <div style={{ padding: 12, background: "#f8fafc", minHeight: 240 }}>
                    <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 14px" }}>
                        <div
                            style={{
                                maxWidth: "92%",
                                background: "rgba(15,23,42,.06)",
                                color: "rgba(15,23,42,.7)",
                                padding: "8px 12px",
                                borderRadius: 999,
                                fontSize: 12,
                                textAlign: "center",
                            }}
                        >
                            {welcome}
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                        <div style={{ background: "#2563eb", color: "#fff", padding: "8px 10px", borderRadius: 14, maxWidth: "78%", fontSize: 13 }}>
                            {customerBubble}
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ background: "#fff", border: "1px solid rgba(15,23,42,.08)", color: "#0f172a", padding: "8px 10px", borderRadius: 14, maxWidth: "78%", fontSize: 13 }}>
                            {agentBubble}
                        </div>
                    </div>
                </div>

                <div style={{ padding: 10, borderTop: "1px solid rgba(15,23,42,.06)", background: "#fff" }}>
                    <div
                        style={{
                            border: "1px solid rgba(15,23,42,.12)",
                            borderRadius: 999,
                            padding: "10px 12px",
                            color: "rgba(15,23,42,.55)",
                            fontSize: 13,
                        }}
                    >
                        {composerPlaceholder}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function WidgetLanguagePage() {
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

    const [form] = Form.useForm<PhraseFormValues>();

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

    const watchLang = Form.useWatch("widget_language", form);
    const watchWelcome = Form.useWatch("welcome_text", form);
    const watchDefaultName = Form.useWatch("default_customer_name", form);
    const watchPlaceholder = Form.useWatch("message_placeholder", form);
    const watchHeaderTitle = Form.useWatch("header_title", form);

    const previewLang = normalizeWidgetLanguage(watchLang);
    const previewWelcome = String(watchWelcome || "");
    const previewPhrases = useMemo(
        () => ({
            default_customer_name: String(watchDefaultName || "").trim(),
            message_placeholder: String(watchPlaceholder || "").trim(),
            header_title: String(watchHeaderTitle || "").trim(),
        }),
        [watchDefaultName, watchHeaderTitle, watchPlaceholder],
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

    return (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: 16 }}>
            {!meLoading && !isAdmin ? (
                <Alert type="warning" message={t("widgetLanguage.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
            ) : null}

            {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
            {cfgError ? <Alert type="error" message={cfgError} showIcon style={{ marginBottom: 12 }} /> : null}

            <Form
                form={form}
                layout="vertical"
                initialValues={{ widget_language: "en" }}
                onFinish={save}
                disabled={cfgLoading || !isAdmin}
            >
                <Row gutter={16} align="stretch">
                    <Col xs={24} lg={16} xl={16}>
                        <Card title={t("widgetLanguage.title")} style={{ height: "100%" }}>
                            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                <Space wrap>
                                    <Typography.Text strong>{t("widgetLanguage.selectSite")}</Typography.Text>
                                    <Typography.Text code>{selectedSiteLabel || "-"}</Typography.Text>
                                    {sitesLoading ? <Spin size="small" /> : null}
                                    {cfgLoading ? <Spin size="small" /> : null}
                                </Space>

                                <Form.Item
                                    label={t("widgetLanguage.language.label")}
                                    name="widget_language"
                                    style={{ maxWidth: 360 }}
                                >
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
                    </Col>

                    <Col xs={24} lg={8} xl={8}>
                        <Card title={t("widgetLanguage.preview.title")} style={{ height: "100%" }}>
                            <Preview lang={previewLang} welcomeText={previewWelcome} phrases={previewPhrases} />
                        </Card>
                    </Col>
                </Row>
            </Form>
        </div>
    );
}
