import { useEffect, useMemo, useState } from "react";
import { Alert, Avatar, Button, Card, Form, Grid, Radio, Select, Space, Spin, Typography, theme } from "antd";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { http } from "../providers/http";
import {
    DEFAULT_CHAT_ASSIGNMENT,
    type ChatAssignmentDto,
    fetchChatAssignmentAdmin,
    updateChatAssignmentAdmin,
} from "../providers/chatSettings";
import { errorMessage } from "../utils/errorMessage";

type SkillGroupItem = {
    id: string;
    name: string;
    enabled: boolean;
    group_type?: string | null;
    is_fallback?: boolean | null;
    system_key?: string | null;
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

function normalizeMode(v: unknown): "auto" | "manual" {
    return v === "manual" ? "manual" : "auto";
}

export function ChatAssignmentPage() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const location = useLocation();
    const screens = Grid.useBreakpoint();
    const isNarrow = !screens.lg;
    const { token } = theme.useToken();

    const groupIdFromQuery = useMemo(() => {
        try {
            const sp = new URLSearchParams(String(location.search || ""));
            return String(sp.get("group_id") || "").trim();
        } catch {
            return "";
        }
    }, [location.search]);

    const [meRole, setMeRole] = useState<string>("");
    const [meLoading, setMeLoading] = useState<boolean>(true);
    const isAdmin = meRole === "admin";

    const [groups, setGroups] = useState<SkillGroupItem[]>([]);
    const [groupLoading, setGroupLoading] = useState(false);

    const [selectedGroupId, setSelectedGroupId] = useState<string>("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [saving, setSaving] = useState(false);

    const [initial, setInitial] = useState<ChatAssignmentDto>(DEFAULT_CHAT_ASSIGNMENT);
    const [form] = Form.useForm<ChatAssignmentDto>();
    const mode = Form.useWatch("mode", form);

    useEffect(() => {
        let mounted = true;
        setMeLoading(true);
        http
            .get<{ role?: string }>("/api/v1/auth/me")
            .then((res) => {
                if (!mounted) return;
                setMeRole(String(res.data?.role || ""));
            })
            .catch(() => {
                if (!mounted) return;
                setMeRole("");
            })
            .finally(() => {
                if (!mounted) return;
                setMeLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;

        let mounted = true;
        setGroupLoading(true);
        http
            .get<SkillGroupItem[]>("/api/v1/skill-groups")
            .then((res) => {
                if (!mounted) return;
                const list = Array.isArray(res.data) ? res.data : [];
                const enabled = list.filter((g) => g && g.enabled);

                enabled.sort((a, b) => {
                    const aFallback = Boolean(a.is_fallback);
                    const bFallback = Boolean(b.is_fallback);
                    if (aFallback !== bFallback) return aFallback ? -1 : 1;

                    const aSystem = String(a.group_type || "").trim().toLowerCase() === "system";
                    const bSystem = String(b.group_type || "").trim().toLowerCase() === "system";
                    if (aSystem !== bSystem) return aSystem ? -1 : 1;

                    const an = String(a.name || a.id || "").trim().toLowerCase();
                    const bn = String(b.name || b.id || "").trim().toLowerCase();
                    if (an < bn) return -1;
                    if (an > bn) return 1;
                    return 0;
                });

                setGroups(enabled);
            })
            .catch(() => {
                if (!mounted) return;
                setGroups([]);
            })
            .finally(() => {
                if (!mounted) return;
                setGroupLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [isAdmin, meLoading]);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;
        if (!Array.isArray(groups) || groups.length === 0) return;

        const fallback = groups.find((g) => Boolean(g.is_fallback));
        const fallbackId = fallback ? String(fallback.id || "") : "";

        const current = String(selectedGroupId || "").trim();
        const stillExists = current && groups.some((g) => String(g.id || "") === current);

        if (stillExists) return;

        const q = String(groupIdFromQuery || "").trim();
        const queryExists = q && groups.some((g) => String(g.id || "") === q);
        if (queryExists) {
            setSelectedGroupId(q);
            return;
        }

        if (fallbackId) setSelectedGroupId(fallbackId);
        else if (groups.length > 0) setSelectedGroupId(String(groups[0].id || ""));
    }, [groupIdFromQuery, groups, isAdmin, meLoading, selectedGroupId]);

    useEffect(() => {
        if (meLoading) return;
        if (!isAdmin) return;
        if (!selectedGroupId) return;

        let mounted = true;
        setLoading(true);
        setError("");

        fetchChatAssignmentAdmin(selectedGroupId)
            .then((cfg) => {
                if (!mounted) return;
                const next = { mode: normalizeMode(cfg.mode) };
                setInitial(next);
                form.setFieldsValue(next);
            })
            .catch((e: unknown) => {
                if (!mounted) return;
                setError(errorMessage(e, "load_chat_assignment_failed"));
            })
            .finally(() => {
                if (!mounted) return;
                setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [form, isAdmin, meLoading, selectedGroupId]);

    async function save(values: ChatAssignmentDto) {
        if (!selectedGroupId) return;
        setSaving(true);
        setError("");
        try {
            const res = await updateChatAssignmentAdmin(selectedGroupId, { mode: normalizeMode(values.mode) });
            const next = { mode: normalizeMode(res.mode) };
            setInitial(next);
            form.setFieldsValue(next);
        } catch (e: unknown) {
            setError(errorMessage(e, "save_chat_assignment_failed"));
        } finally {
            setSaving(false);
        }
    }

    function reset() {
        form.setFieldsValue(initial);
    }

    const groupOptions = useMemo(
        () =>
            (groups || []).map((g) => ({
                title: String(g.name || g.id),
                label: (
                    <Space size={8} align="center">
                        <Avatar size={20} style={avatarStyle(String(g.id || g.name || ""))}>
                            {initials(String(g.name || g.id))}
                        </Avatar>
                        <span>{String(g.name || g.id)}</span>
                    </Space>
                ),
                value: String(g.id),
            })),
        [groups],
    );

    const selectedMode = normalizeMode(mode);

    const tileBaseStyle = {
        cursor: meLoading || !isAdmin || loading ? "not-allowed" : "pointer",
        borderRadius: token.borderRadiusLG,
    } as const;

    const autoTileStyle = {
        ...tileBaseStyle,
        borderColor: selectedMode === "auto" ? token.colorPrimary : token.colorBorder,
    } as const;

    const manualTileStyle = {
        ...tileBaseStyle,
        borderColor: selectedMode === "manual" ? token.colorPrimary : token.colorBorder,
    } as const;

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
            <Card title={t("chatAssignment.title")}>
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 0 }}>
                        {t("chatAssignment.hint")}
                    </Typography.Paragraph>

                    {!meLoading && !isAdmin ? (
                        <Alert type="warning" message={t("chatAssignment.adminOnlyHint")} showIcon />
                    ) : null}

                    {error ? <Alert type="error" message={error} showIcon /> : null}

                    <Space size={10} align="center" wrap>
                        <Typography.Text type="secondary">{t("chatAssignment.setupForGroup")}</Typography.Text>
                        <Select
                            style={{ minWidth: 260 }}
                            loading={groupLoading}
                            disabled={meLoading || !isAdmin || groupLoading}
                            value={selectedGroupId || undefined}
                            placeholder={t("chatAssignment.groupPlaceholder")}
                            showSearch
                            filterOption={(input, option) =>
                                String((option as any)?.title || "")
                                    .toLowerCase()
                                    .includes(String(input || "").toLowerCase())
                            }
                            options={groupOptions}
                            onChange={(v) => setSelectedGroupId(String(v || ""))}
                        />
                        {loading ? <Spin size="small" /> : null}
                    </Space>

                    <div>
                        <Typography.Title level={5} style={{ marginTop: 8, marginBottom: 12 }}>
                            {t("chatAssignment.chooseTitle")}
                        </Typography.Title>

                        <Form
                            form={form}
                            layout="vertical"
                            initialValues={DEFAULT_CHAT_ASSIGNMENT}
                            onFinish={save}
                            disabled={meLoading || !isAdmin || loading || !selectedGroupId}
                        >
                            <Form.Item name="mode" style={{ marginBottom: 16 }}>
                                <Radio.Group style={{ width: "100%" }}>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                                            gap: 12,
                                        }}
                                    >
                                        <Card
                                            size="small"
                                            style={autoTileStyle}
                                            bodyStyle={{ padding: 16 }}
                                            onClick={() => form.setFieldValue("mode", "auto")}
                                        >
                                            <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                                <Radio value="auto">{t("chatAssignment.auto.title")}</Radio>
                                                <Typography.Text type="secondary">{t("chatAssignment.auto.desc")}</Typography.Text>
                                                <Typography.Text type="secondary">
                                                    {t("chatAssignment.auto.tipBefore")} 
                                                    <Typography.Link onClick={() => nav("/profile")}> 
                                                        {t("chatAssignment.auto.tipLink")}
                                                    </Typography.Link>
                                                    .
                                                </Typography.Text>
                                            </Space>
                                        </Card>

                                        <Card
                                            size="small"
                                            style={manualTileStyle}
                                            bodyStyle={{ padding: 16 }}
                                            onClick={() => form.setFieldValue("mode", "manual")}
                                        >
                                            <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                                <Radio value="manual">{t("chatAssignment.manual.title")}</Radio>
                                                <Typography.Text type="secondary">{t("chatAssignment.manual.desc")}</Typography.Text>
                                            </Space>
                                        </Card>
                                    </div>
                                </Radio.Group>
                            </Form.Item>

                            <Space>
                                <Button type="primary" htmlType="submit" loading={saving} disabled={meLoading || !isAdmin || !selectedGroupId}>
                                    {t("common.save")}
                                </Button>
                                <Button onClick={reset} disabled={saving || meLoading || !isAdmin || !selectedGroupId}>
                                    {t("common.cancel")}
                                </Button>
                            </Space>
                        </Form>
                    </div>
                </Space>
            </Card>
        </div>
    );
}
