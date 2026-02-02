import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Space, Spin, Tabs, Table, Typography } from "antd";
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

type TrustedDomainRow = {
    key: string;
    domain: string;
    addedBy: string;
    date: string;
};

type InstallStatusDto = {
    installed: boolean;
    last_seen_at?: string | null;
    last_origin?: string | null;
    last_page_url?: string | null;
};

type DetectedDomainRow = {
    key: string;
    domain: string;
    source: "origin" | "pageUrl";
    lastSeenAt: string;
};

function extractHost(raw?: string | null): string {
    if (!raw) return "";
    const s = String(raw).trim();
    if (!s) return "";

    try {
        if (s.includes("://")) {
            const u = new URL(s);
            return (u.hostname || "").trim().toLowerCase().replace(/\.$/, "");
        }

        // Accept host, origin, host[:port], host/path... by adding a dummy scheme.
        if (s.includes(":") || s.includes("/") || s.includes("?") || s.includes("#")) {
            const u = new URL(`http://${s}`);
            return (u.hostname || "").trim().toLowerCase().replace(/\.$/, "");
        }

        return s.toLowerCase().replace(/\.$/, "");
    } catch {
        return "";
    }
}

export function TrustedDomainsPage() {
    const { t } = useTranslation();
    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [sitesLoading, setSitesLoading] = useState(false);
    const [sitesError, setSitesError] = useState<string>("");
    const [sites, setSites] = useState<SiteItem[]>([]);
    const [siteId, setSiteId] = useState<string>("");

    const [allowlist, setAllowlist] = useState<string[]>([]);
    const [allowlistLoading, setAllowlistLoading] = useState(false);
    const [allowlistError, setAllowlistError] = useState<string>("");
    const [newDomain, setNewDomain] = useState<string>("");

    const [installStatus, setInstallStatus] = useState<InstallStatusDto | null>(null);
    const [installStatusLoading, setInstallStatusLoading] = useState(false);
    const [installStatusError, setInstallStatusError] = useState<string>("");

    const selectedSiteLabel = useMemo(() => {
        const s = sites.find((x) => x.id === siteId) || sites[0];
        if (!s) return "";
        return `${s.name} (${s.public_key})`;
    }, [siteId, sites]);

    const trustedRows: TrustedDomainRow[] = useMemo(() => {
        // Backend currently returns a string[] only; keep metadata placeholders for now.
        return (allowlist || []).map((domain) => ({
            key: domain,
            domain,
            addedBy: "-",
            date: "-",
        }));
    }, [allowlist]);

    const detectedRows: DetectedDomainRow[] = useMemo(() => {
        const trustedSet = new Set((allowlist || []).map((d) => String(d).trim().toLowerCase()));

        const rows: DetectedDomainRow[] = [];
        const seen = new Set<string>();
        const lastSeenAt = installStatus?.last_seen_at
            ? new Date(installStatus.last_seen_at).toLocaleString()
            : "-";

        const originHost = extractHost(installStatus?.last_origin);
        const pageHost = extractHost(installStatus?.last_page_url);

        if (originHost && !seen.has(originHost)) {
            seen.add(originHost);
            rows.push({
                key: originHost,
                domain: originHost,
                source: "origin",
                lastSeenAt,
            });
        }

        if (pageHost && !seen.has(pageHost)) {
            seen.add(pageHost);
            rows.push({
                key: pageHost,
                domain: pageHost,
                source: "pageUrl",
                lastSeenAt,
            });
        }

        return rows.filter((r) => !trustedSet.has(r.domain));
    }, [allowlist, installStatus]);

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

        setAllowlistError("");
        setAllowlist([]);

        setInstallStatusError("");
        setInstallStatus(null);

        setAllowlistLoading(true);
        http
            .get<string[]>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/allowlist`)
            .then((res) => {
                if (!mounted) return;
                setAllowlist(res.data || []);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setAllowlistError(errorMessage(e, "load_allowlist_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setAllowlistLoading(false);
            });

        setInstallStatusLoading(true);
        http
            .get<InstallStatusDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/install-status`)
            .then((res) => {
                if (!mounted) return;
                setInstallStatus(res.data);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setInstallStatusError(errorMessage(e, "load_install_status_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setInstallStatusLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [siteId, isAdmin, meLoading]);

    async function refreshAllowlist() {
        if (!siteId) return;
        const res = await http.get<string[]>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/allowlist`);
        setAllowlist(res.data || []);
    }

    async function refreshInstallStatus() {
        if (!siteId) return;
        setInstallStatusLoading(true);
        setInstallStatusError("");
        try {
            const res = await http.get<InstallStatusDto>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/install-status`);
            setInstallStatus(res.data);
        } catch (e: unknown) {
            setInstallStatusError(errorMessage(e, "load_install_status_failed"));
        } finally {
            setInstallStatusLoading(false);
        }
    }

    async function addAllowlistDomain() {
        if (!siteId) return;
        const domain = (newDomain || "").trim();
        if (!domain) return;
        setAllowlistLoading(true);
        setAllowlistError("");
        try {
            const res = await http.post<string[]>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/allowlist`, { domain });
            setAllowlist(res.data || []);
            setNewDomain("");
        } catch (e: unknown) {
            setAllowlistError(errorMessage(e, "add_allowlist_failed"));
        } finally {
            setAllowlistLoading(false);
        }
    }

    const addAllowlistDomainFor = useCallback(
        async (domain: string) => {
            if (!siteId) return;
            const d = (domain || "").trim();
            if (!d) return;
            setAllowlistLoading(true);
            setAllowlistError("");
            try {
                const res = await http.post<string[]>(`/api/v1/admin/sites/${encodeURIComponent(siteId)}/allowlist`, { domain: d });
                setAllowlist(res.data || []);
            } catch (e: unknown) {
                setAllowlistError(errorMessage(e, "add_allowlist_failed"));
            } finally {
                setAllowlistLoading(false);
            }
        },
        [siteId],
    );

    const deleteAllowlistDomain = useCallback(
        async (domain: string) => {
            if (!siteId) return;
            setAllowlistLoading(true);
            setAllowlistError("");
            try {
                const res = await http.delete<string[]>(
                    `/api/v1/admin/sites/${encodeURIComponent(siteId)}/allowlist/${encodeURIComponent(domain)}`,
                );
                setAllowlist(res.data || []);
            } catch (e: unknown) {
                setAllowlistError(errorMessage(e, "delete_allowlist_failed"));
            } finally {
                setAllowlistLoading(false);
            }
        },
        [siteId],
    );

    const trustedColumns = useMemo(
        () => [
            {
                title: t("trustedDomains.trusted.table.domain"),
                dataIndex: "domain",
                key: "domain",
                render: (d: string) => <Typography.Link>{d}</Typography.Link>,
            },
            {
                title: t("trustedDomains.trusted.table.addedBy"),
                dataIndex: "addedBy",
                key: "addedBy",
                width: 240,
            },
            {
                title: t("trustedDomains.trusted.table.date"),
                dataIndex: "date",
                key: "date",
                width: 200,
            },
            {
                title: "",
                key: "action",
                width: 56,
                render: (_: unknown, row: TrustedDomainRow) => (
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`${t("common.delete")} ${row.domain}`}
                        onClick={() => deleteAllowlistDomain(row.domain)}
                        disabled={allowlistLoading}
                    />
                ),
            },
        ],
        [allowlistLoading, deleteAllowlistDomain, t],
    );

    const detectedColumns = useMemo(
        () => [
            {
                title: t("trustedDomains.detected.table.domain"),
                dataIndex: "domain",
                key: "domain",
                render: (d: string) => <Typography.Link>{d}</Typography.Link>,
            },
            {
                title: t("trustedDomains.detected.table.source"),
                dataIndex: "source",
                key: "source",
                width: 140,
                render: (s: DetectedDomainRow["source"]) =>
                    s === "origin" ? t("trustedDomains.detected.source.origin") : t("trustedDomains.detected.source.pageUrl"),
            },
            {
                title: t("trustedDomains.detected.table.date"),
                dataIndex: "lastSeenAt",
                key: "lastSeenAt",
                width: 240,
            },
            {
                title: "",
                key: "action",
                width: 160,
                render: (_: unknown, row: DetectedDomainRow) => (
                    <Button
                        type="primary"
                        onClick={() => addAllowlistDomainFor(row.domain)}
                        loading={allowlistLoading}
                        disabled={!isAdmin}
                    >
                        {t("trustedDomains.detected.addToTrusted")}
                    </Button>
                ),
            },
        ],
        [addAllowlistDomainFor, allowlistLoading, isAdmin, t],
    );

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card
                title={
                    <Space align="center" size={12}>
                        <Typography.Text strong style={{ fontSize: 16 }}>
                            {t("trustedDomains.title")}
                        </Typography.Text>
                    </Space>
                }
            >
                {!meLoading && !isAdmin ? (
                    <Alert type="warning" message={t("trustedDomains.adminOnlyHint")} showIcon style={{ marginBottom: 12 }} />
                ) : null}

                {sitesError ? <Alert type="error" message={sitesError} showIcon style={{ marginBottom: 12 }} /> : null}
                {allowlistError ? <Alert type="error" message={allowlistError} showIcon style={{ marginBottom: 12 }} /> : null}
                {installStatusError ? <Alert type="error" message={installStatusError} showIcon style={{ marginBottom: 12 }} /> : null}

                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    {t("trustedDomains.subtitle")}
                </Typography.Paragraph>

                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Space wrap>
                        <Typography.Text strong>{t("trustedDomains.selectSite")}</Typography.Text>
                        <Typography.Text code>{selectedSiteLabel || "-"}</Typography.Text>
                        {sitesLoading ? <Spin size="small" /> : null}
                    </Space>

                    <Typography.Title level={5} style={{ margin: "8px 0 0" }}>
                        {t("trustedDomains.manageTitle")}
                    </Typography.Title>

                    <Tabs
                        items={[
                            {
                                key: "trusted",
                                label: t("trustedDomains.tabs.trusted", { count: allowlist.length }),
                                children: (
                                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                        <Typography.Text type="secondary">
                                            {t("trustedDomains.trusted.description")}
                                        </Typography.Text>

                                        <Space.Compact style={{ width: "100%", maxWidth: 520 }}>
                                            <Input
                                                placeholder={t("trustedDomains.trusted.inputPlaceholder")}
                                                value={newDomain}
                                                onChange={(e) => setNewDomain(e.target.value)}
                                                onPressEnter={addAllowlistDomain}
                                                disabled={allowlistLoading || !isAdmin}
                                            />
                                            <Button type="primary" onClick={addAllowlistDomain} loading={allowlistLoading} disabled={!isAdmin}>
                                                {t("trustedDomains.trusted.addToTrusted")}
                                            </Button>
                                            <Button onClick={refreshAllowlist} disabled={allowlistLoading || !isAdmin}>
                                                {t("common.refresh")}
                                            </Button>
                                        </Space.Compact>

                                        <Table
                                            size="middle"
                                            columns={trustedColumns}
                                            dataSource={trustedRows}
                                            loading={allowlistLoading}
                                            pagination={false}
                                        />
                                    </Space>
                                ),
                            },
                            {
                                key: "detected",
                                label: t("trustedDomains.tabs.detected", { count: detectedRows.length }),
                                children: (
                                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                        <Space wrap>
                                            <Button onClick={refreshInstallStatus} loading={installStatusLoading} disabled={!isAdmin}>
                                                {t("common.refresh")}
                                            </Button>
                                            <Typography.Text type="secondary">
                                                {installStatus?.last_seen_at
                                                    ? t("trustedDomains.detected.lastSeen", {
                                                          time: new Date(installStatus.last_seen_at).toLocaleString(),
                                                      })
                                                    : t("trustedDomains.detected.noRecentActivity")}
                                            </Typography.Text>
                                        </Space>

                                        <Table
                                            size="middle"
                                            columns={detectedColumns}
                                            dataSource={detectedRows}
                                            loading={installStatusLoading}
                                            pagination={false}
                                        />
                                    </Space>
                                ),
                            },
                        ]}
                    />
                </Space>
            </Card>
        </div>
    );
}
