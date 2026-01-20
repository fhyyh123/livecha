import { Divider, Empty, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { ConversationDetail } from "../../../store/chatStore";

type Props = {
    t: (key: string, options?: Record<string, unknown>) => string;

    selectedId: string | null;
    detail: ConversationDetail | null;
    detailLoading: boolean;

    anonymousEnabled: boolean;

    embedded?: boolean;
};

export function ProfileTab({ t, selectedId, detail, detailLoading, anonymousEnabled, embedded = false }: Props) {
    const googleMapsKey = (import.meta as any)?.env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

    function getCustomerDisplayName() {
        if (anonymousEnabled) return t("workbench.customer");
        const name = String(detail?.visitor?.name || "").trim();
        const email = String(detail?.visitor?.email || "").trim();
        const who = name && name !== "-" ? name : (email && email !== "-" ? email : "");
        return who || t("workbench.customer");
    }

    if (!selectedId) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />;
    }

    const visitor = detail?.visitor;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!visitor?.geo_timezone) return;
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, [visitor?.geo_timezone]);

    const locationText = useMemo(() => {
        const parts = [visitor?.geo_city, visitor?.geo_region, visitor?.geo_country]
            .map((s) => String(s || "").trim())
            .filter(Boolean);
        return parts.length ? parts.join(", ") : null;
    }, [visitor?.geo_city, visitor?.geo_region, visitor?.geo_country]);

    const localTimeText = useMemo(() => {
        const tz = String(visitor?.geo_timezone || "").trim();
        if (!tz) return null;
        try {
            const d = new Date(now);
            const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
            return `${time} (${tz})`;
        } catch {
            return tz;
        }
    }, [now, visitor?.geo_timezone]);

    const lat = visitor?.geo_lat;
    const lon = visitor?.geo_lon;
    const hasLatLon = typeof lat === "number" && typeof lon === "number";
    const mapEmbedUrl = useMemo(() => {
        if (!hasLatLon) return null;
        if (!googleMapsKey) return null;
        const q = encodeURIComponent(`${lat},${lon}`);
        const key = encodeURIComponent(googleMapsKey);
        return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}`;
    }, [googleMapsKey, hasLatLon, lat, lon]);

    return (
        <div style={{ paddingTop: embedded ? 0 : 4 }}>
            {embedded ? null : (
                <>
                    <Typography.Text strong>{t("workbench.visitor")}</Typography.Text>
                    <Divider style={{ margin: "12px 0" }} />
                </>
            )}

            {detailLoading ? (
                <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
            ) : detail?.visitor ? (
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Typography.Text>{t("workbench.visitorName", { name: getCustomerDisplayName() })}</Typography.Text>
                    <Typography.Text type="secondary">
                        {t("workbench.visitorEmail", { email: anonymousEnabled ? "-" : (detail.visitor.email || "-") })}
                    </Typography.Text>

                    {locationText ? (
                        <Typography.Text type="secondary">{t("workbench.visitorLocation", { location: locationText })}</Typography.Text>
                    ) : null}
                    {localTimeText ? (
                        <Typography.Text type="secondary">{t("workbench.visitorLocalTime", { time: localTimeText })}</Typography.Text>
                    ) : null}

                    {mapEmbedUrl ? (
                        <div style={{ width: "100%", marginTop: 8 }}>
                            <iframe
                                title="visitor-location"
                                src={mapEmbedUrl}
                                width="100%"
                                height={180}
                                style={{ border: 0, borderRadius: 8 }}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                            {hasLatLon ? (
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {t("workbench.openInGoogleMaps")}
                                    </a>
                                </Typography.Text>
                            ) : null}
                        </div>
                    ) : null}
                </Space>
            ) : detail?.customer ? (
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Typography.Text>
                        {t("workbench.customerUsername", { username: detail.customer.username || detail.customer.id })}
                    </Typography.Text>
                    <Typography.Text type="secondary">{t("workbench.customerPhone", { phone: detail.customer.phone || "-" })}</Typography.Text>
                    <Typography.Text type="secondary">{t("workbench.customerEmail", { email: detail.customer.email || "-" })}</Typography.Text>
                </Space>
            ) : (
                <Typography.Text type="secondary">{t("workbench.noVisitorProfile")}</Typography.Text>
            )}

            {/* 技术信息已移动到右栏单独的 Technology 分组 */}
        </div>
    );
}
