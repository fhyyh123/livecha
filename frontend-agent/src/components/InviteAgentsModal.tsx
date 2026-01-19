import { Alert, Button, Form, Input, Modal, Select, Space, Typography, notification } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type InviteAgentResponse = {
    invite_id?: string | null;
    email: string;
    role: string;
    dev_accept_url?: string | null;
};

type InviteRow = {
    email?: string;
    role?: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
};

export function InviteAgentsModal(props: Props) {
    const { t } = useTranslation();
    const [form] = Form.useForm<{ invites: InviteRow[] }>();

    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string>("");
    const [results, setResults] = useState<InviteAgentResponse[]>([]);

    const initialInvites = useMemo<InviteRow[]>(
        () => Array.from({ length: 4 }).map(() => ({ email: "", role: "agent" })),
        [],
    );

    useEffect(() => {
        if (!props.open) return;
        setSending(false);
        setError("");
        setResults([]);
        form.setFieldsValue({ invites: initialInvites });
    }, [form, initialInvites, props.open]);

    async function sendInvites() {
        const values = await form.validateFields();
        const rows = Array.isArray(values.invites) ? values.invites : [];
        const entries = rows
            .map((r) => ({ email: String(r?.email || "").trim(), role: String(r?.role || "agent") }))
            .filter((r) => Boolean(r.email));

        if (!entries.length) {
            notification.warning({
                message: t("invites.modal.noEmailsTitle"),
                description: t("invites.modal.noEmailsDesc"),
                placement: "bottomRight",
                duration: 2,
            });
            return;
        }

        setSending(true);
        setError("");
        setResults([]);

        const created: InviteAgentResponse[] = [];
        try {
            for (const it of entries) {
                const res = await http.post<InviteAgentResponse>("/api/v1/admin/invites/agents", {
                    email: it.email,
                    role: it.role,
                });
                created.push(res.data);
            }
            setResults(created);
            notification.success({
                message: t("invites.modal.sentTitle"),
                description: t("invites.modal.sentDesc", { count: created.length }),
                placement: "bottomRight",
                duration: 2,
            });
        } catch (e: unknown) {
            setError(errorMessage(e, "invite_failed"));
        } finally {
            setSending(false);
        }
    }

    async function copyInviteLink() {
        const link = results.find((r) => r.dev_accept_url)?.dev_accept_url || "";
        if (!link) {
            notification.info({
                message: t("invites.modal.copyUnavailableTitle"),
                description: t("invites.modal.copyUnavailableDesc"),
                placement: "bottomRight",
                duration: 2,
            });
            return;
        }
        try {
            await navigator.clipboard.writeText(link);
            notification.success({
                message: t("invites.modal.copiedTitle"),
                description: link,
                placement: "bottomRight",
                duration: 2,
            });
        } catch {
            notification.error({
                message: t("invites.modal.copyFailedTitle"),
                description: link,
                placement: "bottomRight",
                duration: 2,
            });
        }
    }

    return (
        <Modal
            title={t("invites.modal.title")}
            open={props.open}
            onCancel={() => {
                if (sending) return;
                props.onClose();
            }}
            footer={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <Button type="link" onClick={() => void copyInviteLink()} disabled={!results.length}>
                        {t("invites.modal.copyInviteLink")}
                    </Button>
                    <Button type="primary" onClick={() => void sendInvites()} loading={sending}>
                        {t("invites.modal.sendInvites")}
                    </Button>
                </div>
            }
            width={720}
            destroyOnClose
        >
            {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

            <Form form={form} layout="vertical" disabled={sending}>
                <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                        <Typography.Text type="secondary">{t("invites.modal.emailAddresses")}</Typography.Text>
                    </div>
                    <div style={{ width: 220 }}>
                        <Typography.Text type="secondary">{t("invites.modal.role")}</Typography.Text>
                    </div>
                </div>

                <Form.List name="invites">
                    {(fields) => (
                        <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={10}>
                            {fields.map((field) => (
                                <div
                                    key={field.key}
                                    style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}
                                >
                                    <Form.Item
                                        {...field}
                                        name={[field.name, "email"]}
                                        style={{ flex: 1, marginBottom: 0 }}
                                        rules={[
                                            {
                                                validator: async (_, value) => {
                                                    const v = String(value || "").trim();
                                                    if (!v) return;
                                                    // rely on browser-like email test via antd rule
                                                    // but we keep it simple here
                                                    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
                                                    if (!ok) throw new Error(t("invites.modal.invalidEmail"));
                                                },
                                            },
                                        ]}
                                    >
                                        <Input placeholder={t("invites.modal.emailPlaceholder")} autoComplete="email" />
                                    </Form.Item>

                                    <Form.Item
                                        {...field}
                                        name={[field.name, "role"]}
                                        style={{ width: 220, marginBottom: 0 }}
                                        initialValue="agent"
                                    >
                                        <Select
                                            options={[
                                                { value: "agent", label: t("team.role.agent") },
                                                { value: "admin", label: t("team.role.owner") },
                                            ]}
                                        />
                                    </Form.Item>
                                </div>
                            ))}
                        </Space>
                    )}
                </Form.List>
            </Form>

            {results.length ? (
                <div style={{ marginTop: 14 }}>
                    <Typography.Text type="secondary">{t("invites.modal.created")}</Typography.Text>
                    <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={6}>
                        {results.map((r) => (
                            <div key={String(r.invite_id || r.email)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <Typography.Text>
                                    {r.email} ({r.role})
                                </Typography.Text>
                                {r.dev_accept_url ? (
                                    <Typography.Link href={r.dev_accept_url} target="_blank" rel="noreferrer">
                                        {t("invites.modal.acceptLink")}
                                    </Typography.Link>
                                ) : null}
                            </div>
                        ))}
                    </Space>
                </div>
            ) : null}
        </Modal>
    );
}
