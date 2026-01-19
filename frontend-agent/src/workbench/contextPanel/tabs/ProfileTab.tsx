import { Divider, Empty, Space, Typography } from "antd";

import type { ConversationDetail } from "../../../store/chatStore";

type Props = {
    t: (key: string, options?: Record<string, unknown>) => string;

    selectedId: string | null;
    detail: ConversationDetail | null;
    detailLoading: boolean;

    anonymousEnabled: boolean;
};

export function ProfileTab({ t, selectedId, detail, detailLoading, anonymousEnabled }: Props) {
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

    return (
        <div style={{ paddingTop: 4 }}>
            <Typography.Text strong>{t("workbench.visitor")}</Typography.Text>
            <Divider style={{ margin: "12px 0" }} />

            {detailLoading ? (
                <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
            ) : detail?.visitor ? (
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Typography.Text>{t("workbench.visitorName", { name: getCustomerDisplayName() })}</Typography.Text>
                    <Typography.Text type="secondary">
                        {t("workbench.visitorEmail", { email: anonymousEnabled ? "-" : (detail.visitor.email || "-") })}
                    </Typography.Text>
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

            {detail ? (
                <div style={{ marginTop: 12 }}>
                    <details>
                        <summary style={{ cursor: "pointer", color: "rgba(0,0,0,0.45)" }}>{t("workbench.technicalInfo")}</summary>
                        <div style={{ marginTop: 8 }}>
                            <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                {selectedId ? (
                                    <Typography.Text type="secondary">
                                        {t("workbench.conversationId")}
                                        <Typography.Text code>{selectedId}</Typography.Text>
                                    </Typography.Text>
                                ) : null}
                                {detail.visitor?.id ? (
                                    <Typography.Text type="secondary">
                                        VisitorID：<Typography.Text code>{detail.visitor.id}</Typography.Text>
                                    </Typography.Text>
                                ) : null}
                                {detail.customer?.id ? (
                                    <Typography.Text type="secondary">
                                        {t("workbench.customerId")}
                                        <Typography.Text code>{detail.customer.id}</Typography.Text>
                                    </Typography.Text>
                                ) : null}
                            </Space>
                        </div>
                    </details>
                </div>
            ) : null}
        </div>
    );
}
