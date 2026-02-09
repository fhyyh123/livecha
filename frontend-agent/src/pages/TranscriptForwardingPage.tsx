import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Select, Space, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import {
    DEFAULT_TRANSCRIPT_FORWARDING,
    type TranscriptForwardingDto,
    fetchTranscriptForwardingAdmin,
    updateTranscriptForwardingAdmin,
} from "../providers/chatSettings";
import { errorMessage } from "../utils/errorMessage";

function isValidEmail(input: string): boolean {
    const s = String(input || "").trim();
    if (!s) return false;
    if (s.length > 254) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizeEmails(input: unknown): string[] {
    const list = Array.isArray(input) ? input : [];
    const cleaned = list
        .map((x) => String(x || "").trim())
        .filter((x) => x);

    const unique: string[] = [];
    for (const e of cleaned) {
        if (!unique.includes(e)) unique.push(e);
    }
    return unique.slice(0, 1);
}

export function TranscriptForwardingPage() {
    const { t } = useTranslation();

    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [saving, setSaving] = useState(false);

    const [initial, setInitial] = useState<TranscriptForwardingDto>(DEFAULT_TRANSCRIPT_FORWARDING);
    const [form] = Form.useForm<TranscriptForwardingDto>();
    const emails = Form.useWatch("emails", form);

    const selectValue = useMemo(() => normalizeEmails(emails), [emails]);

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

        fetchTranscriptForwardingAdmin()
            .then((cfg) => {
                if (!mounted) return;
                const next = { emails: normalizeEmails(cfg?.emails) };
                setInitial(next);
                form.setFieldsValue(next);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setError(errorMessage(e, "load_transcript_forwarding_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [form, isAdmin, meLoading]);

    async function save(values: TranscriptForwardingDto) {
        setSaving(true);
        setError("");
        try {
            const res = await updateTranscriptForwardingAdmin({ emails: normalizeEmails(values?.emails) });
            const next = { emails: normalizeEmails(res?.emails) };
            setInitial(next);
            form.setFieldsValue(next);
        } catch (e: unknown) {
            setError(errorMessage(e, "save_transcript_forwarding_failed"));
        } finally {
            setSaving(false);
        }
    }

    function reset() {
        form.setFieldsValue(initial);
    }

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("transcriptForwarding.title")}>
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    {t("transcriptForwarding.hint")} {t("transcriptForwarding.noBackfillHint")}
                </Typography.Paragraph>

                {!meLoading && !isAdmin ? (
                    <Alert type="warning" message={t("transcriptForwarding.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                ) : null}

                {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={DEFAULT_TRANSCRIPT_FORWARDING}
                    onFinish={save}
                    style={{ maxWidth: 720 }}
                    disabled={meLoading || !isAdmin || loading}
                >
                    <Form.Item
                        label={t("transcriptForwarding.forwardToEmailLabel")}
                        name="emails"
                        rules={[
                            {
                                validator: async (_, value) => {
                                    const list = Array.isArray(value) ? value : [];
                                    const cleaned = list
                                        .map((x) => String(x || "").trim())
                                        .filter((x) => x);

                                    if (cleaned.length > 1) throw new Error(t("transcriptForwarding.max1Error"));
                                    if (cleaned.length === 1 && !isValidEmail(cleaned[0])) {
                                        throw new Error(t("transcriptForwarding.invalidEmailError"));
                                    }
                                },
                            },
                        ]}
                        extra={t("transcriptForwarding.inputHelp")}
                    >
                        <Select
                            mode="tags"
                            value={selectValue}
                            onChange={(next) => {
                                const cleaned = normalizeEmails(next);
                                form.setFieldValue("emails", cleaned);
                            }}
                            tokenSeparators={[" ", "\n", "\t"]}
                            placeholder={t("transcriptForwarding.placeholder")}
                            open={false}
                        />
                    </Form.Item>

                    <Space>
                        <Button type="primary" htmlType="submit" loading={saving} disabled={meLoading || !isAdmin}>
                            {t("common.save")}
                        </Button>
                        <Button onClick={reset} disabled={saving || meLoading || !isAdmin}>
                            {t("common.cancel")}
                        </Button>
                        {loading ? <Spin size="small" /> : null}
                    </Space>
                </Form>
            </Card>
        </div>
    );
}
