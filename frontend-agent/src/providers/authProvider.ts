import type { AuthBindings } from "@refinedev/core";
import { getToken, http, setToken, TOKEN_STORAGE_KEY } from "./http";
import { getMeCached } from "./meCache";

const SESSION_STORAGE_KEY = "chatlive.agent.session_id" as const;
const HEARTBEAT_INTERVAL_KEY = "chatlive.agent.heartbeat_interval" as const;
const HEARTBEAT_TTL_KEY = "chatlive.agent.heartbeat_ttl" as const;

type LoginResponse = {
    access_token: string;
    agent_session_id?: string | null;
    heartbeat_interval_seconds?: number | null;
    heartbeat_ttl_seconds?: number | null;
};

type MeResponse = {
    user_id?: string;
    username?: string;
    role?: string;
    tenant_id?: string;
    email_verified?: boolean;
};

export const authProvider: AuthBindings = {
    login: async ({ username, password }) => {
        const res = await http.post<LoginResponse>("/api/v1/auth/login", {
            username,
            password,
            client: "agent",
        });

        const token = res.data?.access_token;
        if (!token) {
            return {
                success: false,
                error: {
                    name: "login_failed",
                    message: "missing access_token",
                },
            };
        }

        setToken(token);

        try {
            const sessionId = res.data?.agent_session_id || "";
            if (sessionId) {
                localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
                localStorage.setItem(
                    HEARTBEAT_INTERVAL_KEY,
                    String(Number(res.data?.heartbeat_interval_seconds || 10) || 10),
                );
                localStorage.setItem(
                    HEARTBEAT_TTL_KEY,
                    String(Number(res.data?.heartbeat_ttl_seconds || 35) || 35),
                );
            } else {
                localStorage.removeItem(SESSION_STORAGE_KEY);
                localStorage.removeItem(HEARTBEAT_INTERVAL_KEY);
                localStorage.removeItem(HEARTBEAT_TTL_KEY);
            }
        } catch {
            // ignore
        }

        try {
            const meRes = await http.get<MeResponse>("/api/v1/auth/me");
            const me = meRes.data;
            if (me && me.email_verified === false) {
                return {
                    success: true,
                    redirectTo: "/verify-email-code",
                };
            }
        } catch {
            // Ignore and let the user in; route-level guard will handle if needed.
        }

        return {
            success: true,
            redirectTo: "/",
        };
    },

    logout: async () => {
        try {
            const sessionId = localStorage.getItem(SESSION_STORAGE_KEY) || "";
            if (sessionId) {
                await http.post("/api/v1/agent/logout", { session_id: sessionId });
            }
        } catch {
            // ignore
        }
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(HEARTBEAT_INTERVAL_KEY);
        localStorage.removeItem(HEARTBEAT_TTL_KEY);
        return {
            success: true,
            redirectTo: "/login",
        };
    },

    check: async () => {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token) {
            return {
                authenticated: false,
                redirectTo: "/login",
            };
        }

        return {
            authenticated: true,
        };
    },

    onError: async (error) => {
        const msg = (error as { message?: string } | null | undefined)?.message;
        if (msg === "missing_token" || msg === "unauthorized" || msg === "token_expired" || msg === "invalid_token") {
            return {
                logout: true,
            };
        }
        return { error };
    },

    getIdentity: async () => {
        if (!getToken()) return null;
        try {
            const me = (await getMeCached()) as MeResponse | null;
            if (!me) return null;
            return {
                id: me.user_id || "me",
                name: me.username || me.user_id || "me",
                avatar: undefined,
                ...me,
            };
        } catch {
            return null;
        }
    },

    getPermissions: async () => {
        if (!getToken()) return null;
        try {
            const me = (await getMeCached()) as MeResponse | null;
            return me?.role || null;
        } catch {
            return null;
        }
    },
};
