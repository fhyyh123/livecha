import { create } from "zustand";

import { http } from "../providers/http";

export type SiteItem = {
    id: string;
    name: string;
    public_key: string;
    status: string;
};

export type WidgetConfig = {
    pre_chat_enabled: boolean;
    pre_chat_fields_json?: string | null;
    theme_color?: string | null;
    welcome_text?: string | null;
    cookie_domain?: string | null;
    cookie_samesite?: string | null;
    pre_chat_message?: string | null;
    pre_chat_name_label?: string | null;
    pre_chat_email_label?: string | null;
    pre_chat_name_required?: boolean;
    pre_chat_email_required?: boolean;
};

const CURRENT_SITE_STORAGE_KEY = "chatlive:currentSiteId" as const;

function getInitialSiteId() {
    try {
        return localStorage.getItem(CURRENT_SITE_STORAGE_KEY) || "";
    } catch {
        return "";
    }
}

type SiteState = {
    sites: SiteItem[];
    sitesLoading: boolean;
    sitesError: string;

    widgetConfigBySiteId: Record<string, WidgetConfig | null | undefined>;
    widgetConfigLoadingBySiteId: Record<string, boolean | undefined>;
    widgetConfigErrorBySiteId: Record<string, string | undefined>;

    currentSiteId: string;
    setCurrentSiteId: (siteId: string) => void;

    loadSites: () => Promise<void>;
    loadWidgetConfig: (siteId: string) => Promise<void>;
};

export const useSiteStore = create<SiteState>((set, get) => ({
    sites: [],
    sitesLoading: false,
    sitesError: "",

    widgetConfigBySiteId: {},
    widgetConfigLoadingBySiteId: {},
    widgetConfigErrorBySiteId: {},

    currentSiteId: getInitialSiteId(),
    setCurrentSiteId: (siteId) => {
        set({ currentSiteId: siteId });
        try {
            if (siteId) localStorage.setItem(CURRENT_SITE_STORAGE_KEY, siteId);
            else localStorage.removeItem(CURRENT_SITE_STORAGE_KEY);
        } catch {
            // ignore
        }

        // Best-effort: keep widget config cached for current site.
        if (siteId) {
            get()
                .loadWidgetConfig(siteId)
                .catch(() => {
                    // ignore
                });
        }
    },

    loadSites: async () => {
        if (get().sitesLoading) return;
        set({ sitesLoading: true, sitesError: "" });
        try {
            const res = await http.get<SiteItem[]>("/api/v1/sites");
            const list = res.data || [];
            set({ sites: list });

            const cur = get().currentSiteId;
            const stillValid = cur && list.some((s) => s.id === cur);
            if (!stillValid && list.length) {
                get().setCurrentSiteId(list[0].id);
            }
        } catch (e: unknown) {
            const msg = (e as Error)?.message || "load_sites_failed";
            set({ sitesError: msg });
        } finally {
            set({ sitesLoading: false });
        }
    },

    loadWidgetConfig: async (siteId: string) => {
        const sid = String(siteId || "").trim();
        if (!sid) return;

        const loading = get().widgetConfigLoadingBySiteId[sid];
        if (loading) return;

        set((s) => ({
            widgetConfigLoadingBySiteId: { ...s.widgetConfigLoadingBySiteId, [sid]: true },
            widgetConfigErrorBySiteId: { ...s.widgetConfigErrorBySiteId, [sid]: "" },
        }));

        try {
            const res = await http.get<WidgetConfig>(`/api/v1/sites/${encodeURIComponent(sid)}/widget-config`);
            set((s) => ({
                widgetConfigBySiteId: { ...s.widgetConfigBySiteId, [sid]: res.data || null },
            }));
        } catch (e: unknown) {
            const msg = (e as Error)?.message || "load_widget_config_failed";
            set((s) => ({
                widgetConfigErrorBySiteId: { ...s.widgetConfigErrorBySiteId, [sid]: msg },
            }));
        } finally {
            set((s) => ({
                widgetConfigLoadingBySiteId: { ...s.widgetConfigLoadingBySiteId, [sid]: false },
            }));
        }
    },
}));
