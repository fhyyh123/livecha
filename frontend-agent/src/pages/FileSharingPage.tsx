import { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Space, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import {
    DEFAULT_FILE_SHARING,
    type FileSharingDto,
    fetchFileSharingAdmin,
    updateFileSharingAdmin,
} from "../providers/chatSettings";
import { errorMessage } from "../utils/errorMessage";

export function FileSharingPage() {
    const { t } = useTranslation();

    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [saving, setSaving] = useState(false);

    const [initial, setInitial] = useState<FileSharingDto>(DEFAULT_FILE_SHARING);
    const [form] = Form.useForm<FileSharingDto>();

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

        fetchFileSharingAdmin()
            .then((cfg) => {
                if (!mounted) return;
                setInitial(cfg);
                form.setFieldsValue(cfg);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setError(errorMessage(e, "load_file_sharing_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [form, isAdmin, meLoading]);

    async function save(values: FileSharingDto) {
        setSaving(true);
        setError("");
        try {
            const res = await updateFileSharingAdmin(values);
            setInitial(res);
            form.setFieldsValue(res);
        } catch (e: unknown) {
            setError(errorMessage(e, "save_file_sharing_failed"));
        } finally {
            setSaving(false);
        }
    }

    function reset() {
        form.setFieldsValue(initial);
    }

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("fileSharing.title")}>
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    {t("fileSharing.hint")} <Typography.Link href={t("fileSharing.learnMoreUrl")} target="_blank" rel="noreferrer">{t("common.learnMore")}</Typography.Link>
                </Typography.Paragraph>

                {!meLoading && !isAdmin ? (
                    <Alert type="warning" message={t("fileSharing.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                ) : null}

                {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={DEFAULT_FILE_SHARING}
                    onFinish={save}
                    style={{ maxWidth: 520 }}
                    disabled={meLoading || !isAdmin || loading}
                >
                    <Form.Item label={t("fileSharing.enableFor.label")} style={{ marginBottom: 8 }}>
                        <Space direction="vertical" size={8}>
                            <Form.Item name="agent_file_enabled" valuePropName="checked" noStyle>
                                <Checkbox>{t("fileSharing.enableFor.agents")}</Checkbox>
                            </Form.Item>
                            <Form.Item name="visitor_file_enabled" valuePropName="checked" noStyle>
                                <Checkbox>{t("fileSharing.enableFor.visitors")}</Checkbox>
                            </Form.Item>
                        </Space>
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
