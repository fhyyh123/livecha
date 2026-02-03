import { Button, Card, Input, Space, Typography, Alert } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useSiteStore } from "../store/siteStore";

function buildChatPageUrl(origin: string, siteKey: string) {
    const base = String(origin || "").trim() || "";
    const key = String(siteKey || "").trim();
    if (!base || !key) return "";
    // Keep it simple and pretty: /chat/<public_key>/
    const u = new URL(`/chat/${encodeURIComponent(key)}/`, base);
    return u.toString();
}

async function copyText(text: string): Promise<boolean> {
    const t = String(text || "");
    if (!t) return false;
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(t);
            return true;
        }
    } catch {
        // ignore
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

export function ChatPageSettingsPage() {
    const { t } = useTranslation();
    const nav = useNavigate();

    const { sites, sitesLoading, sitesError, currentSiteId, loadSites } = useSiteStore();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        void loadSites();
    }, [loadSites]);

    const current = useMemo(() => {
        const cur = sites.find((s) => s.id === currentSiteId);
        return cur || sites[0] || null;
    }, [sites, currentSiteId]);

    const url = useMemo(() => {
        if (!current?.public_key) return "";
        return buildChatPageUrl(window.location.origin, current.public_key);
    }, [current?.public_key]);

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography.Title level={3} style={{ margin: 0 }}>
                        {t("chatPage.title")}
                    </Typography.Title>
                    <Button onClick={() => nav("/settings/widget/customize")}>
                        {t("chatPage.customize")}
                    </Button>
                </Space>

                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    {t("chatPage.subtitle")}
                </Typography.Paragraph>

                {sitesError ? <Alert type="error" showIcon message={sitesError} /> : null}

                <Card>
                    {!current && !sitesLoading ? (
                        <Alert type="warning" showIcon message={t("chatPage.noSite")} />
                    ) : null}

                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        <Typography.Text strong>{t("chatPage.linkLabel")}</Typography.Text>
                        <Input value={url} readOnly placeholder={t("chatPage.linkPlaceholder")} />
                        <Space wrap>
                            <Button
                                type="primary"
                                disabled={!url}
                                onClick={async () => {
                                    setCopied(false);
                                    const ok = await copyText(url);
                                    setCopied(ok);
                                    if (ok) setTimeout(() => setCopied(false), 1400);
                                }}
                            >
                                {copied ? t("chatPage.copied") : t("chatPage.copy")}
                            </Button>
                            <Button disabled={!url} onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                            >
                                {t("chatPage.open")}
                            </Button>
                        </Space>
                        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            {t("chatPage.hint")}
                        </Typography.Paragraph>
                    </Space>
                </Card>
            </Space>
        </div>
    );
}
