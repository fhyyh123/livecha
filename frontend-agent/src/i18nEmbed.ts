import i18next from "i18next";
import type { i18n as I18nInstance } from "i18next";

import enTranslation from "./locales/en/translation.json";
import zhCNTranslation from "./locales/zh-CN/translation.json";

export const SUPPORTED_WIDGET_LANGUAGES = ["en", "zh-CN"] as const;
export type SupportedWidgetLanguage = (typeof SUPPORTED_WIDGET_LANGUAGES)[number];

const resources = {
    en: { translation: enTranslation },
    "zh-CN": { translation: zhCNTranslation },
} as const;

// A dedicated i18n instance for the visitor embed widget.
// It must NOT persist to localStorage, otherwise it would leak into the agent/admin app language.
export const embedI18n = i18next.createInstance();

void embedI18n.init({
    resources,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_WIDGET_LANGUAGES],
    interpolation: {
        escapeValue: false,
    },
});

export function normalizeWidgetLanguage(v: unknown): SupportedWidgetLanguage {
    const s = String(v ?? "").trim();
    if (!s) return "en";
    if (s.toLowerCase() === "en") return "en";
    if (s.toLowerCase() === "zh-cn" || s === "zh-CN") return "zh-CN";
    return "en";
}

// Applies per-site overrides returned by the backend.
//
// Notes:
// - We support "short" keys in widget_phrases_json (e.g. header_title) for convenience.
// - We also support direct i18n keys (e.g. visitorEmbed.minimize) for future extensibility.
// - This intentionally only mutates the embed i18n instance, so it won't leak into the agent/admin app.
export function applyWidgetPhrasesToEmbedI18n(
    i18n: I18nInstance,
    lang: SupportedWidgetLanguage,
    phrases: Record<string, string>,
) {
    const shortKeyToI18nKey: Record<string, string> = {
        // Legacy keys
        header_title: "visitorEmbed.headerTitle",
        message_placeholder: "visitorEmbed.composer.placeholder",

        // Actions / buttons
        minimize: "visitorEmbed.minimize",
        minimize_aria: "visitorEmbed.minimizeAria",
        back_aria: "visitorEmbed.backAria",
        retry: "visitorEmbed.retry",
        start_conversation: "visitorEmbed.startConversation",

        // Identity modal
        leave_contact_title: "visitorEmbed.leaveContactTitle",
        leave_contact_ok: "visitorEmbed.leaveContactOk",
        leave_contact_cancel: "visitorEmbed.leaveContactCancel",
        leave_contact_hint: "visitorEmbed.leaveContactHint",
        identity_error: "visitorEmbed.identityError",
        name_optional: "visitorEmbed.nameOptional",
        email_optional: "visitorEmbed.emailOptional",

        // Pre-chat
        prechat_default_info: "visitorEmbed.preChat.defaultInfo",
        prechat_name_label: "visitorEmbed.preChat.nameLabel",
        prechat_email_label: "visitorEmbed.preChat.emailLabel",
        prechat_required_error: "visitorEmbed.preChat.requiredError",
        prechat_at_least_one_error: "visitorEmbed.preChat.atLeastOneError",

        // Conversation
        no_messages: "visitorEmbed.noMessages",
        unread: "visitorEmbed.unread",
        typing: "visitorEmbed.typing",

        // Attachments
        attach_add_file: "visitorEmbed.attach.addFile",
        attach_add: "visitorEmbed.attach.add",
        attach_upload_file: "visitorEmbed.attach.uploadFile",
        attach_send_screenshot: "visitorEmbed.attach.sendScreenshot",
        attach_emoji: "visitorEmbed.attach.emoji",

        // Composer
        composer_send: "visitorEmbed.composer.send",
        composer_enter_content_hint: "visitorEmbed.composer.enterContentHint",
    };

    for (const [shortKey, i18nKey] of Object.entries(shortKeyToI18nKey)) {
        const v = String(phrases?.[shortKey] ?? "").trim();
        if (!v) continue;
        i18n.addResource(lang, "translation", i18nKey, v, { silent: true });
    }

    // Direct overrides (advanced): allow sending translation keys directly.
    // Example: { "visitorEmbed.retry": "Try again" }
    for (const [k, raw] of Object.entries(phrases || {})) {
        const v = String(raw ?? "").trim();
        if (!v) continue;
        if (!k.startsWith("visitorEmbed.")) continue;
        i18n.addResource(lang, "translation", k, v, { silent: true });
    }
}
