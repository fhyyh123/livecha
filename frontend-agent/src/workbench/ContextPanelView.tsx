import { useMemo, type ReactNode } from "react";
import { Collapse, Divider, Empty, Space, Typography } from "antd";
import {
    GlobalOutlined,
    InfoCircleOutlined,
    LaptopOutlined,
    RightOutlined,
    RobotOutlined,
    UserOutlined,
} from "@ant-design/icons";

import type { Conversation, ConversationDetail, ConversationMeta, ConversationSystemEvent } from "../store/chatStore";
import { CopilotTab } from "./contextPanel/tabs/CopilotTab";
import { DetailsTab } from "./contextPanel/tabs/DetailsTab";
import { ProfileTab } from "./contextPanel/tabs/ProfileTab";

export type ContextPanelViewProps = {
    t: (key: string, options?: Record<string, unknown>) => string;

    tabKey: string;
    setTabKey: (next: string) => void;

    selectedId: string | null;
    selected: Conversation | null;

    detail: ConversationDetail | null;
    detailLoading: boolean;

    meta: ConversationMeta | null;
    metaLoading: boolean;

    systemEvents?: ConversationSystemEvent[];

    anonymousEnabled?: boolean;
    onSetTags: (conversationId: string, tags: string[]) => Promise<void>;
    onSetMetaLocal: (conversationId: string, meta: ConversationMeta) => void;
    onSetNote: (conversationId: string, note: string) => Promise<void>;
};

