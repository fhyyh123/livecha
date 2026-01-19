import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, InputNumber, Space, Spin, Switch, Typography } from "antd";
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
                    style={{ maxWidth: 520 }}
                    disabled={meLoading || !isAdmin || loading}
                >
                    <Form.Item
                        label={t("inactivityTimeouts.visitorIdleEnabled.label")}
                        name="visitor_idle_enabled"
                        valuePropName="checked"
                        style={{ marginBottom: 8 }}
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        label={t("inactivityTimeouts.visitorIdleMinutes.label")}
                        name="visitor_idle_minutes"
                        extra={t("inactivityTimeouts.visitorIdleMinutes.help")}
                        rules={[{ required: true, message: t("inactivityTimeouts.common.required") }]}
                    >
                        <InputNumber min={1} max={maxMinutes} style={{ width: "100%" }} disabled={!visitorIdleEnabled} />
                    </Form.Item>

                    <Form.Item
                        label={t("inactivityTimeouts.inactivityArchiveEnabled.label")}
                        name="inactivity_archive_enabled"
                        valuePropName="checked"
                        style={{ marginBottom: 8 }}
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        label={t("inactivityTimeouts.inactivityArchiveMinutes.label")}
                        name="inactivity_archive_minutes"
                        extra={t("inactivityTimeouts.inactivityArchiveMinutes.help")}
                        rules={[{ required: true, message: t("inactivityTimeouts.common.required") }]}
                    >
                        <InputNumber
                            min={1}
                            max={maxMinutes}
                            style={{ width: "100%" }}
                            disabled={!inactivityArchiveEnabled}
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
