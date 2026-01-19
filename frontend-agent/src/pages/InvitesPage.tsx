import { Alert, Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type InviteAgentResponse = {
    invite_id?: string | null;
    email: string;
    role: string;
    dev_accept_url?: string | null;
};

export function InvitesPage() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [resp, setResp] = useState<InviteAgentResponse | null>(null);

    type FormValues = {
        email: string;
        role: string;
    };

    async function onFinish(values: FormValues) {
        setLoading(true);
        setError("");
        setResp(null);
        try {
            const res = await http.post<InviteAgentResponse>("/api/v1/admin/invites/agents", {
                email: values.email,
                role: values.role,
            });
            setResp(res.data);
        } catch (e: unknown) {
            setError(errorMessage(e, "invite_failed"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("invites.title")}>
                {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

                <Form layout="vertical" onFinish={onFinish} disabled={loading}>
                    <Form.Item name="email" label={t("invites.email")} rules={[{ required: true }, { type: "email" }]}>
                        <Input placeholder="agent@company.com" autoComplete="email" />
                    </Form.Item>
                    <Form.Item name="role" label={t("invites.role")} initialValue="agent">
                        <Select
                            options={[
                                { value: "agent", label: "agent" },
                                { value: "admin", label: "admin" },
                            ]}
                        />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading}>
                        {t("invites.send")}
                    </Button>
                </Form>

                {resp ? (
                    <div style={{ marginTop: 16 }}>
                        <Alert
                            type="success"
                            showIcon
                            message={t("invites.created", { email: resp.email, role: resp.role })}
                        />
                        {resp.dev_accept_url ? (
                            <Space direction="vertical" style={{ width: "100%", marginTop: 12 }} size={6}>
                                <Typography.Text type="secondary">{t("invites.devAcceptLink")}</Typography.Text>
                                <a href={resp.dev_accept_url}>{resp.dev_accept_url}</a>
                            </Space>
                        ) : null}
                    </div>
                ) : null}
            </Card>
        </div>
    );
}
