import { Divider, Empty, Input, Select, Space, Typography } from "antd";

import type { Conversation, ConversationMeta } from "../../../store/chatStore";

type Props = {
    t: (key: string, options?: Record<string, unknown>) => string;

    selectedId: string | null;
    selected: Conversation | null;

    meta: ConversationMeta | null;
    metaLoading: boolean;

    onSetTags: (conversationId: string, tags: string[]) => Promise<void>;
    onSetMetaLocal: (conversationId: string, meta: ConversationMeta) => void;
    onSetNote: (conversationId: string, note: string) => Promise<void>;

    embedded?: boolean;
};

export function DetailsTab({ t, selectedId, selected, meta, metaLoading, onSetTags, onSetMetaLocal, onSetNote, embedded = false }: Props) {
    if (!selectedId) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noConversationSelected")} />;
    }

    return (
        <Space direction="vertical" size={10} style={{ width: "100%", paddingTop: embedded ? 0 : 4 }}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {selected ? (
                    <>
                        <Typography.Text type="secondary">{t("workbench.statusLabel", { status: selected.status })}</Typography.Text>
                        <Typography.Text type="secondary">{t("workbench.channelLabel", { channel: selected.channel })}</Typography.Text>
                        <Typography.Text type="secondary">
                            {t("workbench.assignedLabel", { assigned: selected.assigned_agent_user_id || "-" })}
                        </Typography.Text>
                    </>
                ) : (
                    <Typography.Text type="secondary">{t("common.loading")}</Typography.Text>
                )}
            </Space>

            <Divider style={{ margin: "12px 0" }} />

            <Typography.Text strong>{t("workbench.tags")}</Typography.Text>
            <Select
                mode="tags"
                style={{ width: "100%", marginTop: 8 }}
                placeholder={metaLoading ? t("common.loading") : t("workbench.addTags")}
                value={meta?.tags || []}
                disabled={!selectedId || metaLoading}
                onChange={async (vals: string[]) => {
                    if (!selectedId) return;
                    await onSetTags(selectedId, vals.map(String));
                }}
            />

            <Divider style={{ margin: "12px 0" }} />

            <Typography.Text strong>{t("workbench.note")}</Typography.Text>
            <Input.TextArea
                style={{ marginTop: 8 }}
                rows={4}
                value={meta?.note || ""}
                placeholder={metaLoading ? t("common.loading") : t("workbench.notePlaceholder")}
                disabled={!selectedId || metaLoading}
                onChange={(e) => {
                    if (!selectedId) return;
                    const next = e.target.value;
                    onSetMetaLocal(selectedId, { tags: meta?.tags || [], note: next });
                }}
                onBlur={async () => {
                    if (!selectedId) return;
                    await onSetNote(selectedId, String(meta?.note || ""));
                }}
            />
        </Space>
    );
}
