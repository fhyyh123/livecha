import { Empty, Space, Typography } from "antd";

type Props = {
    t: (key: string, options?: Record<string, unknown>) => string;
    selectedId: string | null;

    embedded?: boolean;
};

export function CopilotTab({ t, selectedId, embedded = false }: Props) {
    return (
        <Space direction="vertical" size={10} style={{ width: "100%", paddingTop: embedded ? 0 : 4 }}>
            <Typography.Text type="secondary">{t("workbench.copilotComingSoon")}</Typography.Text>
            {!selectedId ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />
            ) : (
                <Typography.Text type="secondary">{t("workbench.copilotHint", { id: selectedId })}</Typography.Text>
            )}
        </Space>
    );
}
