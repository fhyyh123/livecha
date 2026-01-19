import { Card, Typography } from "antd";
import { useLocation } from "react-router-dom";

export function SettingsPlaceholderPage() {
    const loc = useLocation();

    return (
        <div style={{ padding: 16 }}>
            <Card>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                    Coming soon
                </Typography.Title>
                <Typography.Paragraph style={{ marginBottom: 0, color: "rgba(17,24,39,.65)" }}>
                    {loc.pathname}
                </Typography.Paragraph>
            </Card>
        </div>
    );
}
