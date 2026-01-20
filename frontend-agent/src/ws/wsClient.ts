export type WsStatus = "disconnected" | "connecting" | "connected";

export type WsInboundEvent =
    | { type: "MSG"; conversation_id?: string; msg: unknown }
    | { type: "SYNC_RES"; conversation_id?: string; messages?: unknown[]; conversation_events?: unknown[] }
    | { type: "MSG_ACK"; msg_id?: string; client_msg_id?: string }
    | { type: "SESSION"; session_id?: string; heartbeat_interval_seconds?: number; heartbeat_ttl_seconds?: number }
    | {
          type: "AGENT_STATUS";
          user_id?: string;
          status?: string;
          effective_status?: string;
          max_concurrent?: number;
          assigned_active?: number;
          remaining_capacity?: number;
          can_accept?: boolean;
      }
    | {
          type: "CONV_EVENT";
          conversation_id?: string;
          event_id?: string;
          event_key?: string;
          created_at?: number;
          data?: unknown;
      }
    | { type: "ERROR"; code?: string; message?: string; rid?: string }
    | { type: "PONG" }
    | { type: string; [k: string]: unknown };

export type WsClientOptions = {
    url: () => string;
    getToken: () => string;
    getSessionId?: () => string;
    client?: string;
    heartbeatMs?: number;
    onStatus?: (s: WsStatus) => void;
    onEvent?: (e: WsInboundEvent) => void;
    onLog?: (line: string) => void;
};

function nowTs() {
    return new Date().toLocaleTimeString();
}

export class WsClient {
    private options: WsClientOptions;
    private ws: WebSocket | null = null;
    private status: WsStatus = "disconnected";

    private shouldReconnect = false;
    private reconnectAttempt = 0;
    private reconnectTimer: number | null = null;

    private heartbeatTimer: number | null = null;

    private subscribedConversationIds: Set<string> = new Set();

    constructor(options: WsClientOptions) {
        this.options = options;
    }

    getStatus() {
        return this.status;
    }

    getSubscribedConversationId() {
        // legacy: return any one id (useful for older callers)
        const it = this.subscribedConversationIds.values().next();
        return it.done ? null : it.value;
    }

    getSubscribedConversationIds() {
        return Array.from(this.subscribedConversationIds);
    }

    connect() {
        if (this.ws) return;
        this.shouldReconnect = true;
        this.setStatus("connecting");

        const url = this.options.url();
        this.log(`ws connecting: ${url}`);

        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
            this.reconnectAttempt = 0;
            this.setStatus("connected");
            this.log("ws open");
            this.startHeartbeat();

            // best-effort auth. server may not ack; we still proceed.
            this.send({
                type: "AUTH",
                token: this.options.getToken(),
                client: this.options.client || "agent",
                session_id: this.options.getSessionId ? this.options.getSessionId() : undefined,
            });

            // best-effort: restore subscriptions after a small delay to allow auth processing
            if (this.subscribedConversationIds.size) {
                window.setTimeout(() => {
                    for (const id of this.subscribedConversationIds) {
                        this.send({ type: "SUB", conversation_id: id });
                    }
                }, 80);
            }
        };

        ws.onmessage = (ev) => {
            this.log(`ws << ${String(ev.data)}`);
            try {
                const data = JSON.parse(String(ev.data)) as WsInboundEvent;
                this.options.onEvent?.(data);
            } catch {
                // ignore
            }
        };

        ws.onclose = () => {
            this.log("ws close");
            this.stopHeartbeat();
            this.ws = null;
            this.setStatus("disconnected");
            this.scheduleReconnect();
        };

        ws.onerror = () => {
            this.log("ws error");
        };
    }

    close() {
        this.shouldReconnect = false;
        this.clearReconnectTimer();
        this.stopHeartbeat();

        try {
            this.ws?.close();
        } catch {
            // ignore
        }

        this.ws = null;
        this.setStatus("disconnected");
    }

    subscribe(conversationId: string) {
        if (!conversationId) return;
        const added = !this.subscribedConversationIds.has(conversationId);
        this.subscribedConversationIds.add(conversationId);
        if (added) {
            this.send({ type: "SUB", conversation_id: conversationId });
        }
    }

    unsubscribe(conversationId: string) {
        if (!conversationId) return;
        const had = this.subscribedConversationIds.delete(conversationId);
        if (had) {
            this.send({ type: "UNSUB", conversation_id: conversationId });
        }
    }

    setSubscriptions(conversationIds: string[]) {
        const next = new Set((conversationIds || []).filter(Boolean));
        const prev = this.subscribedConversationIds;

        // if already connected, push delta now
        if (this.getStatus() === "connected") {
            for (const id of prev) {
                if (!next.has(id)) this.send({ type: "UNSUB", conversation_id: id });
            }
            for (const id of next) {
                if (!prev.has(id)) this.send({ type: "SUB", conversation_id: id });
            }
        }

        this.subscribedConversationIds = next;
    }

    sync(conversationId: string, afterMsgId: string | null) {
        if (!conversationId) return;
        this.send({
            type: "SYNC",
            conversation_id: conversationId,
            after_msg_id: afterMsgId,
        });
    }

    sendText(conversationId: string, text: string) {
        if (!conversationId || !text.trim()) return;
        this.send({
            type: "MSG_SEND",
            conversation_id: conversationId,
            client_msg_id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
            content_type: "text",
            content: { text: text.trim() },
        });
    }

    sendRead(conversationId: string, lastReadMsgId: string) {
        if (!conversationId || !lastReadMsgId) return;
        this.send({
            type: "MSG_READ",
            conversation_id: conversationId,
            last_read_msg_id: lastReadMsgId,
        });
    }

    sendTyping(conversationId: string, isTyping: boolean) {
        if (!conversationId) return;
        this.send({
            type: "TYPING",
            conversation_id: conversationId,
            is_typing: Boolean(isTyping),
        });
    }

    sendFile(conversationId: string, attachmentId: string) {
        if (!conversationId || !attachmentId) return;
        this.send({
            type: "MSG_SEND",
            conversation_id: conversationId,
            client_msg_id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
            content_type: "file",
            content: { attachment_id: attachmentId },
        });
    }

    send(obj: unknown) {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const payload = JSON.stringify(obj);
        ws.send(payload);
        this.log(`ws >> ${payload}`);
    }

    private scheduleReconnect() {
        if (!this.shouldReconnect) return;
        if (this.reconnectTimer) return;

        this.reconnectAttempt += 1;
        const base = 500;
        const max = 10_000;
        const delay = Math.min(max, base * Math.pow(2, Math.min(6, this.reconnectAttempt)));

        this.log(`ws reconnect in ${delay}ms (attempt ${this.reconnectAttempt})`);
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.shouldReconnect) return;
            if (this.ws) return;
            this.connect();
        }, delay);
    }

    private startHeartbeat() {
        const ms = this.options.heartbeatMs ?? 30_000;
        this.stopHeartbeat();
        this.heartbeatTimer = window.setInterval(() => {
            this.send({ type: "PING" });
        }, ms);
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) {
            window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private setStatus(next: WsStatus) {
        this.status = next;
        this.options.onStatus?.(next);
    }

    private log(line: string) {
        this.options.onLog?.(`[${nowTs()}] ${line}`);
    }
}
