import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

export function TicketFormPage() {
    const { t } = useTranslation();

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("ticketForm.title")}>
                <Typography.Paragraph style={{ marginBottom: 0, color: "rgba(17,24,39,.65)" }}>
                    {t("common.comingSoon")}
                </Typography.Paragraph>
            </Card>
        </div>
    );
}
