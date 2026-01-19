import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { http, setToken } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type AcceptInviteResponse = {
    access_token: string;
    expires_in: number;
    tenant_id: string;
    user_id: string;
    username: string;
};

export function AcceptInvitePage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const token = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get("token") || "";
    }, [location.search]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    type FormValues = {
        password: string;
    };

    function passwordMeetsPolicy(pw: string) {
        if (!pw) return false;
        if (pw.length < 12) return false;
        if (!/[A-Z]/.test(pw)) return false;
        if (!/\d/.test(pw)) return false;
        if (!/[^A-Za-z0-9]/.test(pw)) return false;
        return true;
    }

    async function onFinish(values: FormValues) {
        if (!token) return;
        setLoading(true);
        setError("");
        try {
            const res = await http.post<AcceptInviteResponse>("/api/v1/auth/accept-invite", {
                token,
                password: values.password,
            });
            const data = res.data;
            if (!data?.access_token) throw new Error("missing access_token");
            setToken(data.access_token);
            navigate("/");
        } catch (e: unknown) {
            setError(errorMessage(e, "accept_invite_failed"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: 16,
                background: "#f5f5f5",
            }}
        >
            <Card style={{ width: 520 }}>
                <Typography.Title level={3} style={{ marginTop: 0 }}>
                    {t("acceptInvite.title")}
                </Typography.Title>

                {!token ? (
                    <Alert type="warning" showIcon message={t("acceptInvite.missingToken")} style={{ marginBottom: 12 }} />
                ) : null}
                {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

                <Form layout="vertical" onFinish={onFinish}>
                    <Form.Item
                        name="password"
                        label={t("acceptInvite.setPassword")}
                        rules={[
                            { required: true },
                            { min: 12, message: t("acceptInvite.passwordMin") },
                            {
                                validator: async (_rule, value) => {
                                    if (!value) return;
                                    if (!passwordMeetsPolicy(String(value))) {
                                        throw new Error(t("acceptInvite.passwordInvalid"));
                                    }
                                },
                            },
                        ]}
                    >
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading} disabled={!token}>
                        {t("acceptInvite.action")}
                    </Button>
                </Form>

                <div style={{ marginTop: 12 }}>
                    <Link to="/login">{t("common.backToLogin")}</Link>
                </div>
            </Card>
        </div>
    );
}
