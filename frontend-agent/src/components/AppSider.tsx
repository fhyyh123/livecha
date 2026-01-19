import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout, Menu, Tooltip, Typography, Button, type MenuProps } from "antd";
import {
    AppstoreOutlined,
    MessageOutlined,
    HomeOutlined,
    InboxOutlined,
    SettingOutlined,
    TeamOutlined,
    UserOutlined,
} from "@ant-design/icons";

import { NAV_MODES, SETTINGS_MENU_TREE, type IconKey, type ModeKey, type NavTreeItem } from "../config/navConfig";

const LEFT_WIDTH = 72;
const RIGHT_WIDTH = 228;

type ModeDefinition = {
    key: ModeKey;
    label: string;
    icon: ReactNode;
    match: (path: string) => boolean;
};

const iconMap: Record<IconKey, ReactNode> = {
    home: <HomeOutlined />,
    chat: <MessageOutlined />,
    archives: <AppstoreOutlined />,
    settings: <SettingOutlined />,
    inbox: <InboxOutlined />,
    archive: <AppstoreOutlined />,
    sites: <AppstoreOutlined />,
    invites: <TeamOutlined />,
    team: <TeamOutlined />,
    profile: <UserOutlined />,
};

function getIcon(key?: IconKey, fallback?: ReactNode) {
    if (key && iconMap[key]) return iconMap[key];
    return fallback ?? <AppstoreOutlined />;
}

function resolveModeFromPath(pathname: string): ModeKey {
    const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
    const match = NAV_MODES.find((mode) =>
        mode.routePrefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix + "/")),
    );
    return match?.key ?? "chat";
}

function findSelectedKeyByPath(items: NavTreeItem[], pathname: string): string | null {
    const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
    for (const item of items) {
        if (item.route) {
            const route = item.route === "/" ? "/" : item.route.replace(/\/+$/, "");
            if (normalized === route || normalized.startsWith(route + "/")) return item.key;
        }
        if (item.children?.length) {
            const hit = findSelectedKeyByPath(item.children, normalized);
            if (hit) return hit;
        }
    }
    return null;
}

function findOpenKeysForSelected(items: NavTreeItem[], selectedKey: string): string[] {
    function walk(nodes: NavTreeItem[], parents: string[]): string[] | null {
        for (const node of nodes) {
            if (node.key === selectedKey) return parents;
            if (node.children?.length) {
                const hit = walk(node.children, [...parents, node.key]);
                if (hit) return hit;
            }
        }
        return null;
    }
    return walk(items, []) ?? [];
}

function buildAntdMenuItems(items: NavTreeItem[], t: (key: string) => string): NonNullable<MenuProps["items"]> {
    return items.map((item) => {
        const label = t(item.labelKey);
        if (item.children?.length) {
            return {
                key: item.key,
                label,
                children: buildAntdMenuItems(item.children, t),
            };
        }
        return { key: item.key, label };
    }) as NonNullable<MenuProps["items"]>;
}

function findRouteByKey(items: NavTreeItem[], key: string): string | null {
    for (const item of items) {
        if (item.key === key) return item.route ?? null;
        if (item.children?.length) {
            const hit = findRouteByKey(item.children, key);
            if (hit) return hit;
        }
    }
    return null;
}

export function AppSider() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();

    const [menuOpen, setMenuOpen] = useState(false);
    const activeMode = useMemo(() => resolveModeFromPath(location.pathname), [location.pathname]);

    // Only these modes will show a right-side submenu panel.
    // Others (chat/archives/team/invites) should navigate directly.
    const modesWithSubmenu = useMemo(() => new Set<ModeKey>(["settings"]), []);

    const modes = useMemo<ModeDefinition[]>(
        () =>
            NAV_MODES.map((mode) => ({
                key: mode.key,
                label: t(mode.labelKey),
                icon: getIcon(mode.icon),
                match: (path) => mode.routePrefixes.some((prefix) => path.startsWith(prefix)),
            })),
        [t],
    );

    const activeModeLabel = modes.find((m) => m.key === activeMode)?.label ?? t("nav.modeChats");

    const settingsSelectedKey = useMemo(
        () => (activeMode === "settings" ? findSelectedKeyByPath(SETTINGS_MENU_TREE, location.pathname) : null),
        [activeMode, location.pathname],
    );

    const settingsDefaultOpenKeys = useMemo(() => {
        if (activeMode !== "settings") return [];
        if (!settingsSelectedKey) return [];
        return findOpenKeysForSelected(SETTINGS_MENU_TREE, settingsSelectedKey);
    }, [activeMode, settingsSelectedKey]);

    const settingsMenuItems = useMemo(() => buildAntdMenuItems(SETTINGS_MENU_TREE, t), [t]);

    return (
        <Layout.Sider
            theme="light"
            width={LEFT_WIDTH + RIGHT_WIDTH}
            collapsedWidth={LEFT_WIDTH}
            collapsed={!menuOpen}
            trigger={null}
            style={{
                overflow: "hidden",
                height: "100vh",
            }}
        >
            <div style={{ display: "flex", height: "100%" }}>
                <div
                    style={{
                        width: LEFT_WIDTH,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "12px 0",
                        gap: 8,
                        background: "#000",
                    }}
                >
                    {modes.map((mode) => {
                        const isActive = mode.key === activeMode;
                        return (
                            <Tooltip key={mode.key} title={mode.label} placement="right">
                                <Button
                                    type="text"
                                    shape="circle"
                                    size="middle"
                                    icon={mode.icon}
                                    aria-label={mode.label}
                                    style={{
                                        width: 44,
                                        height: 44,
                                        fontSize: 20,
                                        color: "#fff",
                                        background: isActive ? "rgba(255,255,255,0.16)" : "transparent",
                                    }}
                                    onClick={() => {
                                        const modeConfig = NAV_MODES.find((m) => m.key === mode.key);
                                        const allowSubmenu = modesWithSubmenu.has(mode.key);

                                        if (allowSubmenu) {
                                            if (modeConfig?.defaultRoute) navigate(modeConfig.defaultRoute);
                                            setMenuOpen(true);
                                            return;
                                        }

                                        if (modeConfig?.defaultRoute) navigate(modeConfig.defaultRoute);
                                        setMenuOpen(false);
                                    }}
                                />
                            </Tooltip>
                        );
                    })}
                </div>

                <div
                    style={{
                        width: RIGHT_WIDTH,
                        display: menuOpen && modesWithSubmenu.has(activeMode) ? "flex" : "none",
                        flexDirection: "column",
                        minHeight: 0,
                    }}
                >
                    <div style={{ padding: "12px 12px 8px" }}>
                        <Typography.Text strong>{activeModeLabel}</Typography.Text>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                        <Menu
                            key={`${activeMode}:${settingsSelectedKey || ""}`}
                            mode="inline"
                            items={activeMode === "settings" ? settingsMenuItems : []}
                            selectedKeys={settingsSelectedKey ? [settingsSelectedKey] : []}
                            defaultOpenKeys={settingsDefaultOpenKeys}
                            onClick={({ key }) => {
                                if (activeMode !== "settings") return;
                                const route = findRouteByKey(SETTINGS_MENU_TREE, String(key));
                                if (route) navigate(route);
                            }}
                        />
                    </div>
                </div>
            </div>
        </Layout.Sider>
    );
}
