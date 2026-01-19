export type ModeKey = "home" | "chat" | "archives" | "team" | "invites" | "settings";

export type IconKey =
    | "home"
    | "chat"
    | "archives"
    | "settings"
    | "inbox"
    | "archive"
    | "sites"
    | "invites"
    | "team"
    | "profile";

export type NavModeConfig = {
    key: ModeKey;
    labelKey: string;
    icon: IconKey;
    routePrefixes: string[];
    defaultRoute: string;
};

export type NavMenuItemConfig = {
    key: string;
    mode: ModeKey;
    icon?: IconKey;
};

export type NavTreeItem = {
    key: string;
    labelKey: string;
    route?: string;
    children?: NavTreeItem[];
};

export const NAV_MODES: NavModeConfig[] = [
    {
        key: "home",
        labelKey: "nav.modeHome",
        icon: "home",
        routePrefixes: ["/"],
        defaultRoute: "/",
    },
    {
        key: "chat",
        labelKey: "nav.modeChats",
        icon: "chat",
        routePrefixes: ["/conversations"],
        defaultRoute: "/conversations",
    },
    {
        key: "archives",
        labelKey: "nav.modeArchives",
        icon: "archives",
        routePrefixes: ["/archives"],
        defaultRoute: "/archives",
    },
    {
        key: "team",
        labelKey: "nav.modeTeam",
        icon: "team",
        routePrefixes: ["/team"],
        defaultRoute: "/team",
    },
    {
        key: "invites",
        labelKey: "nav.modeInvites",
        icon: "invites",
        routePrefixes: ["/invites"],
        defaultRoute: "/invites",
    },
    {
        key: "settings",
        labelKey: "nav.modeSettings",
        icon: "settings",
        routePrefixes: ["/sites", "/settings"],
        defaultRoute: "/sites",
    },
];

// Settings menu is intentionally local-config-driven, so it can later be swapped to a remote data source.
// It supports nested submenus (2+ levels). "Install Online Chat" reuses the existing /sites page.
export const SETTINGS_MENU_TREE: NavTreeItem[] = [
    {
        key: "channels",
        labelKey: "settings.menu.channels",
        children: [
            { key: "install", labelKey: "settings.menu.installOnlineChat", route: "/sites" },
            { key: "helpdeskEmail", labelKey: "settings.menu.helpdeskEmail", route: "/settings/channels/helpdesk-email" },
            { key: "facebook", labelKey: "settings.menu.facebookMessenger", route: "/settings/channels/facebook-messenger" },
            { key: "apple", labelKey: "settings.menu.appleMessages", route: "/settings/channels/apple-messages" },
        ],
    },
    {
        key: "chatPage",
        labelKey: "settings.menu.chatPage",
        route: "/settings/chat-page",
    },
    {
        key: "widget",
        labelKey: "settings.menu.widget",
        children: [
            { key: "customize", labelKey: "settings.menu.customize", route: "/settings/widget/customize" },
            { key: "language", labelKey: "settings.menu.language", route: "/settings/widget/language" },
            { key: "availability", labelKey: "settings.menu.availability", route: "/settings/widget/availability" },
            { key: "welcome", labelKey: "settings.menu.welcomeScreen", route: "/settings/widget/welcome" },
        ],
    },
    {
        key: "chatSettings",
        labelKey: "settings.menu.chatSettings",
        children: [
            {
                key: "chatAssignment",
                labelKey: "settings.menu.chatAssignment",
                route: "/settings/chat-settings/chat-assignment",
            },
            {
                key: "transcriptForwarding",
                labelKey: "settings.menu.transcriptForwarding",
                route: "/settings/chat-settings/transcript-forwarding",
            },
            {
                key: "fileSharing",
                labelKey: "settings.menu.fileSharing",
                route: "/settings/chat-settings/file-sharing",
            },
            {
                key: "inactivityTimeouts",
                labelKey: "settings.menu.inactivityTimeouts",
                route: "/settings/chat-settings/inactivity-timeouts",
            },
        ],
    },
    {
        key: "security",
        labelKey: "settings.menu.security",
        children: [
            {
                key: "trustedDomains",
                labelKey: "settings.menu.trustedDomains",
                route: "/settings/security/trusted-domains",
            },
            {
                key: "bannedCustomers",
                labelKey: "settings.menu.bannedCustomers",
                route: "/settings/security/banned-customers",
            },
            {
                key: "loginSettings",
                labelKey: "settings.menu.loginSettings",
                route: "/settings/security/login-settings",
            },
        ],
    },
];

export const NAV_MENU_ITEMS: NavMenuItemConfig[] = [
    { key: "conversations", mode: "chat", icon: "inbox" },
    { key: "archives", mode: "archives", icon: "archive" },
    { key: "team", mode: "team", icon: "team" },
    { key: "invites", mode: "invites", icon: "invites" },
    { key: "sites", mode: "settings", icon: "sites" },
    { key: "profile", mode: "settings", icon: "profile" },
];
