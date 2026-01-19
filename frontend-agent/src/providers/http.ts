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
