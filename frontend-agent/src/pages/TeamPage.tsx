import { useEffect, useMemo, useState } from "react";
import {
    Avatar,
    Button,
    Card,
    Dropdown,
    Descriptions,
    Divider,
    Form,
    Input,
    InputNumber,
    List,
    Modal,
    Select,
    Space,
    Switch,
    Table,
    Tabs,
    Tag,
    Typography,
    notification,
} from "antd";
import { DownOutlined, EllipsisOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { http, TOKEN_STORAGE_KEY } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";
import { MasterDetailLayout } from "../components/MasterDetailLayout";
import { InviteAgentsModal } from "../components/InviteAgentsModal";

const ADD_AGENT_ROW_ID = "__add_new_agent__";

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
    max_concurrent?: number | null;
};

type AgentRow =
    | ({
          key: string;
          __rowType: "add";
          user_id: string;
          username: string;
          email: string;
          role: string;
          status: string;
      })
    | (AgentListItem & {
          key: string;
          __rowType: "agent";
      });

type AgentStatusResponse = {
    user_id: string;
    status: string;
    effective_status: string;
    max_concurrent: number;
    assigned_active: number;
    remaining_capacity: number;
    can_accept: boolean;
};

type SkillGroupItem = {
    id: string;
    name: string;
    enabled: boolean;
};

type SkillGroupMemberItem = {
    agent_user_id: string;
    weight: number;
};

type SkillGroupStats = {
    total: number;
    accepting: number;
    sampleAgentIds: string[];
};

function initials(name: string) {
    const t = String(name || "").trim();
    if (!t) return "?";
    return t.slice(0, 1).toUpperCase();
}

