import { useEffect, useMemo, useState } from "react";
import {
    Avatar,
    Button,
    Card,
    Collapse,
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
    Table,
    Tabs,
    Tag,
    Typography,
    notification,
} from "antd";
import { DownOutlined, EllipsisOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

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
    group_type?: string | null;
    is_fallback?: boolean | null;
    system_key?: string | null;
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

function hashString(input: string): number {
    // Small, deterministic hash for stable avatar colors.
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

export function TeamPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(false);

    const [agents, setAgents] = useState<AgentListItem[]>([]);
    const [myStatus, setMyStatus] = useState<AgentStatusResponse | null>(null);

    const [agentGroupsLoading, setAgentGroupsLoading] = useState(false);
    const [agentGroups, setAgentGroups] = useState<SkillGroupItem[]>([]);

    const [activeTab, setActiveTab] = useState<"agents" | "groups">("agents");
    const [selectedAgentId, setSelectedAgentId] = useState<string>("");

    const [meRole, setMeRole] = useState<string>("");
    const [meUserId, setMeUserId] = useState<string>("");
    const isAdmin = meRole === "admin";

    const effectiveMeUserId = meUserId || String(myStatus?.user_id || "");

    const [groups, setGroups] = useState<SkillGroupItem[]>([]);

    const [selectedGroupId, setSelectedGroupId] = useState<string>("");

    useEffect(() => {
        const st: any = (location as any)?.state;
        if (!st) return;
        if (st.tab === "groups") {
            setActiveTab("groups");
        }
        if (typeof st.selectedGroupId === "string" && st.selectedGroupId) {
            setSelectedGroupId(st.selectedGroupId);
        }
        // Clear state so refresh/navigation doesn't re-apply.
        try {
            navigate(location.pathname, { replace: true, state: null });
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedGroup = useMemo(
        () => (selectedGroupId ? groups.find((g) => g.id === selectedGroupId) || null : null),
        [groups, selectedGroupId],
    );

    const [createGroupOpen, setCreateGroupOpen] = useState(false);
    const [createGroupLoading, setCreateGroupLoading] = useState(false);
    const [createGroupForm] = Form.useForm<{ name: string; member_user_ids: string[] }>();

    const createGroupMembers = Form.useWatch("member_user_ids", createGroupForm) as string[] | undefined;

    const [deletingGroup, setDeletingGroup] = useState(false);

    const [chatLimitOpen, setChatLimitOpen] = useState(false);
    const [chatLimitSaving, setChatLimitSaving] = useState(false);
    const [chatLimitAgent, setChatLimitAgent] = useState<AgentListItem | null>(null);
    const [chatLimitValue, setChatLimitValue] = useState<number>(3);

    const [membersLoading, setMembersLoading] = useState(false);
    const [members, setMembers] = useState<SkillGroupMemberItem[]>([]);

    const [groupStatsLoading, setGroupStatsLoading] = useState(false);
    const [groupStats, setGroupStats] = useState<Record<string, SkillGroupStats>>({});

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

    useEffect(() => {
        if (activeTab !== "agents") return;
        const userId = String(selectedAgent?.user_id || "");
        if (!userId) {
            setAgentGroups([]);
            return;
        }

        let cancelled = false;
        setAgentGroupsLoading(true);
        http
            .get<SkillGroupItem[]>(`/api/v1/skill-groups/agents/${encodeURIComponent(userId)}`)
            .then((res) => {
                if (cancelled) return;
                setAgentGroups(Array.isArray(res.data) ? res.data : []);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setAgentGroups([]);
                notification.error({
                    message: t("team.agentGroupsLoadFailedTitle"),
                    description: errorMessage(e, "load_agent_groups_failed"),
                    placement: "bottomRight",
                    duration: 3,
                });
            })
            .finally(() => {
                if (cancelled) return;
                setAgentGroupsLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, selectedAgent?.user_id]);

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

    async function createGroup(values: { name: string; member_user_ids: string[] }) {
        const name = String(values?.name || "").trim();
        const memberIds = Array.from(new Set((values?.member_user_ids || []).map((x) => String(x || "").trim()))).filter(
            Boolean,
        );
        if (!name) return;
        if (!memberIds.length) return;
        setCreateGroupLoading(true);
        try {
            const res = await http.post<SkillGroupItem>("/api/v1/skill-groups", {
                name,
                enabled: true,
                member_user_ids: memberIds,
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

    function confirmDeleteGroup(group: SkillGroupItem) {
        if (!isAdmin) return;
        if (!group?.id) return;
        if (isSystemOrFallbackGroup(group)) return;

        const groupId = group.id;
        const name = group.name || groupId;

        Modal.confirm({
            title: t("team.deleteGroupTitle"),
            content: t("team.deleteGroupConfirm", { name }),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                setDeletingGroup(true);
                try {
                    await http.delete(`/api/v1/skill-groups/${encodeURIComponent(groupId)}`);
                    notification.success({
                        message: t("common.saved"),
                        placement: "bottomRight",
                        duration: 1.5,
                    });
                    if (selectedGroupId === groupId) {
                        setSelectedGroupId("");
                        setMembers([]);
                    }
                    await refreshAll();
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
                } finally {
                    setDeletingGroup(false);
                }
            },
        });
    }

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
                                                                            <Avatar style={avatarStyle(a.user_id || a.username)}>
                                                                                {initials(a.username)}
                                                                            </Avatar>
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
                                                        <Avatar
                                                            size={48}
                                                            style={avatarStyle(selectedAgent.user_id || selectedAgent.username)}
                                                        >
                                                            {initials(selectedAgent.username)}
                                                        </Avatar>
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
                                                    <Collapse
                                                        size="small"
                                                        defaultActiveKey={["groups"]}
                                                        items={[
                                                            {
                                                                key: "groups",
                                                                label: t("team.agentGroupsLabel", { count: agentGroups.length }),
                                                                children: (
                                                                    <List
                                                                        loading={agentGroupsLoading}
                                                                        dataSource={agentGroups}
                                                                        locale={{ emptyText: t("team.noAgentGroups") }}
                                                                        renderItem={(g) => (
                                                                            <List.Item>
                                                                                <List.Item.Meta
                                                                                    avatar={
                                                                                        <Avatar
                                                                                            shape="square"
                                                                                            size={24}
                                                                                            style={{
                                                                                                borderRadius: 6,
                                                                                                ...avatarStyle(g.id || g.name),
                                                                                            }}
                                                                                        >
                                                                                            {initials(g.name)}
                                                                                        </Avatar>
                                                                                    }
                                                                                    title={<Typography.Text>{g.name}</Typography.Text>}
                                                                                />
                                                                            </List.Item>
                                                                        )}
                                                                    />
                                                                ),
                                                            },
                                                        ]}
                                                    />
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
                                                                createGroupForm.setFieldsValue({ name: "", member_user_ids: [] });
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
                                                                        <Avatar style={avatarStyle(g.id || g.name)}>{initials(g.name)}</Avatar>
                                                                        <div style={{ lineHeight: 1.2 }}>
                                                                            <Space size={8}>
                                                                                <Typography.Text strong>{g.name}</Typography.Text>
                                                                                <Tag color={g.enabled ? "green" : "default"}>
                                                                                    {g.enabled ? t("team.enabled") : t("team.disabled")}
                                                                                </Tag>
                                                                            </Space>
                                                                            <div>
                                                                                <Typography.Text type="secondary">
                                                                                    {t("team.members")}: {groupStats[g.id]?.total ?? "—"}
                                                                                </Typography.Text>
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
                                                                                    <Avatar key={id} style={avatarStyle(id)}>
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
                                                            {
                                                                title: "",
                                                                key: "actions",
                                                                width: 48,
                                                                align: "right",
                                                                render: (_: unknown, g: SkillGroupItem) => {
                                                                    const readonly = isSystemOrFallbackGroup(g);

                                                                    return (
                                                                        <Dropdown
                                                                            trigger={["click"]}
                                                                            menu={{
                                                                                items: [
                                                                                    {
                                                                                        key: "edit_group",
                                                                                        label: t("team.actions.editGroup"),
                                                                                        disabled: !isAdmin || readonly,
                                                                                    },
                                                                                    {
                                                                                        key: "view_group_reports",
                                                                                        label: t("team.actions.viewGroupReports"),
                                                                                    },
                                                                                    { type: "divider" },
                                                                                    {
                                                                                        key: "delete",
                                                                                        label: t("common.delete"),
                                                                                        danger: true,
                                                                                        disabled: deletingGroup || !isAdmin || readonly,
                                                                                    },
                                                                                ],
                                                                                onClick: ({ key, domEvent }) => {
                                                                                    domEvent?.stopPropagation();
                                                                                    domEvent?.preventDefault();
                                                                                    if (key === "edit_group") {
                                                                                        navigate(`/team/groups/${encodeURIComponent(g.id)}/edit`, {
                                                                                            state: { from: "team" },
                                                                                        });
                                                                                        return;
                                                                                    }
                                                                                    if (key === "view_group_reports") {
                                                                                        notification.info({
                                                                                            message: t("team.comingSoon"),
                                                                                            description: t("team.actions.viewGroupReports"),
                                                                                            placement: "bottomRight",
                                                                                            duration: 2,
                                                                                        });
                                                                                        return;
                                                                                    }
                                                                                    if (key === "delete") {
                                                                                        confirmDeleteGroup(g);
                                                                                    }
                                                                                },
                                                                            }}
                                                                        >
                                                                            <Button
                                                                                type="text"
                                                                                size="small"
                                                                                disabled={deletingGroup}
                                                                                icon={<EllipsisOutlined />}
                                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </Dropdown>
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
                                                    <Space size={12} align="start" style={{ width: "100%" }}>
                                                        <Avatar
                                                            shape="square"
                                                            size={56}
                                                            style={{ borderRadius: 10, ...avatarStyle(selectedGroupId) }}
                                                        >
                                                            {initials(selectedGroup?.name || selectedGroupId)}
                                                        </Avatar>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <Typography.Title level={5} style={{ margin: 0 }}>
                                                                {selectedGroup?.name || selectedGroupId}
                                                            </Typography.Title>
                                                            <div style={{ marginTop: 6 }}>
                                                                <Typography.Text type="secondary">
                                                                    {t("team.detailsGroupId")}:
                                                                </Typography.Text>{" "}
                                                                <Typography.Text
                                                                    copyable={{ text: selectedGroupId }}
                                                                    style={{ wordBreak: "break-all" }}
                                                                >
                                                                    {selectedGroupId}
                                                                </Typography.Text>
                                                            </div>
                                                        </div>
                                                    </Space>

                                                    <Collapse
                                                        size="small"
                                                        defaultActiveKey={["members", "performance", "chat_assignment", "routing_rules"]}
                                                        items={[
                                                            {
                                                                key: "members",
                                                                label: `${t("team.members")} (${members.length})`,
                                                                children: (
                                                                    <List
                                                                        loading={membersLoading}
                                                                        dataSource={members}
                                                                        locale={{ emptyText: t("team.noMembers") }}
                                                                        renderItem={(m) => {
                                                                            const a = agentById[m.agent_user_id];
                                                                            const username = a?.username || m.agent_user_id;
                                                                            const st = String(a?.status || "").toLowerCase();
                                                                            const dotColor =
                                                                                st === "online"
                                                                                    ? "#16a34a"
                                                                                    : st === "away"
                                                                                        ? "#f59e0b"
                                                                                        : st === "busy"
                                                                                            ? "#f97316"
                                                                                            : "#bfbfbf";
                                                                            return (
                                                                                <List.Item>
                                                                                    <List.Item.Meta
                                                                                        avatar={
                                                                                            <div style={{ position: "relative", width: 32, height: 32 }}>
                                                                                                <Avatar
                                                                                                    style={avatarStyle(m.agent_user_id || username)}
                                                                                                    size={32}
                                                                                                >
                                                                                                    {initials(username)}
                                                                                                </Avatar>
                                                                                                <span
                                                                                                    style={{
                                                                                                        position: "absolute",
                                                                                                        left: -1,
                                                                                                        top: -1,
                                                                                                        width: 10,
                                                                                                        height: 10,
                                                                                                        borderRadius: 999,
                                                                                                        background: dotColor,
                                                                                                        border: "2px solid #fff",
                                                                                                        boxSizing: "border-box",
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                        }
                                                                                        title={<Typography.Text>{username}</Typography.Text>}
                                                                                    />
                                                                                </List.Item>
                                                                            );
                                                                        }}
                                                                    />
                                                                ),
                                                            },
                                                            {
                                                                key: "performance",
                                                                label: t("team.detailsPerformance"),
                                                                children: (
                                                                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                                                        <Descriptions size="small" column={1}>
                                                                            <Descriptions.Item label={t("team.detailsTotalChats")}>0</Descriptions.Item>
                                                                            <Descriptions.Item label={t("team.detailsGoals")}>0</Descriptions.Item>
                                                                            <Descriptions.Item label={t("team.detailsChatSatisfaction")}>
                                                                                {t("team.detailsNA")}
                                                                            </Descriptions.Item>
                                                                        </Descriptions>
                                                                        <Button
                                                                            onClick={() => {
                                                                                notification.info({
                                                                                    message: t("team.comingSoon"),
                                                                                    description: t("team.actions.viewGroupReports"),
                                                                                    placement: "bottomRight",
                                                                                    duration: 2,
                                                                                });
                                                                            }}
                                                                        >
                                                                            {t("team.detailsViewReports")}
                                                                        </Button>
                                                                    </Space>
                                                                ),
                                                            },
                                                            {
                                                                key: "chat_assignment",
                                                                label: t("team.detailsChatAssignment"),
                                                                children: (
                                                                    <Typography.Link
                                                                        onClick={(e) => {
                                                                            e?.preventDefault();
                                                                            e?.stopPropagation();

                                                                            const groupId = String(selectedGroupId || "").trim();
                                                                            if (!groupId) return;

                                                                            navigate(
                                                                                `/settings/chat-settings/chat-assignment?group_id=${encodeURIComponent(groupId)}`,
                                                                            );
                                                                        }}
                                                                    >
                                                                        {t("team.detailsManageChatAssignment")}
                                                                    </Typography.Link>
                                                                ),
                                                            },
                                                            {
                                                                key: "routing_rules",
                                                                label: t("team.detailsRoutingRules"),
                                                                children: (
                                                                    <Typography.Link
                                                                        onClick={() => {
                                                                            notification.info({
                                                                                message: t("team.comingSoon"),
                                                                                description: t("team.detailsManageRoutingRules"),
                                                                                placement: "bottomRight",
                                                                                duration: 2,
                                                                            });
                                                                        }}
                                                                    >
                                                                        {t("team.detailsManageRoutingRules")}
                                                                    </Typography.Link>
                                                                ),
                                                            },
                                                        ]}
                                                    />
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
                okText={t("common.create")}
                onCancel={() => setCreateGroupOpen(false)}
                okButtonProps={{
                    disabled: !isAdmin || createGroupLoading || !(createGroupMembers?.length || 0),
                }}
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
                width={520}
            >
                <Form form={createGroupForm} layout="vertical" initialValues={{ member_user_ids: [] }}>
                    <Form.Item
                        label={t("team.groupName")}
                        name="name"
                        rules={[{ required: true, message: t("team.groupNameRequired") }]}
                    >
                        <Input placeholder={t("team.groupNamePlaceholder")} />
                    </Form.Item>

                    <Form.Item
                        label={t("team.addMembers")}
                        name="member_user_ids"
                        rules={[{ required: true, type: "array", min: 1, message: t("team.addMembersRequired") }]}
                    >
                        <Select
                            mode="multiple"
                            placeholder={t("team.addMembersPlaceholder")}
                            showSearch
                            optionFilterProp="search"
                            options={agents.map((a) => ({
                                value: a.user_id,
                                label: (
                                    <div style={{ lineHeight: 1.2 }}>
                                        <div>{a.username}</div>
                                        {a.email ? <Typography.Text type="secondary">{a.email}</Typography.Text> : null}
                                    </div>
                                ),
                                search: `${a.username || ""} ${a.email || ""}`.trim(),
                            }))}
                        />
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
                            <Avatar
                                size={48}
                                style={avatarStyle(chatLimitAgent.user_id || chatLimitAgent.username)}
                            >
                                {initials(chatLimitAgent.username)}
                            </Avatar>
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
