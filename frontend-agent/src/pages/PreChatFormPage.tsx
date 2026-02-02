import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Col, Divider, Form, Input, Row, Select, Space, Spin, Switch, Tooltip, Typography } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import { DndContext, PointerSensor, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type PreChatFieldType = "info" | "name" | "email" | "text" | "textarea" | "select" | "multiselect";

type PreChatFieldConfig = {
    id: string;
    type: PreChatFieldType;
    label?: string | null;
    required?: boolean;
    options?: string[];
    text?: string | null;
};

type PreChatField = PreChatFieldConfig & {
    uid: string;
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

function isReservedKey(key: string): boolean {
    const k = String(key || "").trim();
    return k === "name" || k === "email";
}

function reservedTypeForKey(key: string): PreChatFieldType | null {
    const k = String(key || "").trim();
    if (k === "name") return "name";
    if (k === "email") return "email";
    return null;
}

function fromLegacy(cfg: WidgetConfigDto | null): PreChatField[] {
    const out: PreChatField[] = [];
    const msg = String(cfg?.pre_chat_message || "").trim();
    if (msg) {
        out.push({ uid: makeId("uid"), id: makeId("info"), type: "info", text: msg });
    }
    out.push({
        uid: makeId("uid"),
        id: "name",
        type: "name",
        label: (cfg?.pre_chat_name_label ?? "") || null,
        required: Boolean(cfg?.pre_chat_name_required),
    });
    out.push({
        uid: makeId("uid"),
        id: "email",
        type: "email",
        label: (cfg?.pre_chat_email_label ?? "") || null,
        required: Boolean(cfg?.pre_chat_email_required),
    });
    return out;
}

function normalizeFields(fields: PreChatField[]): PreChatFieldConfig[] {
    const seen = new Set<string>();
    const cleaned: PreChatFieldConfig[] = [];

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

        const next: PreChatFieldConfig = { id, type };
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

function normalizeBuilderFields(items: unknown): PreChatField[] {
    if (!Array.isArray(items)) return [];
    const cleaned: PreChatField[] = [];
    for (const raw of items) {
        const r = raw as Partial<PreChatFieldConfig> | null;
        const id = String(r?.id || "").trim();
        const type = String(r?.type || "").trim() as PreChatFieldType;
        if (!id) continue;
        if (!type) continue;

        const reservedType = reservedTypeForKey(id);
        const finalType = reservedType || type;

        const label = String((r as any)?.label || "").trim() || null;
        const required = Boolean((r as any)?.required);
        const options = Array.isArray((r as any)?.options) ? (r as any).options.map((x: unknown) => String(x).trim()).filter(Boolean) : undefined;
        const text = String((r as any)?.text || "").trim() || null;

        const f: PreChatField = { uid: makeId("uid"), id, type: finalType };
        if (finalType === "info") {
            f.text = text;
        } else {
            f.label = label;
            f.required = required;
            if (finalType === "select" || finalType === "multiselect") f.options = options;
        }
        cleaned.push(f);
    }
    return cleaned;
}

function computeKeyIssues(fields: PreChatField[]) {
    const trimmedKeys = fields.map((f) => ({ uid: f.uid, key: String(f.id || "").trim() }));
    const counts = new Map<string, number>();
    for (const it of trimmedKeys) {
        if (!it.key) continue;
        counts.set(it.key, (counts.get(it.key) || 0) + 1);
    }
    const duplicateKeys = new Set<string>();
    for (const [k, c] of counts.entries()) {
        if (c > 1) duplicateKeys.add(k);
    }

    const issuesByUid: Record<string, "required" | "duplicate" | undefined> = {};
    for (const it of trimmedKeys) {
        if (!it.key) issuesByUid[it.uid] = "required";
        else if (duplicateKeys.has(it.key)) issuesByUid[it.uid] = "duplicate";
    }

    const hasAny = fields.length > 0;
    const hasRequiredErrors = Object.values(issuesByUid).some((v) => v === "required");
    const hasDuplicateErrors = Object.values(issuesByUid).some((v) => v === "duplicate");
    return { hasAny, hasRequiredErrors, hasDuplicateErrors, issuesByUid };
}

function SortableFieldCard(props: {
    t: (k: string, opts?: Record<string, unknown>) => string;
    field: PreChatField;
    index: number;
    fieldTypeOptions: { value: string; label: string }[];
    isAdmin: boolean;
    issuesByUid: Record<string, "required" | "duplicate" | undefined>;
    onChange: (uid: string, patch: Partial<PreChatField>) => void;
    onDelete: (uid: string) => void;
}) {
    const { t, field, index, fieldTypeOptions, isAdmin, issuesByUid, onChange, onDelete } = props;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: field.uid });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        cursor: isDragging ? "grabbing" : undefined,
    };

    const type = field.type;
    const isInfo = type === "info";
    const isSelect = type === "select" || type === "multiselect";

    const keyIssue = issuesByUid[field.uid];
    const keyStatus = keyIssue ? "error" : "";

    const keyTrimmed = String(field.id || "").trim();

    const deleteDisabled = !isAdmin;
    const deleteTooltip = "";

    return (
        <div ref={setNodeRef} style={style}>
            <Card
                size="small"
                title={
                    <Space size={10} align="center">
                        <Tooltip title={t("preChatForm.fields.dragHint")}> 
                            <span
                                style={{ display: "inline-flex", alignItems: "center", color: "rgba(0,0,0,.45)", cursor: isAdmin ? "grab" : "not-allowed" }}
                                {...attributes}
                                {...(isAdmin ? listeners : {})}
                            >
                                <HolderOutlined />
                            </span>
                        </Tooltip>
                        <span>{`${t("preChatForm.fields.field")} #${index + 1}`}</span>
                    </Space>
                }
                extra={
                    <Tooltip title={deleteTooltip}>
                        <Button danger size="small" onClick={() => onDelete(field.uid)} disabled={deleteDisabled}>
                            {t("preChatForm.fields.delete")}
                        </Button>
                    </Tooltip>
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
                                disabled={!isAdmin}
                                onChange={(nextType) => {
                                    const reservedType = reservedTypeForKey(String(field.id || "").trim());
                                    const finalType = reservedType || (nextType as PreChatFieldType);
                                    onChange(field.uid, { type: finalType });
                                }}
                            />
                        </div>
                    </div>

                    {!isInfo ? (
                        <div>
                            <Typography.Text type="secondary">{t("preChatForm.fields.key")}</Typography.Text>
                            <div style={{ marginTop: 6 }}>
                                <Input
                                    value={String(field.id || "")}
                                    disabled={!isAdmin}
                                    status={keyStatus as any}
                                    placeholder={t("preChatForm.fields.keyPlaceholder")}
                                    onChange={(e) => {
                                        const nextId = e.target.value;
                                        onChange(field.uid, { id: nextId });
                                    }}
                                />
                            </div>
                            {keyIssue === "required" ? (
                                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                                    {t("preChatForm.fields.keyRequiredError")}
                                </Typography.Text>
                            ) : null}
                            {keyIssue === "duplicate" ? (
                                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                                    {t("preChatForm.fields.keyDuplicateError")}
                                </Typography.Text>
                            ) : null}
                            {isReservedKey(keyTrimmed) ? (
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {t("preChatForm.fields.keyReservedHint")}
                                </Typography.Text>
                            ) : null}
                        </div>
                    ) : null}

                    {isInfo ? (
                        <div>
                            <Typography.Text type="secondary">{t("preChatForm.fields.infoText")}</Typography.Text>
                            <div style={{ marginTop: 6 }}>
                                <Input.TextArea
                                    autoSize={{ minRows: 2, maxRows: 6 }}
                                    value={String(field.text || "")}
                                    placeholder={t("preChatForm.information.messagePlaceholder")}
                                    disabled={!isAdmin}
                                    onChange={(e) => onChange(field.uid, { text: e.target.value })}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <Typography.Text type="secondary">{t("preChatForm.fields.label")}</Typography.Text>
                                <div style={{ marginTop: 6 }}>
                                    <Input
                                        value={String(field.label || "")}
                                        placeholder={t("preChatForm.fields.labelPlaceholder")}
                                        disabled={!isAdmin}
                                        onChange={(e) => onChange(field.uid, { label: e.target.value })}
                                    />
                                </div>
                            </div>

                            <Checkbox
                                checked={Boolean(field.required)}
                                disabled={!isAdmin}
                                onChange={(e) => onChange(field.uid, { required: e.target.checked })}
                            >
                                {t("preChatForm.fields.required")}
                            </Checkbox>

                            {isSelect ? (
                                <div>
                                    <Typography.Text type="secondary">{t("preChatForm.fields.options")}</Typography.Text>
                                    <div style={{ marginTop: 6 }}>
                                        <Input.TextArea
                                            autoSize={{ minRows: 2, maxRows: 6 }}
                                            value={(field.options || []).join("\n")}
                                            placeholder={t("preChatForm.fields.optionsPlaceholder")}
                                            disabled={!isAdmin}
                                            onChange={(e) => {
                                                const nextOpts = e.target.value
                                                    .split(/\r?\n/g)
                                                    .map((s) => s.trim())
                                                    .filter(Boolean);
                                                onChange(field.uid, { options: nextOpts });
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </>
                    )}
                </Space>
            </Card>
        </div>
    );
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
                    setFields(normalizeBuilderFields(parsed));
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

    const keyIssues = useMemo(() => computeKeyIssues(fields), [fields]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    function onDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over) return;
        if (active.id === over.id) return;
        setFields((prev) => {
            const oldIndex = prev.findIndex((f) => f.uid === String(active.id));
            const newIndex = prev.findIndex((f) => f.uid === String(over.id));
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    }

    async function save(values: PreChatFormValues) {
        if (!siteId) return;
        setSaving(true);
        setCfgError("");
        try {
            // Client-side validation: field keys must be non-empty and unique.
            if (keyIssues.hasAny && (keyIssues.hasRequiredErrors || keyIssues.hasDuplicateErrors)) {
                return;
            }

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
                setFields(normalizeBuilderFields(parsed));
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
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: 16 }}>
            {!meLoading && !isAdmin ? (
                <Alert type="warning" message={t("preChatForm.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
            ) : null}

            {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
            {cfgError ? <Alert type="error" message={cfgError} showIcon style={{ marginBottom: 12 }} /> : null}

            <Form
                form={form}
                layout="vertical"
                initialValues={{ pre_chat_enabled: false }}
                onFinish={save}
                disabled={cfgLoading || !isAdmin}
            >
                <Row gutter={16} align="stretch">
                    {/* Left: site + enable + actions */}
                    <Col xs={24} lg={7} xl={6}>
                        <Card title={t("preChatForm.title")} style={{ height: "100%" }}>
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

                                <Form.Item label={t("preChatForm.enabled.label")} name="pre_chat_enabled" valuePropName="checked">
                                    <Switch />
                                </Form.Item>

                                <Divider style={{ margin: "12px 0" }} />

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
                            </Space>
                        </Card>
                    </Col>

                    {/* Middle: builder */}
                    <Col xs={24} lg={10} xl={12}>
                        <Card title={t("preChatForm.fields.title")} style={{ height: "100%" }}>
                            <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 12 }}>
                                {t("preChatForm.fields.hint")}
                            </Typography.Paragraph>

                            {keyIssues.hasRequiredErrors || keyIssues.hasDuplicateErrors ? (
                                <Alert
                                    type="warning"
                                    showIcon
                                    message={t("preChatForm.fields.validationTitle")}
                                    description={
                                        keyIssues.hasDuplicateErrors
                                            ? t("preChatForm.fields.validationDuplicate")
                                            : t("preChatForm.fields.validationRequired")
                                    }
                                    style={{ marginBottom: 12 }}
                                />
                            ) : null}

                            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
                                    <SortableContext items={fields.map((f) => f.uid)} strategy={verticalListSortingStrategy}>
                                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                            {fields.map((f, idx) => (
                                                <SortableFieldCard
                                                    key={f.uid}
                                                    t={t}
                                                    field={f}
                                                    index={idx}
                                                    fieldTypeOptions={fieldTypeOptions}
                                                    isAdmin={isAdmin}
                                                    issuesByUid={keyIssues.issuesByUid}
                                                    onChange={(uid, patch) => {
                                                        setFields((prev) =>
                                                            prev.map((x) => {
                                                                if (x.uid !== uid) return x;
                                                                const next = { ...x, ...patch } as PreChatField;
                                                                const keyTrimmed = String(next.id || "").trim();
                                                                const reservedType = reservedTypeForKey(keyTrimmed);
                                                                if (reservedType) {
                                                                    next.id = keyTrimmed;
                                                                    next.type = reservedType;
                                                                }
                                                                return next;
                                                            }),
                                                        );
                                                    }}
                                                    onDelete={(uid) => {
                                                        setFields((prev) => prev.filter((x) => x.uid !== uid));
                                                    }}
                                                />
                                            ))}
                                        </Space>
                                    </SortableContext>
                                </DndContext>

                                <Space wrap>
                                    <Button
                                        onClick={() =>
                                            setFields((prev) => [
                                                ...prev,
                                                { uid: makeId("uid"), id: makeId("field"), type: "text", label: null, required: false },
                                            ])
                                        }
                                    >
                                        {t("preChatForm.fields.add")}
                                    </Button>
                                    <Button
                                        onClick={() => setFields((prev) => [...prev, { uid: makeId("uid"), id: makeId("info"), type: "info", text: null }])}
                                    >
                                        {t("preChatForm.fields.addInfo")}
                                    </Button>
                                    <Button
                                        onClick={() =>
                                            setFields((prev) =>
                                                prev.some((x) => String(x.id || "").trim() === "name")
                                                    ? prev
                                                    : [...prev, { uid: makeId("uid"), id: "name", type: "name" }],
                                            )
                                        }
                                    >
                                        {t("preChatForm.fields.addName")}
                                    </Button>
                                    <Button
                                        onClick={() =>
                                            setFields((prev) =>
                                                prev.some((x) => String(x.id || "").trim() === "email")
                                                    ? prev
                                                    : [...prev, { uid: makeId("uid"), id: "email", type: "email" }],
                                            )
                                        }
                                    >
                                        {t("preChatForm.fields.addEmail")}
                                    </Button>
                                </Space>
                            </Space>
                        </Card>
                    </Col>

                    {/* Right: preview */}
                    <Col xs={24} lg={7} xl={6}>
                        <Card title={t("preChatForm.previewTitle")} styles={{ body: { height: 720 } }} style={{ height: "100%" }}>
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
                    </Col>
                </Row>
            </Form>
        </div>
    );
}
