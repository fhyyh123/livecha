import { http } from "./http";

export type InactivityTimeoutsDto = {
    agent_no_reply_transfer_enabled: boolean;
    agent_no_reply_transfer_minutes: number;
    visitor_idle_enabled: boolean;
    visitor_idle_minutes: number;
    inactivity_archive_enabled: boolean;
    inactivity_archive_minutes: number;
};

export type FileSharingDto = {
    visitor_file_enabled: boolean;
    agent_file_enabled: boolean;
};

export type ChatAssignmentDto = {
    mode: "auto" | "manual";
};

export type TranscriptForwardingDto = {
    emails: string[];
};

export const DEFAULT_INACTIVITY_TIMEOUTS: InactivityTimeoutsDto = {
    agent_no_reply_transfer_enabled: true,
    agent_no_reply_transfer_minutes: 3,
    visitor_idle_enabled: true,
    visitor_idle_minutes: 10,
    inactivity_archive_enabled: true,
    inactivity_archive_minutes: 60,
};

export const DEFAULT_FILE_SHARING: FileSharingDto = {
    visitor_file_enabled: true,
    agent_file_enabled: true,
};

export const DEFAULT_CHAT_ASSIGNMENT: ChatAssignmentDto = {
    mode: "auto",
};

export const DEFAULT_TRANSCRIPT_FORWARDING: TranscriptForwardingDto = {
    emails: [],
};

const STORAGE_KEY = "chatlive.chatSettings.inactivityTimeouts" as const;

const STORAGE_KEY_FILE_SHARING = "chatlive.chatSettings.fileSharing" as const;

const STORAGE_KEY_TRANSCRIPT_FORWARDING = "chatlive.chatSettings.transcriptForwarding" as const;

export function getCachedInactivityTimeouts(): InactivityTimeoutsDto {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_INACTIVITY_TIMEOUTS;
        const parsed = JSON.parse(raw) as Partial<InactivityTimeoutsDto>;
        const tEnabled =
            typeof parsed.agent_no_reply_transfer_enabled === "boolean"
                ? parsed.agent_no_reply_transfer_enabled
                : DEFAULT_INACTIVITY_TIMEOUTS.agent_no_reply_transfer_enabled;
        const vEnabled = typeof parsed.visitor_idle_enabled === "boolean" ? parsed.visitor_idle_enabled : DEFAULT_INACTIVITY_TIMEOUTS.visitor_idle_enabled;
        const aEnabled =
            typeof parsed.inactivity_archive_enabled === "boolean"
                ? parsed.inactivity_archive_enabled
                : DEFAULT_INACTIVITY_TIMEOUTS.inactivity_archive_enabled;

        const t = Number(parsed.agent_no_reply_transfer_minutes ?? 0);

        const v = Number(parsed.visitor_idle_minutes ?? 0);
        const a = Number(parsed.inactivity_archive_minutes ?? 0);
        return {
            agent_no_reply_transfer_enabled: tEnabled,
            agent_no_reply_transfer_minutes:
                Number.isFinite(t) && t > 0 ? t : DEFAULT_INACTIVITY_TIMEOUTS.agent_no_reply_transfer_minutes,
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

export function getCachedFileSharing(): FileSharingDto {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_FILE_SHARING);
        if (!raw) return DEFAULT_FILE_SHARING;
        const parsed = JSON.parse(raw) as Partial<FileSharingDto>;
        return {
            visitor_file_enabled:
                typeof parsed.visitor_file_enabled === "boolean" ? parsed.visitor_file_enabled : DEFAULT_FILE_SHARING.visitor_file_enabled,
            agent_file_enabled:
                typeof parsed.agent_file_enabled === "boolean" ? parsed.agent_file_enabled : DEFAULT_FILE_SHARING.agent_file_enabled,
        };
    } catch {
        return DEFAULT_FILE_SHARING;
    }
}

export function setCachedFileSharing(v: FileSharingDto) {
    try {
        localStorage.setItem(STORAGE_KEY_FILE_SHARING, JSON.stringify(v));
    } catch {
        // ignore
    }
}

