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
    Tag,
    Typography,
    notification,
} from "antd";
import { ArrowLeftOutlined, InfoCircleOutlined, LockOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

type ProfileMeResponse = {
    user_id: string;
    role: string;
    username: string;
    email?: string | null;
    display_name?: string | null;
    job_title?: string | null;
    max_concurrent: number;
};

type SkillGroupItem = {
    id: string;
    name: string;
    enabled: boolean;
};

type AgentStatusResponse = {
    user_id: string;
    status: string;
    effective_status: string;
    max_concurrent: number;
    assigned_active: number;
    remaining_capacity: number;
    can_accept: boolean;
};

function initials(name: string) {
    const t = String(name || "").trim();
    if (!t) return "?";
    return t.slice(0, 1).toUpperCase();
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function ProfilePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const requestedUserId = String(searchParams.get("userId") || "");

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [viewer, setViewer] = useState<ProfileMeResponse | null>(null);
    const [me, setMe] = useState<ProfileMeResponse | null>(null);
    const [groups, setGroups] = useState<SkillGroupItem[]>([]);
    const [allGroups, setAllGroups] = useState<SkillGroupItem[]>([]);
    const [groupUpdating, setGroupUpdating] = useState(false);

    const [form] = Form.useForm<{ display_name: string; job_title: string; max_concurrent: number }>();

    const isEditingOther = Boolean(viewer && viewer.role === "admin" && requestedUserId && requestedUserId !== viewer.user_id);
    const targetUserId = isEditingOther ? requestedUserId : "";

    const roleLabel = useMemo(() => {
        if (!me) return "";
        return me.role === "admin" ? t("profile.owner") : t("profile.agent");
    }, [me, t]);

    const avatarName = useMemo(() => {
        const base = me?.display_name || me?.username || "";
        return initials(base);
    }, [me?.display_name, me?.username]);

    async function loadAll() {
        setLoading(true);
        try {
            const viewerRes = await http.get<ProfileMeResponse>("/api/v1/profile/me");
            const viewerData = viewerRes.data;
            setViewer(viewerData);

            const editOther = Boolean(
                viewerData && viewerData.role === "admin" && requestedUserId && requestedUserId !== viewerData.user_id,
            );

            let meData: ProfileMeResponse = viewerData;
            if (editOther) {
                const targetRes = await http.get<ProfileMeResponse>(
                    `/api/v1/profile/users/${encodeURIComponent(requestedUserId)}`,
                );
                meData = targetRes.data;
                setGroups([]);
                setAllGroups([]);
            } else {
                const groupsRes = await http.get<SkillGroupItem[]>("/api/v1/skill-groups/me");
                setGroups(groupsRes.data || []);

                if (viewerData?.role === "admin") {
                    const all = await http.get<SkillGroupItem[]>("/api/v1/skill-groups");
                    setAllGroups(Array.isArray(all.data) ? all.data : []);
                } else {
                    setAllGroups([]);
                }
            }

            setMe(meData);

            form.setFieldsValue({
                display_name: String(meData.display_name ?? ""),
                job_title: String(meData.job_title ?? ""),
                max_concurrent: clampInt(meData.max_concurrent, 1, 50, 3),
            });
        } catch (e) {
            notification.error({
                message: t("common.loadFailed"),
                description: errorMessage(e, t("common.loadFailed")),
                placement: "bottomRight",
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedUserId]);

    async function saveProfileFields() {
        const values = form.getFieldsValue();
        setSaving(true);
        try {
            const path = targetUserId
                ? `/api/v1/profile/users/${encodeURIComponent(targetUserId)}`
                : "/api/v1/profile/me";

            await http.post(path, {
                display_name: String(values.display_name || "").trim() || null,
                job_title: String(values.job_title || "").trim() || null,
            });
            notification.success({
                message: t("common.saved"),
                placement: "bottomRight",
                duration: 1.5,
            });
            await loadAll();
        } catch (e) {
            notification.error({
                message: t("common.saveFailed"),
                description: errorMessage(e, t("common.saveFailed")),
                placement: "bottomRight",
            });
        } finally {
            setSaving(false);
        }
    }

    async function saveChatLimit() {
        if (targetUserId) {
            notification.info({
                message: t("team.comingSoon"),
                description: t("team.actions.changeChatLimit"),
                placement: "bottomRight",
                duration: 2,
            });
            return;
        }
        const values = form.getFieldsValue();
        const next = clampInt(values.max_concurrent, 1, 50, 3);

        setSaving(true);
        try {
            const st = await http.get<AgentStatusResponse>("/api/v1/agent/status");
            await http.post("/api/v1/agent/status", { status: st.data.status, max_concurrent: next });
            notification.success({
                message: t("common.saved"),
                placement: "bottomRight",
                duration: 1.5,
            });
            await loadAll();
        } catch (e) {
            notification.error({
                message: t("common.saveFailed"),
                description: errorMessage(e, t("common.saveFailed")),
                placement: "bottomRight",
            });
        } finally {
            setSaving(false);
        }
    }

    async function addMeToGroup(groupId: string) {
        if (!me) return;
        if (me.role !== "admin") return;
        if (targetUserId) return;

        setGroupUpdating(true);
        try {
            await http.post(`/api/v1/skill-groups/${encodeURIComponent(groupId)}/members`, {
                agent_user_id: me.user_id,
                weight: 1,
            });
            await loadAll();
        } catch (e) {
            notification.error({
                message: t("common.saveFailed"),
                description: errorMessage(e, t("common.saveFailed")),
                placement: "bottomRight",
            });
        } finally {
            setGroupUpdating(false);
        }
    }

    async function removeMeFromGroup(groupId: string) {
        if (!me) return;
        if (me.role !== "admin") return;
        if (targetUserId) return;

        setGroupUpdating(true);
        try {
            await http.delete(`/api/v1/skill-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(me.user_id)}`);
            await loadAll();
        } catch (e) {
            notification.error({
                message: t("common.saveFailed"),
                description: errorMessage(e, t("common.saveFailed")),
                placement: "bottomRight",
            });
        } finally {
            setGroupUpdating(false);
        }
    }

    const groupCountText = me ? t("profile.memberOfGroups", { count: groups.length }) : "";

    return (
        <div style={{ padding: 16 }}>
            <Card
                bordered={false}
                style={{ maxWidth: 980, margin: "0 auto" }}
                bodyStyle={{ padding: 24 }}
                loading={loading}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)}>
                        {t("common.back")}
                    </Button>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                        {t("profile.title")}
                    </Typography.Title>
                    <Button icon={<ReloadOutlined />} type="text" onClick={() => void loadAll()} />
                </div>

                <Divider style={{ margin: "16px 0 24px" }} />

                <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                    <div style={{ width: 220, textAlign: "center" }}>
                        <div style={{ position: "relative", display: "inline-block" }}>
                            <Avatar
                                size={96}
                                style={{ background: "#7c3aed", fontSize: 40, userSelect: "none" }}
                            >
                                {avatarName}
                            </Avatar>
                            <span
                                style={{
                                    position: "absolute",
                                    right: 6,
                                    top: 6,
                                    width: 14,
                                    height: 14,
                                    borderRadius: 999,
                                    background: "#16a34a",
                                    border: "2px solid white",
                                }}
                            />
                            <Button
                                icon={<PlusOutlined />}
                                size="small"
                                style={{ position: "absolute", right: -4, bottom: -4 }}
                                onClick={() =>
                                    notification.info({
                                        message: t("team.comingSoon"),
                                        description: t("profile.changeAvatar"),
                                        placement: "bottomRight",
                                        duration: 2,
                                    })
                                }
                            />
                        </div>

                        <div style={{ marginTop: 12 }}>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                <Space size={8} style={{ justifyContent: "center" }}>
                                    {me?.role ? <Tag color={me.role === "admin" ? "blue" : "default"}>{roleLabel}</Tag> : null}
                                </Space>
                                <Typography.Title level={5} style={{ margin: 0 }}>
                                    {me?.display_name || me?.username || ""}
                                </Typography.Title>
                                <Typography.Text type="secondary">{me?.job_title || t("profile.noJobTitle")}</Typography.Text>
                            </Space>
                        </div>
                    </div>

                    <div style={{ flex: 1 }}>
                        <Typography.Title level={5} style={{ marginTop: 0 }}>
                            {t("profile.details")}
                        </Typography.Title>

                        <Form
                            form={form}
                            layout="vertical"
                            requiredMark={false}
                            onFinish={() => void saveProfileFields()}
                        >
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                <Form.Item label={t("profile.fullName")} name="display_name">
                                    <Input placeholder={t("profile.fullNamePlaceholder")} onBlur={() => void saveProfileFields()} disabled={saving} />
                                </Form.Item>

                                <Form.Item
                                    label={
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <span>{t("profile.email")}</span>
                                            <Button
                                                type="link"
                                                size="small"
                                                style={{ padding: 0, height: "auto" }}
                                                disabled={isEditingOther}
                                                onClick={() =>
                                                    notification.info({
                                                        message: t("team.comingSoon"),
                                                        description: t("profile.changePassword"),
                                                        placement: "bottomRight",
                                                        duration: 2,
                                                    })
                                                }
                                            >
                                                {t("profile.changePassword")}
                                            </Button>
                                        </div>
                                    }
                                >
                                    <Input value={me?.email || ""} disabled suffix={<LockOutlined />} />
                                </Form.Item>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                <Form.Item label={t("profile.jobTitle")} name="job_title">
                                    <Input placeholder={t("profile.jobTitlePlaceholder")} onBlur={() => void saveProfileFields()} disabled={saving} />
                                </Form.Item>

                                <Form.Item
                                    label={
                                        <Space size={6}>
                                            <span>{t("profile.chatLimit")}</span>
                                            <InfoCircleOutlined style={{ color: "#8c8c8c" }} />
                                        </Space>
                                    }
                                    name="max_concurrent"
                                    extra={<Typography.Text type="secondary">{t("profile.chatLimitHint")}</Typography.Text>}
                                >
                                    <InputNumber
                                        min={1}
                                        max={50}
                                        style={{ width: 120 }}
                                        disabled={saving || isEditingOther}
                                        onBlur={() => void saveChatLimit()}
                                    />
                                </Form.Item>
                            </div>
                        </Form>

                        {isEditingOther ? null : (
                            <>

                                <Divider style={{ margin: "12px 0 20px" }} />

                                <Typography.Title level={5} style={{ marginTop: 0 }}>
                                    {groupCountText}
                                </Typography.Title>

                                {me?.role === "admin" ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
                                        <div>
                                            <Typography.Text type="secondary">{t("profile.assignToGroups")}</Typography.Text>
                                            <Select
                                                showSearch
                                                placeholder={t("profile.assignToGroupsPlaceholder")}
                                                style={{ width: "100%", marginTop: 6 }}
                                                disabled={groupUpdating || saving}
                                                value={undefined}
                                                options={allGroups
                                                    .filter((g) => !groups.some((mg) => mg.id === g.id))
                                                    .map((g) => ({ value: g.id, label: g.name }))}
                                                onSelect={(val) => void addMeToGroup(String(val))}
                                            />
                                        </div>
                                        <div>
                                            <Typography.Text type="secondary">{t("profile.findGroup")}</Typography.Text>
                                            <Input
                                                disabled
                                                value={t("profile.findGroupBuiltIn")}
                                                style={{ marginTop: 6 }}
                                                placeholder={t("profile.findGroup")}
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                <Space wrap size={[8, 8]}>
                                    {groups.length ? (
                                        groups.map((g) => (
                                            <Tag
                                                key={g.id}
                                                color={g.enabled ? "blue" : "default"}
                                                closable={me?.role === "admin"}
                                                onClose={(e) => {
                                                    e.preventDefault();
                                                    void removeMeFromGroup(g.id);
                                                }}
                                            >
                                                {g.name}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Typography.Text type="secondary">{t("profile.noGroups")}</Typography.Text>
                                    )}
                                </Space>
                            </>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
