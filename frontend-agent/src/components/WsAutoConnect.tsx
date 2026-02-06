import { useEffect, useRef, useState } from "react";
import { useIsAuthenticated } from "@refinedev/core";

import { AUTH_CHANGED_EVENT, getCurrentUserId, http } from "../providers/http";
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
    const prevUserIdRef = useRef<string>(getCurrentUserId());
    const [authSeq, setAuthSeq] = useState(0);

    useEffect(() => {
        const onAuthChanged = () => {
            // Force WS reconnect so server binds new token claims.
            disconnectWs();
            didBootstrapInboxRef.current = false;

            // If the logged-in user changed (e.g. user registers a new tenant
            // while an old token/session is still present), clear the agent
            // presence session so we don't keep using a stale session_id.
            const nextUserId = getCurrentUserId();
            if (nextUserId !== prevUserIdRef.current) {
                prevUserIdRef.current = nextUserId;
                try {
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                    localStorage.removeItem(HEARTBEAT_INTERVAL_KEY);
                    localStorage.removeItem(HEARTBEAT_TTL_KEY);
                } catch {
                    // ignore
                }
            }

            setAuthSeq((x) => x + 1);
        };

        try {
            globalThis.window?.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
        } catch {
            // ignore
        }

        return () => {
            try {
                globalThis.window?.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
            } catch {
                // ignore
            }
        };
    }, [disconnectWs]);

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
    }, [authenticated, isLoading, authSeq, connectWs, disconnectWs, bootstrapInboxSubscriptions]);

    return null;
}
