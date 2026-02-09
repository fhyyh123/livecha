import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, InputNumber, Space, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import {
    DEFAULT_INACTIVITY_TIMEOUTS,
    type InactivityTimeoutsDto,
    fetchInactivityTimeoutsAdmin,
    updateInactivityTimeoutsAdmin,
} from "../providers/chatSettings";
import { errorMessage } from "../utils/errorMessage";

export function InactivityTimeoutsPage() {
    const { t } = useTranslation();

    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [saving, setSaving] = useState(false);

    const [initial, setInitial] = useState<InactivityTimeoutsDto>(DEFAULT_INACTIVITY_TIMEOUTS);
    const [form] = Form.useForm<InactivityTimeoutsDto>();

    const agentNoReplyTransferEnabled = Form.useWatch("agent_no_reply_transfer_enabled", form);
    const visitorIdleEnabled = Form.useWatch("visitor_idle_enabled", form);
    const inactivityArchiveEnabled = Form.useWatch("inactivity_archive_enabled", form);

    const maxMinutes = useMemo(() => 365 * 24 * 60, []);

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

        fetchInactivityTimeoutsAdmin()
            .then((cfg) => {
                if (!mounted) return;
                setInitial(cfg);
                form.setFieldsValue(cfg);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setError(errorMessage(e, "load_inactivity_timeouts_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [form, isAdmin, meLoading]);

    async function save(values: InactivityTimeoutsDto) {
        setSaving(true);
        setError("");
        try {
            const res = await updateInactivityTimeoutsAdmin(values);
            setInitial(res);
            form.setFieldsValue(res);
        } catch (e: unknown) {
            setError(errorMessage(e, "save_inactivity_timeouts_failed"));
        } finally {
            setSaving(false);
        }
    }

    function reset() {
        form.setFieldsValue(initial);
    }

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("inactivityTimeouts.title")}>
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    {t("inactivityTimeouts.hint")}
                </Typography.Paragraph>

                {!meLoading && !isAdmin ? (
                    <Alert type="warning" message={t("inactivityTimeouts.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                ) : null}

                {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={DEFAULT_INACTIVITY_TIMEOUTS}
                    onFinish={save}
                    style={{ maxWidth: 720 }}
                    disabled={meLoading || !isAdmin || loading}
                >
                    <Form.Item name="agent_no_reply_transfer_enabled" valuePropName="checked" style={{ marginBottom: 6 }}>
                        <Checkbox>
                            <Space size={8} align="center" wrap>
                                <span>{t("inactivityTimeouts.agentNoReplyTransfer.before")}</span>
                                <Form.Item
                                    name="agent_no_reply_transfer_minutes"
                                    noStyle
                                    rules={[{ required: true, message: t("inactivityTimeouts.common.required") }]}
                                >
                                    <InputNumber min={1} max={maxMinutes} disabled={!agentNoReplyTransferEnabled} style={{ width: 84 }} />
                                </Form.Item>
                                <span>{t("inactivityTimeouts.agentNoReplyTransfer.after")}</span>
                            </Space>
                        </Checkbox>
                    </Form.Item>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 14, marginLeft: 24 }}>
                        {t("inactivityTimeouts.agentNoReplyTransfer.help")}
                    </Typography.Paragraph>

                    <Form.Item name="visitor_idle_enabled" valuePropName="checked" style={{ marginBottom: 6 }}>
                        <Checkbox>
                            <Space size={8} align="center" wrap>
                                <span>{t("inactivityTimeouts.visitorIdle.before")}</span>
                                <Form.Item
                                    name="visitor_idle_minutes"
                                    noStyle
                                    rules={[{ required: true, message: t("inactivityTimeouts.common.required") }]}
                                >
                                    <InputNumber min={1} max={maxMinutes} disabled={!visitorIdleEnabled} style={{ width: 84 }} />
                                </Form.Item>
                                <span>{t("inactivityTimeouts.visitorIdle.after")}</span>
                            </Space>
                        </Checkbox>
                    </Form.Item>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 14, marginLeft: 24 }}>
                        {t("inactivityTimeouts.visitorIdleMinutes.help")}
                    </Typography.Paragraph>

                    <Form.Item name="inactivity_archive_enabled" valuePropName="checked" style={{ marginBottom: 6 }}>
                        <Checkbox>
                            <Space size={8} align="center" wrap>
                                <span>{t("inactivityTimeouts.inactivityArchive.before")}</span>
                                <Form.Item
                                    name="inactivity_archive_minutes"
                                    noStyle
                                    rules={[{ required: true, message: t("inactivityTimeouts.common.required") }]}
                                >
                                    <InputNumber
                                        min={1}
                                        max={maxMinutes}
                                        disabled={!inactivityArchiveEnabled}
                                        style={{ width: 84 }}
                                    />
                                </Form.Item>
                                <span>{t("inactivityTimeouts.inactivityArchive.after")}</span>
                            </Space>
                        </Checkbox>
                    </Form.Item>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 18, marginLeft: 24 }}>
                        {t("inactivityTimeouts.inactivityArchiveMinutes.help")}
                    </Typography.Paragraph>

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