export function ContextPanelView({
    t,
    tabKey,
    setTabKey,
    selectedId,
    selected,
    detail,
    detailLoading,
    meta,
    metaLoading,
    systemEvents,
    anonymousEnabled = false,
    onSetTags,
    onSetMetaLocal,
    onSetNote,
}: ContextPanelViewProps) {
    const allowed = useMemo(() => new Set(["customer", "additional", "visited", "technology", "copilot"]), []);

    const tech = useMemo(() => {
        const ip = String(detail?.visitor?.last_ip || "").trim();
        const ua = String(detail?.visitor?.last_user_agent || "").trim();

        const parseOs = (uaRaw: string): string => {
            const u = uaRaw || "";
            // Windows
            const win = u.match(/Windows NT\s*([0-9.]+)/i);
            if (win) {
                const v = win[1] || "";
                const major = v.startsWith("10") ? "10" : v.startsWith("11") ? "11" : v.startsWith("6.3") ? "8.1" : v.startsWith("6.2") ? "8" : v.startsWith("6.1") ? "7" : v;
                return major ? `Windows (${major})` : "Windows";
            }
            // macOS
            const mac = u.match(/Mac OS X\s*([0-9_]+)/i);
            if (mac) {
                const v = (mac[1] || "").replace(/_/g, ".");
                return v ? `macOS (${v})` : "macOS";
            }
            // iOS (iPhone/iPad)
            const ios = u.match(/(iPhone|iPad).*OS\s*([0-9_]+)/i);
            if (ios) {
                const v = (ios[2] || "").replace(/_/g, ".");
                return v ? `iOS (${v})` : "iOS";
            }
            // Android
            const and = u.match(/Android\s*([0-9.]+)/i);
            if (and) {
                const v = and[1] || "";
                return v ? `Android (${v})` : "Android";
            }
            // Linux
            if (/Linux/i.test(u)) return "Linux";
            return uaRaw ? t("workbench.technology.unknown") : "-";
        };

        const parseBrowser = (uaRaw: string): string => {
            const u = uaRaw || "";
            // Edge (Chromium)
            const edg = u.match(/Edg\/(\d+[.\d]*)/);
            if (edg) return `Edge (${edg[1]})`;

            // Chrome (ignore Chromium-based that also contain Chrome like Edge/Opera)
            const op = u.match(/OPR\/(\d+[.\d]*)/);
            if (op) return `Opera (${op[1]})`;

            const chrome = u.match(/Chrome\/(\d+[.\d]*)/);
            if (chrome && !/Edg\//.test(u) && !/OPR\//.test(u)) return `Chrome (${chrome[1]})`;

            // Safari
            const safari = u.match(/Version\/(\d+[.\d]*)\s+Safari\//);
            if (safari && !/Chrome\//.test(u) && !/Chromium\//.test(u)) return `Safari (${safari[1]})`;

            // Firefox
            const ff = u.match(/Firefox\/(\d+[.\d]*)/);
            if (ff) return `Firefox (${ff[1]})`;

            return uaRaw ? t("workbench.technology.unknown") : "-";
        };

        return {
            ip: ip || "-",
            os: parseOs(ua),
            browser: parseBrowser(ua),
        };
    }, [detail?.visitor?.last_ip, detail?.visitor?.last_user_agent, t]);

    const safeActiveKeys = useMemo(() => {
        const raw = String(tabKey || "").trim();

        const mapLegacy = (k: string) => {
            if (k === "profile") return "customer";
            if (k === "details") return "additional";
            return k;
        };

        // New storage: JSON array (e.g. ["customer","technology"]).
        if (raw.startsWith("[")) {
            try {
                const arr = JSON.parse(raw) as unknown;
                const keys = Array.isArray(arr) ? arr.map((x) => mapLegacy(String(x || ""))).filter((k) => allowed.has(k)) : [];
                return keys.length ? keys : ["customer"];
            } catch {
                // fallthrough
            }
        }

        const single = mapLegacy(raw);
        return allowed.has(single) ? [single] : ["customer"];
    }, [allowed, tabKey]);

    const technologyPanel = selectedId ? (
        <Space direction="vertical" size={6} style={{ width: "100%", paddingTop: 4 }}>
            <Typography.Text>
                {t("workbench.technology.ipAddress")}: <Typography.Text strong>{tech.ip}</Typography.Text>
            </Typography.Text>
            <Typography.Text>
                {t("workbench.technology.osDevice")}: <Typography.Text strong>{tech.os}</Typography.Text>
            </Typography.Text>
            <Typography.Text>
                {t("workbench.technology.browser")}: <Typography.Text strong>{tech.browser}</Typography.Text>
            </Typography.Text>
        </Space>
    ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />
    );

    const visitedPages = useMemo(() => {
        if (!selectedId) return [];
        const events = systemEvents || [];
        const out: Array<{ created_at: number; url: string; title?: string; referrer?: string }> = [];
        for (const e of events) {
            if (!e || e.event_key !== "page_view") continue;
            const data = (e.data || {}) as Record<string, unknown>;
            const url = String(data.url || "").trim();
            if (!url) continue;
            const title = String(data.title || "").trim();
            const referrer = String(data.referrer || "").trim();
            out.push({
                created_at: Number(e.created_at || 0),
                url,
                title: title || undefined,
                referrer: referrer || undefined,
            });
        }

        out.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        // Dedupe consecutive same-URL after sorting.
        const deduped: typeof out = [];
        for (const item of out) {
            const last = deduped.length ? deduped[deduped.length - 1] : null;
            if (last && last.url === item.url) continue;
            deduped.push(item);
        }

        return deduped.slice(0, 20);
    }, [selectedId, systemEvents]);

    const visitedPagesPanel = selectedId ? (
        visitedPages.length ? (
            <Space direction="vertical" size={10} style={{ width: "100%", paddingTop: 4 }}>
                {visitedPages.map((p) => {
                    const ts = Number(p.created_at || 0);
                    const when = ts > 0 ? new Date(ts * 1000).toLocaleString() : "";
                    const label = p.title ? p.title : p.url;
                    return (
                        <div key={`${p.url}-${p.created_at}`}>
                            <Typography.Link href={p.url} target="_blank" rel="noreferrer">
                                {label}
                            </Typography.Link>
                            <div>
                                <Typography.Text type="secondary">{when}</Typography.Text>
                                {p.referrer ? (
                                    <>
                                        <Typography.Text type="secondary"> · </Typography.Text>
                                        <Typography.Text type="secondary">{p.referrer}</Typography.Text>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </Space>
        ) : (
            <Typography.Text type="secondary" style={{ paddingTop: 4, display: "block" }}>
                {t("workbench.contextSections.visitedPagesEmpty")}
            </Typography.Text>
        )
    ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />
    );

    const onChange = (key: string | string[]) => {
        const keys = (Array.isArray(key) ? key : [key])
            .map((k) => String(k || "").trim())
            .filter((k) => allowed.has(k));
        setTabKey(JSON.stringify(keys));
    };

    const expandIcon = ({ isActive }: { isActive?: boolean }): ReactNode => (
        <span
            style={{
                display: "inline-flex",
                transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
                color: "rgba(0,0,0,0.45)",
            }}
        >
            <RightOutlined />
        </span>
    );

    return (
        <div style={{ padding: 12 }}>
            <Typography.Text strong>{t("workbench.userInfo")}</Typography.Text>
            <Divider style={{ margin: "12px 0" }} />

            <Collapse
                activeKey={safeActiveKeys}
                onChange={onChange}
                bordered={false}
                ghost
                expandIconPosition="end"
                expandIcon={expandIcon}
                items={[
                    {
                        key: "customer",
                        label: (
                            <Space size={10}>
                                <UserOutlined />
                                <span>{t("workbench.customer")}</span>
                            </Space>
                        ),
                        children: (
                            <ProfileTab
                                t={t}
                                selectedId={selectedId}
                                detail={detail}
                                detailLoading={detailLoading}
                                anonymousEnabled={anonymousEnabled}
                                embedded
                            />
                        ),
                    },
                    {
                        key: "additional",
                        label: (
                            <Space size={10}>
                                <InfoCircleOutlined />
                                <span>{t("workbench.contextSections.additionalInfo")}</span>
                            </Space>
                        ),
                        children: (
                            <DetailsTab
                                t={t}
                                selectedId={selectedId}
                                selected={selected}
                                detail={detail}
                                detailLoading={detailLoading}
                                meta={meta}
                                metaLoading={metaLoading}
                                onSetTags={onSetTags}
                                onSetMetaLocal={onSetMetaLocal}
                                onSetNote={onSetNote}
                                embedded
                            />
                        ),
                    },
                    {
                        key: "visited",
                        label: (
                            <Space size={10}>
                                <GlobalOutlined />
                                <span>{t("workbench.contextSections.visitedPages")}</span>
                            </Space>
                        ),
                        children: visitedPagesPanel,
                    },
                    {
                        key: "technology",
                        label: (
                            <Space size={10}>
                                <LaptopOutlined />
                                <span>{t("workbench.technicalInfo")}</span>
                            </Space>
                        ),
                        children: technologyPanel,
                    },
                    {
                        key: "copilot",
                        label: (
                            <Space size={10}>
                                <RobotOutlined />
                                <span>{t("workbench.tabs.copilot")}</span>
                            </Space>
                        ),
                        children: <CopilotTab t={t} selectedId={selectedId} embedded />, 
                    },
                ]}
            />
        </div>
    );
}