export function getCachedTranscriptForwarding(): TranscriptForwardingDto {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_TRANSCRIPT_FORWARDING);
        if (!raw) return DEFAULT_TRANSCRIPT_FORWARDING;
        const parsed = JSON.parse(raw) as Partial<TranscriptForwardingDto>;
        const list = Array.isArray(parsed.emails) ? parsed.emails : [];
        const cleaned = list
            .map((x) => String(x || "").trim())
            .filter((x) => x);
        return { emails: cleaned.slice(0, 1) };
    } catch {
        return DEFAULT_TRANSCRIPT_FORWARDING;
    }
}

export function setCachedTranscriptForwarding(v: TranscriptForwardingDto) {
    try {
        localStorage.setItem(STORAGE_KEY_TRANSCRIPT_FORWARDING, JSON.stringify(v));
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

export async function fetchFileSharing(): Promise<FileSharingDto> {
    const res = await http.get<FileSharingDto>("/api/v1/chat-settings/file-sharing");
    const data = res.data || DEFAULT_FILE_SHARING;
    setCachedFileSharing(data);
    return data;
}

export async function fetchFileSharingAdmin(): Promise<FileSharingDto> {
    const res = await http.get<FileSharingDto>("/api/v1/admin/chat-settings/file-sharing");
    const data = res.data || DEFAULT_FILE_SHARING;
    setCachedFileSharing(data);
    return data;
}

export async function updateFileSharingAdmin(values: FileSharingDto): Promise<FileSharingDto> {
    const res = await http.put<FileSharingDto>("/api/v1/admin/chat-settings/file-sharing", values);
    const data = res.data || values;
    setCachedFileSharing(data);
    return data;
}

export async function fetchChatAssignmentAdmin(groupId: string): Promise<ChatAssignmentDto> {
    const res = await http.get<ChatAssignmentDto>("/api/v1/admin/chat-settings/chat-assignment", {
        params: { group_id: groupId },
    });
    const data = res.data || DEFAULT_CHAT_ASSIGNMENT;
    return {
        mode: data.mode === "manual" ? "manual" : "auto",
    };
}

export async function updateChatAssignmentAdmin(groupId: string, values: ChatAssignmentDto): Promise<ChatAssignmentDto> {
    const payload: ChatAssignmentDto = { mode: values.mode === "manual" ? "manual" : "auto" };
    const res = await http.put<ChatAssignmentDto>("/api/v1/admin/chat-settings/chat-assignment", payload, {
        params: { group_id: groupId },
    });
    const data = res.data || payload;
    return {
        mode: data.mode === "manual" ? "manual" : "auto",
    };
}

export async function fetchTranscriptForwardingAdmin(): Promise<TranscriptForwardingDto> {
    const res = await http.get<TranscriptForwardingDto>("/api/v1/admin/chat-settings/transcript-forwarding");
    const data = res.data || DEFAULT_TRANSCRIPT_FORWARDING;
    const emails = Array.isArray(data.emails) ? data.emails : [];
    const cleaned = emails
        .map((x) => String(x || "").trim())
        .filter((x) => x)
        .slice(0, 1);
    const next = { emails: cleaned };
    setCachedTranscriptForwarding(next);
    return next;
}

export async function updateTranscriptForwardingAdmin(values: TranscriptForwardingDto): Promise<TranscriptForwardingDto> {
    const payload: TranscriptForwardingDto = {
        emails: (Array.isArray(values.emails) ? values.emails : [])
            .map((x) => String(x || "").trim())
            .filter((x) => x)
            .slice(0, 1),
    };
    const res = await http.put<TranscriptForwardingDto>("/api/v1/admin/chat-settings/transcript-forwarding", payload);
    const data = res.data || payload;
    const emails = Array.isArray(data.emails) ? data.emails : payload.emails;
    const cleaned = emails
        .map((x) => String(x || "").trim())
        .filter((x) => x)
        .slice(0, 1);
    const next = { emails: cleaned };
    setCachedTranscriptForwarding(next);
    return next;
}
