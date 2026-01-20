import axios from "axios";

export const TOKEN_STORAGE_KEY = "chatlive.agent.token" as const;

export function getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

export function setToken(token: string) {
    if (!token) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function base64UrlDecodeToUtf8(input: string) {
    const normalized = String(input || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLen);
    // atob is available in browsers; this app is client-only.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const atobFn = globalThis.atob;
    if (typeof atobFn !== "function") return "";
    return atobFn(padded);
}

export function getTokenSubject(token?: string) {
    const raw = String(token || "").trim();
    if (!raw) return "";
    const parts = raw.split(".");
    if (parts.length < 2) return "";
    try {
        const payloadJson = base64UrlDecodeToUtf8(parts[1]);
        if (!payloadJson) return "";
        const payload = JSON.parse(payloadJson) as Record<string, unknown>;
        const sub = payload?.sub;
        return typeof sub === "string" ? sub : "";
    } catch {
        return "";
    }
}

export function getCurrentUserId() {
    return getTokenSubject(getToken());
}

export const http = axios.create({
    baseURL: "/",
    timeout: 15000,
});

http.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

http.interceptors.response.use(
    (resp) => {
        const data = resp.data;
        // Backend uses ApiResponse<T>: { ok, data, error }
        if (data && typeof data === "object" && "ok" in data) {
            if (data.ok) {
                resp.data = data.data;
                return resp;
            }
            const err = new Error(data.error || "request_failed");
            // @ts-expect-error attach backend code
            err.code = data.error;
            throw err;
        }
        return resp;
    },
    (err) => {
        const data = err?.response?.data;
        if (data && typeof data === "object" && "ok" in data && !data.ok) {
            err.message = data.error || err.message;
        }
        throw err;
    },
);
