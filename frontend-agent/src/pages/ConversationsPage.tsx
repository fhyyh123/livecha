import { useQuery } from "@tanstack/react-query";
import { Button, Card, List, Space, Tag, Typography } from "antd";
import { StarFilled, StarOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { http } from "../providers/http";

type Conversation = {
    id: string;
    status: string;
    channel: string;
    subject?: string | null;
    assigned_agent_user_id?: string | null;
    visitor_name?: string | null;
    visitor_email?: string | null;
    starred?: boolean;
};

export function ConversationsPage() {
    const nav = useNavigate();
    const { t } = useTranslation();
    const { data, isFetching, refetch } = useQuery({
        queryKey: ["conversations", "assigned"],
        queryFn: async () => {
            const res = await http.get<Conversation[]>("/api/v1/conversations", {
                params: { status: "assigned" },
            });
            return res.data as unknown as Conversation[];
        },
    });

    const list = data || [];

    return (
        <Card
            title={t("conversations.title")}
            extra={
                <Space>
                    <Button onClick={() => refetch()} loading={isFetching}>
                        {t("common.refresh")}
                    </Button>
                </Space>
            }
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                {t("conversations.skeletonHint")}
            </Typography.Paragraph>

            <List
                dataSource={list}
                loading={isFetching}
                renderItem={(c) => (
                    <List.Item
                        key={c.id}
                        actions={[
                            <Button
                                key="open"
                                type="link"
                                onClick={() => nav(`/conversations/${encodeURIComponent(c.id)}`)}
                            >
                                {t("common.open")}
                            </Button>,
                        ]}
                    >
                        <List.Item.Meta
                            title={
                                <Space size={8} wrap>
                                    <Typography.Text code>{c.id}</Typography.Text>
                                    <Tag color={c.status === "assigned" ? "blue" : "default"}>{c.status}</Tag>
                                    <Tag>{c.channel}</Tag>
                                    {c.starred ? <StarFilled /> : <StarOutlined />}
                                </Space>
                            }
                            description={
                                <Space direction="vertical" size={2}>
                                    <span>{c.subject || "-"}</span>
                                    {c.visitor_name || c.visitor_email ? (
                                        <Typography.Text type="secondary">
                                            {t("conversations.visitor", {
                                                name: c.visitor_name || "-",
                                                email: c.visitor_email || "",
                                            })}
                                        </Typography.Text>
                                    ) : null}
                                </Space>
                            }
                        />
                    </List.Item>
                )}
            />

            <div style={{ marginTop: 12 }}>
                <Button onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? t("common.loading") : t("common.loadAgain")}
                </Button>
            </div>
        </Card>
    );
}
