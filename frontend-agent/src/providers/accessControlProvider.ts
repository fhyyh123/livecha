import type { AccessControlProvider } from "@refinedev/core";

import { getRoleCached } from "./meCache";

export const accessControlProvider: AccessControlProvider = {
    can: async ({ resource }) => {
        // If not logged in, keep default behavior (auth guard will redirect).
        const role = await getRoleCached();

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