export function TeamPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);

    const [agents, setAgents] = useState<AgentListItem[]>([]);
    const [myStatus, setMyStatus] = useState<AgentStatusResponse | null>(null);

    const [activeTab, setActiveTab] = useState<"agents" | "groups">("agents");
    const [selectedAgentId, setSelectedAgentId] = useState<string>("");

    const [meRole, setMeRole] = useState<string>("");
    const [meUserId, setMeUserId] = useState<string>("");
    const isAdmin = meRole === "admin";

    const effectiveMeUserId = meUserId || String(myStatus?.user_id || "");

    const [groups, setGroups] = useState<SkillGroupItem[]>([]);

    const [selectedGroupId, setSelectedGroupId] = useState<string>("");

    const [createGroupOpen, setCreateGroupOpen] = useState(false);
    const [createGroupLoading, setCreateGroupLoading] = useState(false);
    const [createGroupForm] = Form.useForm<{ name: string; enabled: boolean }>();

    const [chatLimitOpen, setChatLimitOpen] = useState(false);
    const [chatLimitSaving, setChatLimitSaving] = useState(false);
    const [chatLimitAgent, setChatLimitAgent] = useState<AgentListItem | null>(null);
    const [chatLimitValue, setChatLimitValue] = useState<number>(3);

    const [membersLoading, setMembersLoading] = useState(false);
    const [members, setMembers] = useState<SkillGroupMemberItem[]>([]);

    const [groupStatsLoading, setGroupStatsLoading] = useState(false);
    const [groupStats, setGroupStats] = useState<Record<string, SkillGroupStats>>({});

    const [addMemberAgentId, setAddMemberAgentId] = useState<string>("");
    const [addMemberWeight, setAddMemberWeight] = useState<number>(1);
    const [addingMember, setAddingMember] = useState(false);

    const [inviteOpen, setInviteOpen] = useState(false);

    const agentById = useMemo(() => {
        const map: Record<string, AgentListItem> = {};
        for (const a of agents) {
            map[a.user_id] = a;
        }
        return map;
    }, [agents]);

    const selectedAgent = useMemo(() => {
        const id = selectedAgentId || (agents.length ? agents[0]?.user_id : "");
        if (!id) return null;
        return agentById[id] || null;
    }, [agentById, agents, selectedAgentId]);

    const isSelectedMe = Boolean(selectedAgent && effectiveMeUserId && selectedAgent.user_id === effectiveMeUserId);

    function logoutNow() {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.location.assign("/login");
    }

    function openChatLimitModal(agent: AgentListItem) {
        const isMe = Boolean(effectiveMeUserId && agent.user_id === effectiveMeUserId);
        const canEdit = isMe || isAdmin;
        if (!canEdit) {
            notification.info({
                message: t("team.comingSoon"),
                description: t("team.actions.changeChatLimit"),
                placement: "bottomRight",
                duration: 2,
            });
            return;
        }

        const initial = Math.max(
            1,
            Math.min(50, Number((isMe ? myStatus?.max_concurrent : agent.max_concurrent) ?? 3) || 3),
        );
        setChatLimitAgent(agent);
        setChatLimitValue(initial);
        setChatLimitOpen(true);
    }

    function renderAgentStatusCell(status: unknown, agent: AgentListItem) {
        const raw = String(status || "").toLowerCase();
        const isMe = Boolean(effectiveMeUserId && agent.user_id === effectiveMeUserId);
        const canManage = isMe || isAdmin;
        const isViewerAgent = meRole === "agent";
        const statusEditable = canManage && raw !== "offline";

                const statusLabel =
                        raw === "online"
                                ? t("team.acceptingChats")
                                : raw === "away"
                                    ? t("team.notAcceptingChats")
                                    : t(`team.status.${raw}`);

                const dotColor =
                        raw === "online"
                                ? "#16a34a"
                                : raw === "away"
                                    ? "#f59e0b"
                                    : raw === "busy"
                                        ? "#f97316"
                                        : raw === "offline"
                                            ? "#94a3b8"
                                            : "#bfbfbf";

        const pill = (
            <Space size={6} style={{ userSelect: "none" }}>
                <span
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: dotColor,
                        display: "inline-block",
                    }}
                />
                <Typography.Text>{statusLabel}</Typography.Text>
                {statusEditable ? <DownOutlined style={{ fontSize: 10, color: "#8c8c8c" }} /> : null}
            </Space>
        );

        const statusNode = statusEditable ? (
            <Dropdown
                trigger={["click"]}
                menu={{
                    items: [
                        {
                            key: "accept",
                            label: (
                                <Space size={8}>
                                    <span
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 999,
                                            background: "#16a34a",
                                            display: "inline-block",
                                        }}
                                    />
                                    <Typography.Text>{t("team.acceptingChats")}</Typography.Text>
                                </Space>
                            ),
                        },
                        {
                            key: "not_accept",
                            label: (
                                <Space size={8}>
                                    <span
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 999,
                                            background: "#ef4444",
                                            display: "inline-block",
                                        }}
                                    />
                                    <Typography.Text>{t("team.notAcceptingChats")}</Typography.Text>
                                </Space>
                            ),
                        },
                        ...(isMe
                            ? [
                                  { type: "divider" as const },
                                  {
                                      key: "logout",
                                      label: <Typography.Text>{t("team.logOut")}</Typography.Text>,
                                  },
                              ]
                            : []),
                    ],
                    selectable: true,
                    selectedKeys: [raw === "online" ? "accept" : "not_accept"],
                    onClick: ({ key, domEvent }) => {
                        domEvent?.stopPropagation();
                        domEvent?.preventDefault();
                        if (key === "accept") void setAgentAcceptingChats(agent.user_id, true);
                        else if (key === "not_accept") void setAgentAcceptingChats(agent.user_id, false);
                        else if (key === "logout" && isMe) logoutNow();
                    },
                }}
            >
                <span
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    {pill}
                </span>
            </Dropdown>
        ) : (
            pill
        );

        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>{statusNode}</div>
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items:
                            isViewerAgent && !isMe
                                ? [{ key: "view_reports", label: t("team.actions.viewAgentReports") }]
                                : [
                                      { key: "edit_profile", label: t("team.actions.editProfile") },
                                      { key: "change_chat_limit", label: t("team.actions.changeChatLimit") },
                                      { key: "view_reports", label: t("team.actions.viewAgentReports") },
                                  ],
                        onClick: ({ key, domEvent }) => {
                            domEvent?.stopPropagation();
                            domEvent?.preventDefault();
                            if (key === "edit_profile") {
                                const isMe = Boolean(effectiveMeUserId && agent.user_id === effectiveMeUserId);
                                if (isMe) {
                                    navigate("/profile");
                                    return;
                                }
                                if (isAdmin) {
                                    navigate(`/profile?userId=${encodeURIComponent(agent.user_id)}`);
                                    return;
                                }
                                notification.info({
                                    message: t("team.comingSoon"),
                                    description: t("team.actions.editProfile"),
                                    placement: "bottomRight",
                                    duration: 2,
                                });
                                return;
                            }
                            if (key === "change_chat_limit") {
                                openChatLimitModal(agent);
                                return;
                            }
                            notification.info({
                                message: t("team.comingSoon"),
                                description: key === "view_reports" ? t("team.actions.viewAgentReports") : String(key),
                                placement: "bottomRight",
                                duration: 2,
                            });
                        },
                    }}
                >
                    <Button
                        type="text"
                        size="small"
                        icon={<EllipsisOutlined />}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    />
                </Dropdown>
            </div>
        );
    }

    function renderAgentStatusPill(status: unknown) {
        const raw = String(status || "").toLowerCase();
                const statusLabel =
                        raw === "online"
                                ? t("team.acceptingChats")
                                : raw === "away"
                                    ? t("team.notAcceptingChats")
                                    : t(`team.status.${raw}`);

                const dotColor =
                        raw === "online"
                                ? "#16a34a"
                                : raw === "away"
                                    ? "#f59e0b"
                                    : raw === "busy"
                                        ? "#f97316"
                                        : raw === "offline"
                                            ? "#94a3b8"
                                            : "#bfbfbf";

        return (
            <Space size={6} style={{ userSelect: "none" }}>
                <span
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: dotColor,
                        display: "inline-block",
                    }}
                />
                <Typography.Text>{statusLabel}</Typography.Text>
            </Space>
        );
    }

    async function refreshAll() {
        setLoading(true);
        try {
            const [agentsRes, statusRes, groupsRes, meRes] = await Promise.all([
                http.get<AgentListItem[]>("/api/v1/agent/agents"),
                http.get<AgentStatusResponse>("/api/v1/agent/status"),
                http.get<SkillGroupItem[]>("/api/v1/skill-groups"),
                http.get<MeResponse>("/api/v1/auth/me"),
            ]);

            const agentList = Array.isArray(agentsRes.data) ? agentsRes.data : [];
            setAgents(agentList);

            const st = statusRes.data || null;
            setMyStatus(st);

            const groupList = Array.isArray(groupsRes.data) ? groupsRes.data : [];
            setGroups(groupList);

            const role = String(meRes.data?.role || "");
            setMeRole(role);

            const myId = String(meRes.data?.user_id || "");
            setMeUserId(myId);

            // Ensure local selection is valid (we intentionally do NOT sync selection to URL).
            const agentOk = selectedAgentId && agentList.some((a) => a.user_id === selectedAgentId);
            if (!agentOk) {
                const fallbackAgent =
                    (myId && agentList.some((a) => a.user_id === myId) ? myId : "") ||
                    (st?.user_id && agentList.some((a) => a.user_id === st.user_id) ? st.user_id : "") ||
                    agentList[0]?.user_id ||
                    "";
                setSelectedAgentId(fallbackAgent);
            }

            const groupOk = selectedGroupId && groupList.some((g) => g.id === selectedGroupId);
            if (!groupOk) {
                setSelectedGroupId("");
            }
        } catch (e: unknown) {
            notification.error({
                message: t("team.loadFailedTitle"),
                description: errorMessage(e, "load_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refreshAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        function onAgentStatus(ev: Event) {
            const detail = (ev as CustomEvent).detail as {
                user_id?: string;
                status?: string;
                effective_status?: string;
                max_concurrent?: number;
                assigned_active?: number;
                remaining_capacity?: number;
                can_accept?: boolean;
            };
            const userId = String(detail?.user_id || "");
            if (!userId) return;

            setAgents((prev) =>
                prev.map((a) =>
                    a.user_id === userId
                        ? {
                              ...a,
                              status: String(detail.status ?? a.status ?? "offline"),
                              max_concurrent:
                                  typeof detail.max_concurrent === "number" ? detail.max_concurrent : a.max_concurrent,
                          }
                        : a,
                ),
            );

            setMyStatus((prev) => {
                if (!prev || prev.user_id !== userId) return prev;
                return {
                    ...prev,
                    status: String(detail.status ?? prev.status ?? "offline"),
                    effective_status: String(detail.effective_status ?? prev.effective_status ?? prev.status),
                    max_concurrent:
                        typeof detail.max_concurrent === "number" ? detail.max_concurrent : prev.max_concurrent,
                    assigned_active:
                        typeof detail.assigned_active === "number" ? detail.assigned_active : prev.assigned_active,
                    remaining_capacity:
                        typeof detail.remaining_capacity === "number" ? detail.remaining_capacity : prev.remaining_capacity,
                    can_accept:
                        typeof detail.can_accept === "boolean" ? detail.can_accept : prev.can_accept,
                };
            });
        }

        window.addEventListener("chatlive:agentStatus", onAgentStatus);
        return () => window.removeEventListener("chatlive:agentStatus", onAgentStatus);
    }, []);

    useEffect(() => {
        if (activeTab !== "groups") return;
        if (!selectedGroupId) {
            setMembers([]);
            return;
        }
        setMembersLoading(true);
        http
            .get<SkillGroupMemberItem[]>(`/api/v1/skill-groups/${encodeURIComponent(selectedGroupId)}/members`)
            .then((res) => setMembers(Array.isArray(res.data) ? res.data : []))
            .catch((e: unknown) => {
                notification.error({
                    message: t("team.membersLoadFailedTitle"),
                    description: errorMessage(e, "load_members_failed"),
                    placement: "bottomRight",
                    duration: 3,
                });
            })
            .finally(() => setMembersLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, selectedGroupId]);

    useEffect(() => {
        if (activeTab !== "groups") return;
        if (!groups.length) {
            setGroupStats({});
            return;
        }

        let cancelled = false;
        setGroupStatsLoading(true);

        Promise.all(
            groups.map(async (g) => {
                try {
                    const res = await http.get<SkillGroupMemberItem[]>(
                        `/api/v1/skill-groups/${encodeURIComponent(g.id)}/members`,
                    );
                    const list = Array.isArray(res.data) ? res.data : [];
                    const total = list.length;
                    const sampleAgentIds = list.slice(0, 3).map((m) => m.agent_user_id);

                    let accepting = 0;
                    for (const m of list) {
                        const a = agents.find((x) => x.user_id === m.agent_user_id);
                        const st = String(a?.status || "").toLowerCase();
                        if (st === "online") accepting += 1;
                    }

                    return [g.id, { total, accepting, sampleAgentIds } satisfies SkillGroupStats] as const;
                } catch {
                    return [g.id, { total: 0, accepting: 0, sampleAgentIds: [] } satisfies SkillGroupStats] as const;
                }
            }),
        )
            .then((pairs) => {
                if (cancelled) return;
                const next: Record<string, SkillGroupStats> = {};
                for (const [id, st] of pairs) next[id] = st;
                setGroupStats(next);
            })
            .finally(() => {
                if (cancelled) return;
                setGroupStatsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, agents, groups]);

    async function setAgentAcceptingChats(userId: string, next: boolean) {
        const targetUserId = String(userId || "");
        if (!targetUserId) return;
        const isMe = Boolean(effectiveMeUserId && targetUserId === effectiveMeUserId);

        if (!isMe && !isAdmin) {
            notification.info({
                message: t("team.comingSoon"),
                description: t("team.acceptingChats"),
                placement: "bottomRight",
                duration: 2,
            });
            return;
        }

        const status = next ? "online" : "away";
        const currentMax =
            (isMe ? myStatus?.max_concurrent : agents.find((a) => a.user_id === targetUserId)?.max_concurrent) ?? 3;
        const maxConcurrent = Math.max(1, Math.min(50, Number(currentMax || 0) || 3));

        try {
            if (isMe) {
                await http.post("/api/v1/agent/status", { status, max_concurrent: maxConcurrent });
            } else {
                await http.post(`/api/v1/agent/users/${encodeURIComponent(targetUserId)}/status`, {
                    status,
                    max_concurrent: maxConcurrent,
                });
            }
            await refreshAll();
        } catch (e: unknown) {
            notification.error({
                message: t("team.updateFailedTitle"),
                description: errorMessage(e, "update_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        }
    }

    async function setAgentMaxConcurrent(userId: string, nextMax: number) {
        const targetUserId = String(userId || "");
        if (!targetUserId) return;
        const isMe = Boolean(effectiveMeUserId && targetUserId === effectiveMeUserId);

        if (!isMe && !isAdmin) {
            notification.info({
                message: t("team.comingSoon"),
                description: t("team.actions.changeChatLimit"),
                placement: "bottomRight",
                duration: 2,
            });
            return;
        }

        const safe = Math.max(1, Math.min(50, Number(nextMax || 0) || 1));
        const currentStatus =
            (isMe ? myStatus?.status : agents.find((a) => a.user_id === targetUserId)?.status) || "offline";

        try {
            if (isMe) {
                await http.post("/api/v1/agent/status", { status: currentStatus, max_concurrent: safe });
            } else {
                await http.post(`/api/v1/agent/users/${encodeURIComponent(targetUserId)}/status`, {
                    status: currentStatus,
                    max_concurrent: safe,
                });
            }
            await refreshAll();
        } catch (e: unknown) {
            notification.error({
                message: t("team.updateFailedTitle"),
                description: errorMessage(e, "update_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        }
    }

    async function addOrUpdateMember() {
        if (!selectedGroupId) return;
        const agentUserId = String(addMemberAgentId || "");
        if (!agentUserId) return;
        const weight = Math.max(0, Math.min(100, Number(addMemberWeight || 0) || 0));

        setAddingMember(true);
        try {
            await http.post(`/api/v1/skill-groups/${encodeURIComponent(selectedGroupId)}/members`, {
                agent_user_id: agentUserId,
                weight,
            });
            const res = await http.get<SkillGroupMemberItem[]>(
                `/api/v1/skill-groups/${encodeURIComponent(selectedGroupId)}/members`,
            );
            setMembers(Array.isArray(res.data) ? res.data : []);
            setAddMemberAgentId("");
            setAddMemberWeight(1);
        } catch (e: unknown) {
            notification.error({
                message: t("team.memberUpdateFailedTitle"),
                description: errorMessage(e, "update_member_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setAddingMember(false);
        }
    }

    async function removeMember(agentUserId: string) {
        if (!selectedGroupId) return;
        try {
            await http.delete(
                `/api/v1/skill-groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(agentUserId)}`,
            );
            setMembers((prev) => prev.filter((m) => m.agent_user_id !== agentUserId));
        } catch (e: unknown) {
            notification.error({
                message: t("team.memberRemoveFailedTitle"),
                description: errorMessage(e, "remove_member_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        }
    }

    async function createGroup(values: { name: string; enabled: boolean }) {
        const name = String(values?.name || "").trim();
        if (!name) return;
        setCreateGroupLoading(true);
        try {
            const res = await http.post<SkillGroupItem>("/api/v1/skill-groups", {
                name,
                enabled: Boolean(values?.enabled),
            });
            setGroups((prev) => [res.data as SkillGroupItem, ...prev]);
            setCreateGroupOpen(false);
            createGroupForm.resetFields();
        } catch (e: unknown) {
            notification.error({
                message: t("team.createGroupFailedTitle"),
                description: errorMessage(e, "create_group_failed"),
                placement: "bottomRight",
                duration: 3,
            });
        } finally {
            setCreateGroupLoading(false);
        }
    }

    const addMemberOptions = useMemo(() => {
        const current = new Set(members.map((m) => m.agent_user_id));
        return agents
            .filter((a) => !current.has(a.user_id))
            .map((a) => ({ value: a.user_id, label: a.username }));
    }, [agents, members]);

    const agentTableData = useMemo<AgentRow[]>(() => {
        const addRow: AgentRow = {
            user_id: ADD_AGENT_ROW_ID,
            username: t("team.addNewAgent"),
            email: "",
            role: "",
            status: "",
            key: ADD_AGENT_ROW_ID,
            __rowType: "add",
        };
        const rows: AgentRow[] = agents.map((a) => ({ ...a, key: a.user_id, __rowType: "agent" }));
        return [addRow, ...rows];
    }, [agents, t]);

    return (
        <div style={{ padding: 16, background: "#fff" }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <div>
                        <Typography.Title level={3} style={{ margin: 0 }}>
                            {t("team.title")}
                        </Typography.Title>
                        <Typography.Text type="secondary">{t("team.subtitle")}</Typography.Text>
                    </div>
                    <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refreshAll()}>
                        {t("common.refresh")}
                    </Button>
                </Space>

                <Card bodyStyle={{ padding: 0 }}>
                    <Tabs
                        activeKey={activeTab}
                        tabBarStyle={{ paddingLeft: 12 }}
                        onChange={(k) => {
                            setActiveTab(k === "groups" ? "groups" : "agents");
                        }}
                        items={[
                            {
                                key: "agents",
                                label: t("team.tabs.agents"),
                                children: (
                                    <MasterDetailLayout
                                        master={
                                            <div style={{ padding: 12, height: "100%", overflow: "hidden", background: "#fff" }}>
                                                <Input
                                                    placeholder={t("team.searchAgent")}
                                                    allowClear
                                                    onChange={(e) => {
                                                        const q = String(e.target.value || "").toLowerCase();
                                                        if (!q) return;
                                                        const found = agents.find((a) => a.username.toLowerCase().includes(q));
                                                        if (!found) return;
                                                        setActiveTab("agents");
                                                        setSelectedAgentId(found.user_id);
                                                    }}
                                                />
                                                <Divider style={{ margin: "12px 0" }} />

                                                <div style={{ height: "calc(100% - 66px)", overflow: "auto" }}>
                                                    <Table<AgentRow>
                                                        size="small"
                                                        rowKey="user_id"
                                                        dataSource={agentTableData}
                                                        pagination={false}
                                                        onRow={(record) => {
                                                            const isAddRow =
                                                                record.__rowType === "add" ||
                                                                String(record.user_id || "") === ADD_AGENT_ROW_ID;
                                                            if (isAddRow) {
                                                                return {
                                                                    onClick: () => {
                                                                        if (!isAdmin) {
                                                                            notification.info({
                                                                                message: t("team.adminOnlyHint"),
                                                                                placement: "bottomRight",
                                                                                duration: 2,
                                                                            });
                                                                            return;
                                                                        }
                                                                        setInviteOpen(true);
                                                                    },
                                                                    style: { cursor: "pointer" },
                                                                };
                                                            }
                                                            const selectedId = selectedAgent?.user_id || "";
                                                            const isSelected = record.user_id === selectedId;
                                                            return {
                                                                onClick: () => {
                                                                    setActiveTab("agents");
                                                                    setSelectedAgentId(record.user_id);
                                                                },
                                                                style: {
                                                                    cursor: "pointer",
                                                                    background: isSelected ? "#f5f5f5" : undefined,
                                                                },
                                                            };
                                                        }}
                                                        columns={[
                                                            {
                                                                title: t("team.columns.name"),
                                                                key: "name",
                                                                render: (_: unknown, a: AgentRow) => {
                                                                    if (a.__rowType === "add") {
                                                                        return (
                                                                            <Space size={12} style={{ paddingBlock: 6 }}>
                                                                                <span
                                                                                    style={{
                                                                                        width: 32,
                                                                                        height: 32,
                                                                                        borderRadius: 999,
                                                                                        border: "1px solid #d9d9d9",
                                                                                        display: "inline-flex",
                                                                                        alignItems: "center",
                                                                                        justifyContent: "center",
                                                                                        background: "#fff",
                                                                                    }}
                                                                                >
                                                                                    <PlusOutlined />
                                                                                </span>
                                                                                <Typography.Text strong>{t("team.addNewAgent")}</Typography.Text>
                                                                            </Space>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <Space size={10}>
                                                                            <Avatar>{initials(a.username)}</Avatar>
                                                                            <div style={{ lineHeight: 1.2 }}>
                                                                                <Space size={8}>
                                                                                    <Typography.Text strong>{a.username}</Typography.Text>
                                                                                    {myStatus?.user_id === a.user_id ? (
                                                                                        <Tag color="blue">{t("team.you")}</Tag>
                                                                                    ) : null}
                                                                                </Space>
                                                                                <div>
                                                                                    <Typography.Text type="secondary">
                                                                                        {a.email || ""}
                                                                                    </Typography.Text>
                                                                                </div>
                                                                            </div>
                                                                        </Space>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                title: t("team.columns.role"),
                                                                dataIndex: "role",
                                                                key: "role",
                                                                width: 120,
                                                                render: (r: unknown) => {
                                                                    if (!r) return null;
                                                                    const role = String(r || "").toLowerCase();
                                                                    return (
                                                                        <Tag>
                                                                            {role === "admin" ? t("team.role.owner") : t("team.role.agent")}
                                                                        </Tag>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                title: t("team.columns.status"),
                                                                dataIndex: "status",
                                                                key: "status",
                                                                width: 180,
                                                                render: (v: unknown, a: AgentRow) => {
                                                                    if (a.__rowType === "add") return null;
                                                                    return renderAgentStatusCell(v, a);
                                                                },
                                                            },
                                                        ]}
                                                    />
                                                </div>
                                            </div>
                                        }
                                        detailTitle={t("team.details")}
                                        detail={
                                            selectedAgent ? (
                                                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                                    <Space size={10}>
                                                        <Avatar size={48}>{initials(selectedAgent.username)}</Avatar>
                                                        <div>
                                                            <Typography.Title level={5} style={{ margin: 0 }}>
                                                                {selectedAgent.username}
                                                            </Typography.Title>
                                                            <Space size={8}>
                                                                <Tag>{String(selectedAgent.role || "").toLowerCase() === "admin" ? t("team.role.owner") : t("team.role.agent")}</Tag>
                                                            </Space>
                                                            {selectedAgent.email ? (
                                                                <Typography.Text type="secondary">{selectedAgent.email}</Typography.Text>
                                                            ) : null}
                                                        </div>
                                                    </Space>

                                                    <Descriptions size="small" column={1}>
                                                        <Descriptions.Item label={t("team.fields.status")}>
                                                            {renderAgentStatusPill(selectedAgent.status)}
                                                        </Descriptions.Item>
                                                        <Descriptions.Item label={t("team.fields.chatLimit")}>
                                                            {Math.max(
                                                                1,
                                                                Math.min(
                                                                    50,
                                                                    Number(
                                                                        (isSelectedMe && myStatus
                                                                            ? myStatus.max_concurrent
                                                                            : selectedAgent.max_concurrent) ?? 3,
                                                                    ) || 3,
                                                                ),
                                                            )}
                                                        </Descriptions.Item>
                                                    </Descriptions>

                                                    <Divider style={{ margin: "8px 0" }} />
                                                    <Card size="small" title={t("team.sections.groups")} bodyStyle={{ padding: 12 }}>
                                                        <Typography.Text type="secondary">{t("team.comingSoon")}</Typography.Text>
                                                    </Card>
                                                    <Card size="small" title={t("team.sections.workingHours")} bodyStyle={{ padding: 12 }}>
                                                        <Typography.Text type="secondary">{t("team.comingSoon")}</Typography.Text>
                                                    </Card>
                                                    <Card size="small" title={t("team.sections.performance")} bodyStyle={{ padding: 12 }}>
                                                        <Typography.Text type="secondary">{t("team.comingSoon")}</Typography.Text>
                                                    </Card>
                                                </Space>
                                            ) : (
                                                <Typography.Text type="secondary">{t("team.noAgents")}</Typography.Text>
                                            )
                                        }
                                        detailEmpty={<Typography.Text type="secondary">{t("team.noAgents")}</Typography.Text>}
                                        detailVisible={Boolean(selectedAgent)}
                                    />
                                ),
                            },
                            {
                                key: "groups",
                                label: t("team.tabs.groups"),
                                children: (
                                    <MasterDetailLayout
                                        master={
                                            <div style={{ padding: 12, height: "100%", overflow: "hidden", background: "#fff" }}>
                                                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                                    <Typography.Title level={5} style={{ margin: 0 }}>
                                                        {t("team.groupsTitle")}
                                                    </Typography.Title>
                                                    {isAdmin ? (
                                                        <Button
                                                            type="primary"
                                                            icon={<PlusOutlined />}
                                                            onClick={() => {
                                                                createGroupForm.setFieldsValue({ name: "", enabled: true });
                                                                setCreateGroupOpen(true);
                                                            }}
                                                        >
                                                            {t("team.createGroup")}
                                                        </Button>
                                                    ) : (
                                                        <Typography.Text type="secondary">{t("team.adminOnlyHint")}</Typography.Text>
                                                    )}
                                                </Space>
                                                <Divider style={{ margin: "12px 0" }} />
                                                <div style={{ height: "calc(100% - 66px)", overflow: "auto" }}>
                                                    <Table
                                                        size="small"
                                                        rowKey="id"
                                                        pagination={false}
                                                        loading={groupStatsLoading}
                                                        dataSource={groups.map((g) => ({ ...g, key: g.id }))}
                                                        onRow={(record) => {
                                                            const selected = record.id === selectedGroupId;
                                                            return {
                                                                onClick: () => {
                                                                    setActiveTab("groups");
                                                                    setSelectedGroupId(record.id);
                                                                },
                                                                style: {
                                                                    cursor: "pointer",
                                                                    background: selected ? "#f5f5f5" : undefined,
                                                                },
                                                            };
                                                        }}
                                                        columns={[
                                                            {
                                                                title: t("team.columns.name"),
                                                                key: "name",
                                                                render: (_: unknown, g: SkillGroupItem) => (
                                                                    <Space size={10}>
                                                                        <Avatar>{initials(g.name)}</Avatar>
                                                                        <div style={{ lineHeight: 1.2 }}>
                                                                            <Space size={8}>
                                                                                <Typography.Text strong>{g.name}</Typography.Text>
                                                                                <Tag color={g.enabled ? "green" : "default"}>
                                                                                    {g.enabled ? t("team.enabled") : t("team.disabled")}
                                                                                </Tag>
                                                                            </Space>
                                                                            <div>
                                                                                <Typography.Text type="secondary">{g.id}</Typography.Text>
                                                                            </div>
                                                                        </div>
                                                                    </Space>
                                                                ),
                                                            },
                                                            {
                                                                title: t("team.members"),
                                                                key: "members",
                                                                width: 160,
                                                                render: (_: unknown, g: SkillGroupItem) => {
                                                                    const st = groupStats[g.id];
                                                                    const ids = st?.sampleAgentIds || [];
                                                                    if (!st) return <Typography.Text type="secondary">—</Typography.Text>;
                                                                    return (
                                                                        <Space size={10}>
                                                                            <Avatar.Group maxCount={3} size="small">
                                                                                {ids.map((id) => (
                                                                                    <Avatar key={id}>
                                                                                        {initials(agentById[id]?.username || id)}
                                                                                    </Avatar>
                                                                                ))}
                                                                            </Avatar.Group>
                                                                            <Typography.Text type="secondary">{st.total}</Typography.Text>
                                                                        </Space>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                title: t("team.columns.status"),
                                                                key: "status",
                                                                width: 220,
                                                                render: (_: unknown, g: SkillGroupItem) => {
                                                                    const st = groupStats[g.id];
                                                                    if (!st) return <Typography.Text type="secondary">—</Typography.Text>;
                                                                    const dot = st.accepting > 0 ? "#16a34a" : "#bfbfbf";
                                                                    return (
                                                                        <Space size={8}>
                                                                            <span
                                                                                style={{
                                                                                    width: 8,
                                                                                    height: 8,
                                                                                    borderRadius: 999,
                                                                                    background: dot,
                                                                                    display: "inline-block",
                                                                                }}
                                                                            />
                                                                            <Typography.Text>
                                                                                {t("team.groupStatusShort", {
                                                                                    accepting: st.accepting,
                                                                                    total: st.total,
                                                                                })}
                                                                            </Typography.Text>
                                                                        </Space>
                                                                    );
                                                                },
                                                            },
                                                        ]}
                                                    />
                                                </div>
                                            </div>
                                        }
                                        detailTitle={t("team.details")}
                                        detail={
                                            selectedGroupId ? (
                                                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                                    <Typography.Title level={5} style={{ margin: 0 }}>
                                                        {groups.find((g) => g.id === selectedGroupId)?.name || selectedGroupId}
                                                    </Typography.Title>

                                                    <Descriptions size="small" column={1}>
                                                        <Descriptions.Item label={t("team.fields.userId")}>
                                                            {selectedGroupId}
                                                        </Descriptions.Item>
                                                        <Descriptions.Item label={t("team.members")}>{members.length}</Descriptions.Item>
                                                    </Descriptions>

                                                    {isAdmin ? (
                                                        <Card size="small" title={t("team.addMember")} bodyStyle={{ padding: 12 }}>
                                                            <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                                                <Select
                                                                    placeholder={t("team.selectAgent")}
                                                                    value={addMemberAgentId || undefined}
                                                                    options={addMemberOptions}
                                                                    onChange={(v) => setAddMemberAgentId(String(v || ""))}
                                                                    showSearch
                                                                    optionFilterProp="label"
                                                                />
                                                                <Space style={{ justifyContent: "space-between", width: "100%" }}>
                                                                    <Typography.Text>{t("team.weight")}</Typography.Text>
                                                                    <InputNumber
                                                                        min={0}
                                                                        max={100}
                                                                        value={addMemberWeight}
                                                                        onChange={(v) => setAddMemberWeight(Number(v || 0))}
                                                                    />
                                                                </Space>
                                                                <Button
                                                                    type="primary"
                                                                    disabled={!addMemberAgentId}
                                                                    loading={addingMember}
                                                                    onClick={() => void addOrUpdateMember()}
                                                                >
                                                                    {t("common.add")}
                                                                </Button>
                                                            </Space>
                                                        </Card>
                                                    ) : (
                                                        <Typography.Text type="secondary">{t("team.adminOnlyHint")}</Typography.Text>
                                                    )}

                                                    <Card size="small" title={t("team.members")} bodyStyle={{ padding: 0 }}>
                                                        <List
                                                            loading={membersLoading}
                                                            dataSource={members}
                                                            renderItem={(m) => {
                                                                const a = agentById[m.agent_user_id];
                                                                const username = a?.username || m.agent_user_id;
                                                                return (
                                                                    <List.Item
                                                                        actions={
                                                                            isAdmin
                                                                                ? [
                                                                                      <Button
                                                                                          key="remove"
                                                                                          danger
                                                                                          onClick={() => void removeMember(m.agent_user_id)}
                                                                                      >
                                                                                          {t("common.delete")}
                                                                                      </Button>,
                                                                                  ]
                                                                                : []
                                                                        }
                                                                    >
                                                                        <List.Item.Meta
                                                                            avatar={<Avatar>{initials(username)}</Avatar>}
                                                                            title={<Typography.Text strong>{username}</Typography.Text>}
                                                                            description={
                                                                                <Typography.Text type="secondary">
                                                                                    {t("team.weight")}: {m.weight}
                                                                                </Typography.Text>
                                                                            }
                                                                        />
                                                                    </List.Item>
                                                                );
                                                            }}
                                                        />
                                                    </Card>
                                                </Space>
                                            ) : (
                                                <Typography.Text type="secondary">{t("team.selectGroup")}</Typography.Text>
                                            )
                                        }
                                        detailEmpty={<Typography.Text type="secondary">{t("team.selectGroup")}</Typography.Text>}
                                        detailVisible={Boolean(selectedGroupId)}
                                    />
                                ),
                            },
                        ]}
                    />
                </Card>
            </Space>

            <InviteAgentsModal
                open={inviteOpen}
                onClose={() => {
                    setInviteOpen(false);
                }}
            />

            <Modal
                title={t("team.createGroup")}
                open={createGroupOpen}
                confirmLoading={createGroupLoading}
                onCancel={() => setCreateGroupOpen(false)}
                onOk={() => {
                    if (!isAdmin) {
                        setCreateGroupOpen(false);
                        return;
                    }
                    createGroupForm
                        .validateFields()
                        .then((v) => void createGroup(v))
                        .catch(() => {
                            // ignore
                        });
                }}
            >
                <Form form={createGroupForm} layout="vertical" initialValues={{ enabled: true }}>
                    <Form.Item
                        label={t("team.groupName")}
                        name="name"
                        rules={[{ required: true, message: t("team.groupNameRequired") }]}
                    >
                        <Input placeholder={t("team.groupNamePlaceholder")} />
                    </Form.Item>
                    <Form.Item label={t("team.groupEnabled")} name="enabled" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t("team.chatLimitModalTitle")}
                open={chatLimitOpen}
                onCancel={() => {
                    setChatLimitOpen(false);
                    setChatLimitAgent(null);
                }}
                footer={
                    <Space>
                        <Button
                            onClick={() => {
                                setChatLimitOpen(false);
                                setChatLimitAgent(null);
                            }}
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button
                            type="primary"
                            loading={chatLimitSaving}
                            disabled={
                                !chatLimitAgent ||
                                chatLimitSaving ||
                                Math.max(1, Math.min(50, Number(chatLimitValue || 0) || 1)) ===
                                    Math.max(1, Math.min(50, Number(chatLimitAgent.max_concurrent ?? 3) || 1))
                            }
                            onClick={() => {
                                if (!chatLimitAgent) return;
                                const safe = Math.max(1, Math.min(50, Number(chatLimitValue || 0) || 1));
                                setChatLimitSaving(true);
                                setAgentMaxConcurrent(chatLimitAgent.user_id, safe)
                                    .then(() => {
                                        setChatLimitOpen(false);
                                        setChatLimitAgent(null);
                                    })
                                    .finally(() => setChatLimitSaving(false));
                            }}
                        >
                            {t("common.apply")}
                        </Button>
                    </Space>
                }
                width={520}
                destroyOnClose
            >
                {chatLimitAgent ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                        <Space size={12} style={{ minWidth: 0 }}>
                            <Avatar size={48}>{initials(chatLimitAgent.username)}</Avatar>
                            <div style={{ minWidth: 0 }}>
                                <Space size={8} wrap>
                                    <Typography.Text strong>{chatLimitAgent.username}</Typography.Text>
                                    {myStatus?.user_id === chatLimitAgent.user_id ? (
                                        <Typography.Text type="secondary">({t("team.you")})</Typography.Text>
                                    ) : null}
                                </Space>
                                <div>
                                    <Typography.Text type="secondary">{chatLimitAgent.email || ""}</Typography.Text>
                                </div>
                            </div>
                        </Space>

                        <Space size={10} align="center">
                            <Typography.Text type="secondary">{t("team.concurrentChats")}</Typography.Text>
                            <InputNumber
                                min={1}
                                max={50}
                                value={chatLimitValue}
                                onChange={(v) => setChatLimitValue(Number(v || 1))}
                            />
                        </Space>
                    </div>
                ) : null}
            </Modal>

        </div>
    );
}
