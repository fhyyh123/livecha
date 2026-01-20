import { useEffect, useRef } from "react";
import { useIsAuthenticated } from "@refinedev/core";

import { http } from "../providers/http";
import { useChatStore } from "../store/chatStore";

const SESSION_STORAGE_KEY = "chatlive.agent.session_id" as const;
const HEARTBEAT_INTERVAL_KEY = "chatlive.agent.heartbeat_interval" as const;
const HEARTBEAT_TTL_KEY = "chatlive.agent.heartbeat_ttl" as const;

export function WsAutoConnect() {
    const { data, isLoading } = useIsAuthenticated();
    const authenticated = Boolean(data?.authenticated);

    const connectWs = useChatStore((s) => s.connectWs);
    const disconnectWs = useChatStore((s) => s.disconnectWs);
    const bootstrapInboxSubscriptions = useChatStore((s) => s.bootstrapInboxSubscriptions);

    const didBootstrapInboxRef = useRef(false);

    useEffect(() => {
        if (isLoading) return;
        let cancelled = false;

        const ensureAgentSession = async () => {
            try {
                const existing = localStorage.getItem(SESSION_STORAGE_KEY) || "";
                if (existing) return;

                const res = await http.post<{
                    session_id: string;
                    heartbeat_interval_seconds: number;
                    heartbeat_ttl_seconds: number;
                }>("/api/v1/agent/session");
                const id = String(res.data?.session_id || "");
                if (!id) return;

                localStorage.setItem(SESSION_STORAGE_KEY, id);
                localStorage.setItem(
                    HEARTBEAT_INTERVAL_KEY,
                    String(Number(res.data?.heartbeat_interval_seconds || 10) || 10),
                );
                localStorage.setItem(
                    HEARTBEAT_TTL_KEY,
                    String(Number(res.data?.heartbeat_ttl_seconds || 35) || 35),
                );
            } catch {
                // best-effort
            }
        };

        const run = async () => {
            if (!authenticated) {
                disconnectWs();
                didBootstrapInboxRef.current = false;
                return;
            }

            await ensureAgentSession();
            if (cancelled) return;

            connectWs();

            // Bootstrap inbox list once per auth session so WS can subscribe for notifications
            // even if the user never opens the workbench.
            if (!didBootstrapInboxRef.current) {
                didBootstrapInboxRef.current = true;
                bootstrapInboxSubscriptions().catch(() => {
                    // best-effort; keep WS connected even if inbox bootstrap fails
                });
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [authenticated, isLoading, connectWs, disconnectWs, bootstrapInboxSubscriptions]);

    return null;
}
