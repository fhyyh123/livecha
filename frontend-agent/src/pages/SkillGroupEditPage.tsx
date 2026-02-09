import { useEffect, useMemo, useState } from "react";
import {
    Avatar,
    Button,
    Card,
    Divider,
    Form,
    Input,
    InputNumber,
    Select,
    Space,
    Switch,
    Table,
    Typography,
    notification,
    Modal,
} from "antd";
import { LeftOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type MeResponse = {
    user_id?: string;
    role?: string;
};

type AgentListItem = {
    user_id: string;
    role?: string;
    username: string;
    email?: string | null;
    status: string;
};

type SkillGroupItem = {
    id: string;
    name: string;
    enabled: boolean;
    group_type?: string | null;
    is_fallback?: boolean | null;
    system_key?: string | null;
};

type SkillGroupMemberItem = {
    agent_user_id: string;
    weight: number;
};

function initials(name: string) {
    const t = String(name || "").trim();
    if (!t) return "?";
    return t.slice(0, 1).toUpperCase();
}

function hashString(input: string): number {
    const s = String(input || "");
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) {
        h = (h * 33) ^ s.charCodeAt(i);
    }
    return h >>> 0;
}

function avatarStyle(seed: string) {
    const n = hashString(seed);
    const hue = n % 360;
    const sat = 72;
    const light = 44;
    return {
        backgroundColor: `hsl(${hue} ${sat}% ${light}%)`,
        color: "#fff",
    } as const;
}

function isSystemOrFallbackGroup(g: SkillGroupItem | null | undefined): boolean {
    if (!g) return false;
    if (Boolean(g.is_fallback)) return true;
    return String(g.group_type || "").trim().toLowerCase() === "system";
}

