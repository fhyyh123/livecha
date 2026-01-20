import { AUTH_CHANGED_EVENT, getToken, http } from "./http";

export type MeResponse = {
    user_id?: string;
    username?: string;
    role?: string;
    tenant_id?: string;
    email_verified?: boolean;
};

type CacheEntry = {
    me: MeResponse | null;
    at: number;
};

let cache: CacheEntry = { me: null, at: 0 };
let inflight: Promise<MeResponse | null> | null = null;

const CACHE_TTL_MS = 10_000;

function resetCache() {
    cache = { me: null, at: 0 };
    inflight = null;
}

// Same-tab auth change events (login/logout).
try {
    globalThis.window?.addEventListener(AUTH_CHANGED_EVENT, resetCache);
} catch {
    // ignore
}

export function clearMeCache() {
    resetCache();
}

export async function getMeCached(): Promise<MeResponse | null> {
    const token = getToken();
    if (!token) {
        resetCache();
        return null;
    }

    const now = Date.now();
    if (cache.at && now - cache.at < CACHE_TTL_MS) return cache.me;

    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await http.get<MeResponse>("/api/v1/auth/me");
            const me = res.data ?? null;
            cache = { me, at: Date.now() };
            return me;
        } catch {
            // Don't poison cache on error; allow quick retry.
            cache = { me: null, at: 0 };
            return null;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

export async function getRoleCached(): Promise<string | null> {
    const me = await getMeCached();
    const role = me?.role;
    return role ? String(role) : null;
}
