export type CrossTabEvent =
    | {
          type: "CONV_READ";
          id: string;
          at: number;
          conversationId: string;
          lastReadMsgId: string;
      };

const BC_NAME = "chatlive-agent";
const STORAGE_KEY = "chatlive.agent.x-tab-event";

function safeRandomId() {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeNow() {
    return Date.now();
}

function tryPostBroadcastChannel(evt: CrossTabEvent) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (typeof globalThis.BroadcastChannel !== "function") return;
        const bc = new BroadcastChannel(BC_NAME);
        bc.postMessage(evt);
        bc.close();
    } catch {
        // ignore
    }
}

function tryPostLocalStorage(evt: CrossTabEvent) {
    try {
        // Storage events only fire on other tabs.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(evt));
    } catch {
        // ignore
    }
}

export function broadcastConversationRead(conversationId: string, lastReadMsgId: string) {
    if (!conversationId || !lastReadMsgId) return;
    const evt: CrossTabEvent = {
        type: "CONV_READ",
        id: safeRandomId(),
        at: safeNow(),
        conversationId,
        lastReadMsgId,
    };

    tryPostBroadcastChannel(evt);
    tryPostLocalStorage(evt);
}

function parseEvent(raw: unknown): CrossTabEvent | null {
    if (!raw) return null;
    if (typeof raw === "string") {
        try {
            raw = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    if (obj.type !== "CONV_READ") return null;
    const conversationId = String(obj.conversationId ?? "");
    const lastReadMsgId = String(obj.lastReadMsgId ?? "");
    const id = String(obj.id ?? "");
    const at = Number(obj.at ?? 0);
    if (!conversationId || !lastReadMsgId || !id || !Number.isFinite(at) || at <= 0) return null;
    return { type: "CONV_READ", id, at, conversationId, lastReadMsgId };
}

export function subscribeCrossTabEvents(onEvent: (evt: CrossTabEvent) => void) {
    const seen = new Set<string>();

    function handle(evt: CrossTabEvent | null) {
        if (!evt) return;
        if (seen.has(evt.id)) return;
        seen.add(evt.id);
        // basic bound: prevent unbounded growth
        if (seen.size > 5000) {
            const first = seen.values().next().value;
            if (first) seen.delete(first);
        }
        onEvent(evt);
    }

    // BroadcastChannel
    try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (typeof globalThis.BroadcastChannel === "function") {
            const bc = new BroadcastChannel(BC_NAME);
            bc.onmessage = (e) => handle(parseEvent(e.data));
            // Return unsubscribe that closes bc.
            return () => {
                try {
                    bc.close();
                } catch {
                    // ignore
                }
            };
        }
    } catch {
        // ignore
    }

    // localStorage fallback
    function onStorage(e: StorageEvent) {
        if (e.key !== STORAGE_KEY) return;
        handle(parseEvent(e.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
