import { useEffect, useRef } from "react";
import { useIsAuthenticated } from "@refinedev/core";

import { useChatStore } from "../store/chatStore";

export function WsAutoConnect() {
    const { data, isLoading } = useIsAuthenticated();
    const authenticated = Boolean(data?.authenticated);

    const connectWs = useChatStore((s) => s.connectWs);
    const disconnectWs = useChatStore((s) => s.disconnectWs);
    const bootstrapInboxSubscriptions = useChatStore((s) => s.bootstrapInboxSubscriptions);

    const didBootstrapInboxRef = useRef(false);

    useEffect(() => {
        if (isLoading) return;
        if (authenticated) {
            connectWs();

            // Bootstrap inbox list once per auth session so WS can subscribe for notifications
            // even if the user never opens the workbench.
            if (!didBootstrapInboxRef.current) {
                didBootstrapInboxRef.current = true;
                bootstrapInboxSubscriptions().catch(() => {
                    // best-effort; keep WS connected even if inbox bootstrap fails
                });
            }
        } else {
            disconnectWs();
            didBootstrapInboxRef.current = false;
        }
    }, [
        authenticated,
        isLoading,
        connectWs,
        disconnectWs,
        bootstrapInboxSubscriptions,
    ]);

    return null;
}
