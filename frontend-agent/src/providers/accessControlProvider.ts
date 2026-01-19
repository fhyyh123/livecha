import type { AccessControlProvider } from "@refinedev/core";

import { http, getToken } from "./http";

type MeResponse = { role?: string | null };

let cachedRole: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10_000;

async function getRole(): Promise<string | null> {
    const now = Date.now();
    if (cachedRole && (now - cachedAt) < CACHE_TTL_MS) return cachedRole;
    // If there's no token available, don't attempt to fetch and don't cache the
    // negative result. This avoids a race where unauthenticated requests are
    // made before login completes and then that "null" result is cached,
    // preventing a fresh role fetch for the short TTL and causing menus to
    // remain hidden until a manual refresh.
    if (!getToken()) {
        return null;
    }
    try {
        const res = await http.get<MeResponse>("/api/v1/auth/me");
        const role = (res.data?.role ? String(res.data.role) : null) || null;
        cachedRole = role;
        cachedAt = now;
        return role;
    } catch {
        // On failure, don't set the cache timestamp so callers can retry
        // immediately (or shortly after). This prevents a failed early
        // lookup from poisoning the cache for `CACHE_TTL_MS`.
        cachedRole = null;
        cachedAt = 0;
        return null;
    }
}

export const accessControlProvider: AccessControlProvider = {
    can: async ({ resource }) => {
        // If not logged in, keep default behavior (auth guard will redirect).
        const role = await getRole();

        // Admin-only areas.
        if (resource === "sites" || resource === "invites") {
            return { can: role === "admin" };
        }

        // Agent console areas.
        if (resource === "conversations" || resource === "archives" || resource === "team" || resource === "profile") {
            return { can: role === "admin" || role === "agent" };
        }

        // Default allow.
        return { can: true };
    },
};
