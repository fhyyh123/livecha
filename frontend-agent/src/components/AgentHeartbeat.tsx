import { useEffect, useRef } from "react";
import { useIsAuthenticated } from "@refinedev/core";

import { http } from "../providers/http";
import { useChatStore } from "../store/chatStore";

const SESSION_STORAGE_KEY = "chatlive.agent.session_id" as const;
const HEARTBEAT_INTERVAL_KEY = "chatlive.agent.heartbeat_interval" as const;

export function AgentHeartbeat() {
    const { data, isLoading } = useIsAuthenticated();
    const authenticated = Boolean(data?.authenticated);
    const wsStatus = useChatStore((s) => s.wsStatus);

    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (isLoading) return;

        function clearTimer() {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        if (!authenticated) {
            clearTimer();
            return;
        }

        // If WS is connected, rely on WS ping/pong to refresh lease.
        if (wsStatus === "connected") {
            clearTimer();
            return;
        }

        let cancelled = false;

        async function ensureSession() {
            const existing = localStorage.getItem(SESSION_STORAGE_KEY) || "";
            if (existing) return existing;
            try {
                const res = await http.post<{ session_id: string; heartbeat_interval_seconds: number; heartbeat_ttl_seconds: number }>(
                    "/api/v1/agent/session",
                );
                const id = String(res.data?.session_id || "");
                if (id) {
                    localStorage.setItem(SESSION_STORAGE_KEY, id);
                    localStorage.setItem(
                        HEARTBEAT_INTERVAL_KEY,
                        String(Number(res.data?.heartbeat_interval_seconds || 10) || 10),
                    );
                }
                return id;
            } catch {
                return "";
            }
        }

        const start = async () => {
            const sessionId = await ensureSession();
            if (!sessionId || cancelled) {
                clearTimer();
                return;
            }

            const intervalSec = Math.max(5, Number(localStorage.getItem(HEARTBEAT_INTERVAL_KEY) || 10) || 10);

            const ping = async () => {
                try {
                    await http.post("/api/v1/agent/heartbeat", { session_id: sessionId });
                } catch {
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                    const newId = await ensureSession();
                    if (!newId) return;
                    await http.post("/api/v1/agent/heartbeat", { session_id: newId }).catch(() => {
                        // best-effort
                    });
                }
            };

            await ping();
            clearTimer();
            timerRef.current = window.setInterval(ping, intervalSec * 1000);
        };

        start();

        return () => {
            cancelled = true;
            clearTimer();
        };
    }, [authenticated, isLoading, wsStatus]);

    return null;
}
