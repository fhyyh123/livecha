import { http } from "./http";

export type InactivityTimeoutsDto = {
    visitor_idle_enabled: boolean;
    visitor_idle_minutes: number;
    inactivity_archive_enabled: boolean;
    inactivity_archive_minutes: number;
};

export const DEFAULT_INACTIVITY_TIMEOUTS: InactivityTimeoutsDto = {
    visitor_idle_enabled: true,
    visitor_idle_minutes: 10,
    inactivity_archive_enabled: true,
    inactivity_archive_minutes: 60,
};

const STORAGE_KEY = "chatlive.chatSettings.inactivityTimeouts" as const;

export function getCachedInactivityTimeouts(): InactivityTimeoutsDto {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_INACTIVITY_TIMEOUTS;
        const parsed = JSON.parse(raw) as Partial<InactivityTimeoutsDto>;
        const vEnabled = typeof parsed.visitor_idle_enabled === "boolean" ? parsed.visitor_idle_enabled : DEFAULT_INACTIVITY_TIMEOUTS.visitor_idle_enabled;
        const aEnabled =
            typeof parsed.inactivity_archive_enabled === "boolean"
                ? parsed.inactivity_archive_enabled
                : DEFAULT_INACTIVITY_TIMEOUTS.inactivity_archive_enabled;

        const v = Number(parsed.visitor_idle_minutes ?? 0);
        const a = Number(parsed.inactivity_archive_minutes ?? 0);
        return {
            visitor_idle_enabled: vEnabled,
            visitor_idle_minutes: Number.isFinite(v) && v > 0 ? v : DEFAULT_INACTIVITY_TIMEOUTS.visitor_idle_minutes,
            inactivity_archive_enabled: aEnabled,
            inactivity_archive_minutes: Number.isFinite(a) && a > 0 ? a : DEFAULT_INACTIVITY_TIMEOUTS.inactivity_archive_minutes,
        };
    } catch {
        return DEFAULT_INACTIVITY_TIMEOUTS;
    }
}

export function setCachedInactivityTimeouts(v: InactivityTimeoutsDto) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
        // ignore
    }
}

export async function fetchInactivityTimeouts(): Promise<InactivityTimeoutsDto> {
    const res = await http.get<InactivityTimeoutsDto>("/api/v1/chat-settings/inactivity-timeouts");
    const data = res.data || DEFAULT_INACTIVITY_TIMEOUTS;
    setCachedInactivityTimeouts(data);
    return data;
}

export async function fetchInactivityTimeoutsAdmin(): Promise<InactivityTimeoutsDto> {
    const res = await http.get<InactivityTimeoutsDto>("/api/v1/admin/chat-settings/inactivity-timeouts");
    const data = res.data || DEFAULT_INACTIVITY_TIMEOUTS;
    setCachedInactivityTimeouts(data);
    return data;
}

export async function updateInactivityTimeoutsAdmin(values: InactivityTimeoutsDto): Promise<InactivityTimeoutsDto> {
    const res = await http.put<InactivityTimeoutsDto>("/api/v1/admin/chat-settings/inactivity-timeouts", values);
    const data = res.data || values;
    setCachedInactivityTimeouts(data);
    return data;
}
