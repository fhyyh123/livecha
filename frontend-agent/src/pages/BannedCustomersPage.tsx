import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Spin, Table, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type SiteItem = {
    id: string;
    name: string;
    public_key: string;
    status: string;
};

type BannedCustomerItem = {
    ip: string;
    expires_at?: string | null;
    created_at?: string | null;
};

type BanCustomerRequest = {
    ip: string;
    duration_seconds: number;
};

const DURATION_OPTIONS: Array<{ value: number; labelKey: string }> = [
    { value: 1 * 24 * 3600, labelKey: "bannedCustomers.duration.1d" },
    { value: 3 * 24 * 3600, labelKey: "bannedCustomers.duration.3d" },
    { value: 7 * 24 * 3600, labelKey: "bannedCustomers.duration.7d" },
    { value: 30 * 24 * 3600, labelKey: "bannedCustomers.duration.30d" },
    { value: 180 * 24 * 3600, labelKey: "bannedCustomers.duration.6m" },
    { value: 365 * 24 * 3600, labelKey: "bannedCustomers.duration.1y" },
    { value: 3 * 365 * 24 * 3600, labelKey: "bannedCustomers.duration.3y" },
];

export function BannedCustomersPage() {
    const { t } = useTranslation();
    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [sitesLoading, setSitesLoading] = useState(false);
    const [sitesError, setSitesError] = useState<string>("");
    const [sites, setSites] = useState<SiteItem[]>([]);
    const [siteId, setSiteId] = useState<string>("");

    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string>("");
    const [items, setItems] = useState<BannedCustomerItem[]>([]);

    const [modalOpen, setModalOpen] = useState(false);
    const [banLoading, setBanLoading] = useState(false);
    const [form] = Form.useForm<BanCustomerRequest>();

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

    const refresh = useCallback(async () => {
        if (!siteId) return;
        setListLoading(true);
        setListError("");
        try {
            const res = await http.get<BannedCustomerItem[]>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/banned-customers`);
            setItems(Array.isArray(res.data) ? res.data : []);
        } catch (e: unknown) {
            setListError(errorMessage(e, "load_banned_customers_failed"));
        } finally {
            setListLoading(false);
        }
    }, [siteId]);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;
        if (!siteId) return;
        void refresh();
    }, [isAdmin, meLoading, refresh, siteId]);

    const openBanModal = useCallback(() => {
        form.setFieldsValue({ ip: "", duration_seconds: DURATION_OPTIONS[0]?.value || 86400 });
        setModalOpen(true);
    }, [form]);

    const doBan = useCallback(async () => {
        if (!siteId) return;
        const v = await form.validateFields();
        const body: BanCustomerRequest = {
            ip: String(v.ip || "").trim(),
            duration_seconds: Number(v.duration_seconds || 0),
        };

        setBanLoading(true);
        try {
            const res = await http.post<BannedCustomerItem[]>(
                `/api/v1/admin/sites/${encodeURIComponent(siteId)}/banned-customers`,
                body,
            );
            setItems(Array.isArray(res.data) ? res.data : []);
            setModalOpen(false);
        } catch (e: unknown) {
            // Keep it simple: surface as a top-level error.
            setListError(errorMessage(e, "ban_customer_failed"));
        } finally {
            setBanLoading(false);
        }
    }, [form, siteId]);

    const doUnban = useCallback(
        async (ip: string) => {
            if (!siteId) return;
            const normalized = String(ip || "").trim();
            if (!normalized) return;
            setListLoading(true);
            setListError("");
            try {
                const res = await http.delete<BannedCustomerItem[]>(
                    `/api/v1/admin/sites/${encodeURIComponent(siteId)}/banned-customers/${encodeURIComponent(normalized)}`,
                );
                setItems(Array.isArray(res.data) ? res.data : []);
            } catch (e: unknown) {
                setListError(errorMessage(e, "unban_customer_failed"));
            } finally {
                setListLoading(false);
            }
        },
        [siteId],
    );

    const rows = useMemo(() => {
        return (items || []).map((it) => ({
            key: it.ip,
            ...it,
        }));
    }, [items]);

    const columns = useMemo(() => {
        return [
            {
                title: t("bannedCustomers.table.ip"),
                dataIndex: "ip",
                key: "ip",
            },
            {
                title: t("bannedCustomers.table.expires"),
                dataIndex: "expires_at",
                key: "expires_at",
                render: (v: unknown) => {
                    const s = String(v || "").trim();
                    if (!s) return "-";
                    try {
                        return new Date(s).toLocaleString();
                    } catch {
                        return s;
                    }
                },
            },
            {
                title: "",
                key: "actions",
                width: 64,
                render: (_: unknown, row: { ip: string }) => (
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`${t("common.delete")} ${row.ip}`}
                        onClick={() => void doUnban(row.ip)}
                        disabled={!isAdmin}
                    />
                ),
            },
        ];
    }, [doUnban, isAdmin, t]);

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card
                title={
                    <Space align="center" size={12}>
                        <Typography.Text strong style={{ fontSize: 16 }}>
                            {t("bannedCustomers.title")}
                        </Typography.Text>
                    </Space>
                }
                extra={
                    <Button type="primary" onClick={openBanModal} disabled={!isAdmin || !siteId}>
                        {t("bannedCustomers.banCustomer")}
                    </Button>
                }
            >
                {!meLoading && !isAdmin ? (
                    <Alert type="warning" message={t("bannedCustomers.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                ) : null}

                {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
                {listError ? <Alert type="error" message={listError} showIcon style={{ marginBottom: 12 }} /> : null}

                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    {t("bannedCustomers.subtitle")}
                </Typography.Paragraph>

                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Space wrap>
                        <Typography.Text strong>{t("bannedCustomers.selectSite")}</Typography.Text>
                        <Typography.Text code>{selectedSiteLabel || "-"}</Typography.Text>
                        {sitesLoading ? <Spin size="small" /> : null}
                        <Button onClick={() => void refresh()} disabled={!isAdmin || !siteId} loading={listLoading}>
                            {t("common.refresh")}
                        </Button>
                    </Space>

                    {rows.length === 0 && !listLoading ? (
                        <div style={{ padding: 24 }}>
                            <Empty description={t("bannedCustomers.empty")} />
                        </div>
                    ) : (
                        <Table size="middle" columns={columns} dataSource={rows} loading={listLoading} pagination={false} />
                    )}
                </Space>
            </Card>

            <Modal
                open={modalOpen}
                title={t("bannedCustomers.modal.title")}
                okText={t("bannedCustomers.banCustomer")}
                cancelText={t("common.cancel")}
                onOk={() => void doBan()}
                onCancel={() => setModalOpen(false)}
                confirmLoading={banLoading}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="ip"
                        label={t("bannedCustomers.modal.ipLabel")}
                        rules={[
                            { required: true, message: t("bannedCustomers.modal.ipRequired") },
                            { max: 128, message: t("bannedCustomers.modal.ipInvalid") },
                        ]}
                    >
                        <Input placeholder={t("bannedCustomers.modal.ipPlaceholder")} />
                    </Form.Item>

                    <Form.Item
                        name="duration_seconds"
                        label={t("bannedCustomers.modal.durationLabel")}
                        rules={[{ required: true, message: t("bannedCustomers.modal.durationRequired") }]}
                    >
                        <Select
                            options={DURATION_OPTIONS.map((o) => ({
                                value: o.value,
                                label: t(o.labelKey),
                            }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