export function SkillGroupEditPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const params = useParams();
    const groupId = String(params.groupId || "").trim();

    const [loading, setLoading] = useState(false);

    const [meRole, setMeRole] = useState<string>("");
    const isAdmin = meRole === "admin";

    const [agents, setAgents] = useState<AgentListItem[]>([]);
    const [group, setGroup] = useState<SkillGroupItem | null>(null);

    const [membersLoading, setMembersLoading] = useState(false);
    const [members, setMembers] = useState<SkillGroupMemberItem[]>([]);

    const [search, setSearch] = useState("");
    const [adding, setAdding] = useState(false);
    const [removingId, setRemovingId] = useState<string>("");

    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<{ name: string; enabled: boolean }>();

    const readonly = isSystemOrFallbackGroup(group);

    const agentById = useMemo(() => {
        const map: Record<string, AgentListItem> = {};
        for (const a of agents) map[a.user_id] = a;
        return map;
    }, [agents]);

    const filteredMembers = useMemo(() => {
        const q = String(search || "").trim().toLowerCase();
        if (!q) return members;
        return members.filter((m) => {
            const a = agentById[m.agent_user_id];
            const username = String(a?.username || m.agent_user_id || "").toLowerCase();
            const email = String(a?.email || "").toLowerCase();
            return username.includes(q) || email.includes(q);
        });
    }, [agentById, members, search]);

    const addMemberOptions = useMemo(() => {
        const current = new Set(members.map((m) => m.agent_user_id));
        return agents
            .filter((a) => !current.has(a.user_id))
            .map((a) => ({
                value: a.user_id,
                label: (
                    <div style={{ lineHeight: 1.2 }}>
                        <div>{a.username}</div>
                        {a.email ? <Typography.Text type="secondary">{a.email}</Typography.Text> : null}
                    </div>
                ),
                search: `${a.username || ""} ${a.email || ""}`.trim(),
            }));
    }, [agents, members]);

    async function refreshAll() {
        if (!groupId) return;
        setLoading(true);
        try {
            const [meRes, agentsRes, groupsRes] = await Promise.all([
                http.get<MeResponse>("/api/v1/auth/me"),
                http.get<AgentListItem[]>("/api/v1/agent/agents"),
                http.get<SkillGroupItem[]>("/api/v1/skill-groups"),
            ]);

            const me = meRes.data || {};
            setMeRole(String(me.role || ""));

            const agentList = Array.isArray(agentsRes.data) ? agentsRes.data : [];
            setAgents(agentList);

            const groupList = Array.isArray(groupsRes.data) ? groupsRes.data : [];
            const found = groupList.find((g) => g.id === groupId) || null;
            setGroup(found);

            if (found) {
                form.setFieldsValue({ name: found.name, enabled: Boolean(found.enabled) });
            }
        } catch (e: unknown) {
            notification.error({
                message: t("team.loadFailedTitle"),
                description: errorMessage(e, "load_group_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setLoading(false);
        }
    }

    async function refreshMembers() {
        if (!groupId) return;
        setMembersLoading(true);
        try {
            const res = await http.get<SkillGroupMemberItem[]>(`/api/v1/skill-groups/${encodeURIComponent(groupId)}/members`);
            setMembers(Array.isArray(res.data) ? res.data : []);
        } catch (e: unknown) {
            notification.error({
                message: t("team.membersLoadFailedTitle"),
                description: errorMessage(e, "load_members_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setMembersLoading(false);
        }
    }

    useEffect(() => {
        void refreshAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId]);

    useEffect(() => {
        if (!groupId) return;
        void refreshMembers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId]);

    async function saveGroup() {
        if (!groupId || !group) return;
        if (!isAdmin || readonly) return;
        try {
            const v = await form.validateFields();
            const name = String(v.name || "").trim();
            const enabled = Boolean(v.enabled);
            setSaving(true);
            const res = await http.patch<SkillGroupItem>(`/api/v1/skill-groups/${encodeURIComponent(groupId)}`, {
                name,
                enabled,
            });
            setGroup(res.data as SkillGroupItem);
            notification.success({
                message: t("common.saved"),
                placement: "bottomRight",
                duration: 1.5,
            });
        } catch (e: unknown) {
            notification.error({
                message: t("common.saveFailed"),
                description: errorMessage(e, "save_group_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setSaving(false);
        }
    }

    async function addMembers(agentUserIds: string[]) {
        if (!groupId) return;
        if (!isAdmin || readonly) return;
        const ids = Array.from(new Set((agentUserIds || []).map((x) => String(x || "").trim()))).filter(Boolean);
        if (!ids.length) return;

        setAdding(true);
        try {
            await Promise.all(
                ids.map((id) =>
                    http.post(`/api/v1/skill-groups/${encodeURIComponent(groupId)}/members`, {
                        agent_user_id: id,
                        weight: 1,
                    }),
                ),
            );
            await refreshMembers();
        } catch (e: unknown) {
            notification.error({
                message: t("team.memberUpdateFailedTitle"),
                description: errorMessage(e, "add_member_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setAdding(false);
        }
    }

    async function updateWeight(agentUserId: string, weight: number) {
        if (!groupId) return;
        if (!isAdmin || readonly) return;
        const safe = Math.max(0, Math.min(100, Number(weight || 0) || 0));
        try {
            await http.post(`/api/v1/skill-groups/${encodeURIComponent(groupId)}/members`, {
                agent_user_id: agentUserId,
                weight: safe,
            });
            setMembers((prev) => prev.map((m) => (m.agent_user_id === agentUserId ? { ...m, weight: safe } : m)));
        } catch (e: unknown) {
            notification.error({
                message: t("team.memberUpdateFailedTitle"),
                description: errorMessage(e, "update_member_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        }
    }

    async function removeMember(agentUserId: string) {
        if (!groupId) return;
        if (!isAdmin || readonly) return;
        setRemovingId(agentUserId);
        try {
            await http.delete(
                `/api/v1/skill-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentUserId)}`,
            );
            setMembers((prev) => prev.filter((m) => m.agent_user_id !== agentUserId));
        } catch (e: unknown) {
            notification.error({
                message: t("team.memberRemoveFailedTitle"),
                description: errorMessage(e, "remove_member_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setRemovingId("");
        }
    }

    async function deleteGroup() {
        if (!groupId || !group) return;
        if (!isAdmin || readonly) return;

        Modal.confirm({
            title: t("team.deleteGroupTitle"),
            content: t("team.deleteGroupConfirm", { name: group.name || groupId }),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                try {
                    await http.delete(`/api/v1/skill-groups/${encodeURIComponent(groupId)}`);
                    notification.success({
                        message: t("common.saved"),
                        placement: "bottomRight",
                        duration: 1.5,
                    });
                    navigate("/team", {
                        replace: true,
                        state: { tab: "groups" },
                    });
                } catch (e: unknown) {
                    const code = String((e as any)?.code || (e as any)?.message || "");
                    const friendly =
                        code === "group_in_use" ? t("team.deleteGroupInUse") : errorMessage(e, "delete_group_failed");
                    notification.error({
                        message: t("team.deleteGroupFailedTitle"),
                        description: friendly,
                        placement: "bottomRight",
                        duration: 3,
                    });
                    throw e;
                }
            },
        });
    }

    const memberCountLabel = t("team.membersCount", { count: members.length });

    const canEdit = isAdmin && !readonly;

    const nameInitial = String(group?.name || "");
    const enabledInitial = Boolean(group?.enabled);
    const nameNow = Form.useWatch("name", form);
    const enabledNow = Form.useWatch("enabled", form);
    const dirty =
        String(nameNow ?? "").trim() !== String(nameInitial).trim() || Boolean(enabledNow) !== Boolean(enabledInitial);

    return (
        <div style={{ padding: 24, background: "#fff", minHeight: "100%" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <Button
                        type="text"
                        icon={<LeftOutlined />}
                        onClick={() => {
                            navigate("/team", { state: { tab: "groups", selectedGroupId: groupId } });
                        }}
                    >
                        {t("common.back")}
                    </Button>

                    <Typography.Title level={4} style={{ margin: 0 }}>
                        {t("team.editGroupTitle")}
                    </Typography.Title>

                    <Button type="primary" loading={saving} disabled={!canEdit || !dirty} onClick={() => void saveGroup()}>
                        {t("common.save")}
                    </Button>
                </div>

                {!group ? (
                    <Typography.Text type="secondary">{t("team.selectGroup")}</Typography.Text>
                ) : (
                    <Card loading={loading} bodyStyle={{ padding: 16 }}>
                        <Form form={form} layout="vertical" initialValues={{ name: group.name, enabled: group.enabled }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                <Avatar size={56} style={avatarStyle(group.id || group.name)}>
                                    {initials(group.name)}
                                </Avatar>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Form.Item
                                        label={t("team.groupName")}
                                        name="name"
                                        rules={[{ required: true, message: t("team.groupNameRequired") }]}
                                    >
                                        <Input disabled={!canEdit} />
                                    </Form.Item>
                                </div>
                            </div>

                            <Form.Item label={t("team.groupEnabled")} name="enabled" valuePropName="checked">
                                <Switch disabled={!canEdit} />
                            </Form.Item>
                        </Form>

                        <Divider />

                        <Typography.Title level={5} style={{ margin: 0 }}>
                            {memberCountLabel}
                        </Typography.Title>

                        <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                <div style={{ flex: 1, minWidth: 260 }}>
                                    <Typography.Text type="secondary">{t("team.addMember")}</Typography.Text>
                                    <div style={{ marginTop: 6 }}>
                                        <Select
                                            mode="multiple"
                                            disabled={!canEdit || adding}
                                            placeholder={t("team.addMembersPlaceholder")}
                                            showSearch
                                            optionFilterProp="search"
                                            style={{ width: "100%" }}
                                            dropdownStyle={{ minWidth: 420 }}
                                            options={addMemberOptions}
                                            value={[]}
                                            onChange={(v) => void addMembers((v as any[]).map((x) => String(x || "")))}
                                        />
                                    </div>
                                </div>
                                <div style={{ width: 260 }}>
                                    <Typography.Text type="secondary">{t("team.searchMembers")}</Typography.Text>
                                    <div style={{ marginTop: 6 }}>
                                        <Input
                                            placeholder={t("team.searchMembersPlaceholder")}
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Table
                                size="small"
                                rowKey="agent_user_id"
                                pagination={false}
                                loading={membersLoading}
                                dataSource={filteredMembers.map((m) => ({ ...m, key: m.agent_user_id }))}
                                columns={[
                                    {
                                        title: t("team.columns.name"),
                                        key: "name",
                                        render: (_: unknown, m: SkillGroupMemberItem) => {
                                            const a = agentById[m.agent_user_id];
                                            const username = a?.username || m.agent_user_id;
                                            return (
                                                <Space size={10}>
                                                    <Avatar style={avatarStyle(m.agent_user_id || username)}>
                                                        {initials(username)}
                                                    </Avatar>
                                                    <div style={{ lineHeight: 1.2 }}>
                                                        <Typography.Text strong>{username}</Typography.Text>
                                                        <div>
                                                            <Typography.Text type="secondary">{a?.email || ""}</Typography.Text>
                                                        </div>
                                                    </div>
                                                </Space>
                                            );
                                        },
                                    },
                                    {
                                        title: t("team.columns.role"),
                                        key: "role",
                                        width: 120,
                                        render: (_: unknown, m: SkillGroupMemberItem) => {
                                            const r = String(agentById[m.agent_user_id]?.role || "agent").toLowerCase();
                                            return <span>{r === "admin" ? t("team.role.owner") : t("team.role.agent")}</span>;
                                        },
                                    },
                                    {
                                        title: t("team.weight"),
                                        key: "weight",
                                        width: 160,
                                        render: (_: unknown, m: SkillGroupMemberItem) => (
                                            <InputNumber
                                                min={0}
                                                max={100}
                                                disabled={!canEdit}
                                                value={m.weight}
                                                onChange={(v) => void updateWeight(m.agent_user_id, Number(v || 0))}
                                            />
                                        ),
                                    },
                                    {
                                        title: "",
                                        key: "remove",
                                        width: 64,
                                        align: "right",
                                        render: (_: unknown, m: SkillGroupMemberItem) => (
                                            <Button
                                                danger
                                                type="text"
                                                disabled={!canEdit}
                                                loading={removingId === m.agent_user_id}
                                                onClick={() => void removeMember(m.agent_user_id)}
                                            >
                                                {t("common.delete")}
                                            </Button>
                                        ),
                                    },
                                ]}
                            />
                        </Space>

                        <Divider />

                        <Typography.Title level={5} style={{ margin: 0 }}>
                            {t("team.deleteGroupSectionTitle")}
                        </Typography.Title>
                        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                            {t("team.deleteGroupSectionDesc")}
                        </Typography.Paragraph>
                        <Button danger type="link" disabled={!canEdit} onClick={() => void deleteGroup()}>
                            {t("common.delete")}
                        </Button>

                        {!isAdmin ? (
                            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                                {t("team.adminOnlyHint")}
                            </Typography.Paragraph>
                        ) : readonly ? (
                            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                                {t("team.systemGroupReadonly")}
                            </Typography.Paragraph>
                        ) : null}
                    </Card>
                )}
                </Space>
            </div>
        </div>
    );
}
