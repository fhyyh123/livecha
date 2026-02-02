import { Divider, Empty, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { ConversationDetail } from "../../../store/chatStore";

type Props = {
    t: (key: string, options?: Record<string, unknown>) => string;

    selectedId: string | null;
    detail: ConversationDetail | null;
    detailLoading: boolean;

    embedded?: boolean;
};

export function ProfileTab({ t, selectedId, detail, detailLoading, embedded = false }: Props) {
    const googleMapsKey = (String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim() || undefined) as
        | string
        | undefined;

    const visitor = detail?.visitor;
    const customerDisplayName = useMemo(() => {
        const name = String(visitor?.name || "").trim();
        const email = String(visitor?.email || "").trim();
        const who = name && name !== "-" ? name : email && email !== "-" ? email : "";
        return who || t("workbench.customer");
    }, [t, visitor?.email, visitor?.name]);
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

    const preChatFields = useMemo(() => {
        const list = detail?.pre_chat_fields || [];
        return (Array.isArray(list) ? list : [])
            .map((x) => {
                const key = String(x?.field_key || "").trim();
                if (!key) return null;

                const label = String(x?.field_label || "").trim() || key;
                const raw = String(x?.value_json || "").trim();
                if (!raw) return null;

                // Best-effort pretty rendering for JSON-encoded values.
                let display = raw;
                try {
                    const parsed = JSON.parse(raw) as unknown;
                    if (typeof parsed === "string") {
                        display = parsed;
                    } else if (Array.isArray(parsed)) {
                        display = parsed.map((v) => String(v)).join(", ");
                    } else if (parsed && typeof parsed === "object") {
                        display = JSON.stringify(parsed);
                    } else {
                        display = String(parsed);
                    }
                } catch {
                    // keep raw
                }

                return { key, label, display };
            })
            .filter(Boolean) as { key: string; label: string; display: string }[];
    }, [detail?.pre_chat_fields]);

    if (!selectedId) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />;
    }

    const body = detailLoading ? (
        <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
    ) : detail?.visitor ? (
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Typography.Text>{t("workbench.visitorName", { name: customerDisplayName })}</Typography.Text>
            <Typography.Text type="secondary">{t("workbench.visitorEmail", { email: detail.visitor.email || "-" })}</Typography.Text>

            {preChatFields.length ? (
                <div style={{ marginTop: 8 }}>
                    <Typography.Text strong>{t("workbench.preChatFields")}</Typography.Text>
                    <Divider style={{ margin: "8px 0" }} />
                    <Space direction="vertical" size={2} style={{ width: "100%" }}>
                        {preChatFields.map((f) => (
                            <Typography.Text key={f.key} type="secondary">
                                {f.label}: {f.display}
                            </Typography.Text>
                        ))}
                    </Space>
                </div>
            ) : null}

            {locationText ? <Typography.Text type="secondary">{t("workbench.visitorLocation", { location: locationText })}</Typography.Text> : null}
            {localTimeText ? <Typography.Text type="secondary">{t("workbench.visitorLocalTime", { time: localTimeText })}</Typography.Text> : null}

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
            <Typography.Text>{t("workbench.customerUsername", { username: detail.customer.username || detail.customer.id })}</Typography.Text>
            <Typography.Text type="secondary">{t("workbench.customerPhone", { phone: detail.customer.phone || "-" })}</Typography.Text>
            <Typography.Text type="secondary">{t("workbench.customerEmail", { email: detail.customer.email || "-" })}</Typography.Text>
        </Space>
    ) : (
        <Typography.Text type="secondary">{t("workbench.noVisitorProfile")}</Typography.Text>
    );

    return (
        <div style={{ paddingTop: embedded ? 0 : 4 }}>
            {embedded ? null : (
                <>
                    <Typography.Text strong>{t("workbench.visitor")}</Typography.Text>
                    <Divider style={{ margin: "12px 0" }} />
                </>
            )}

            {body}

            {/* 技术信息已移动到右栏单独的 Technology 分组 */}
        </div>
    );
}
