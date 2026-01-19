import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enTranslation from "./locales/en/translation.json";
import zhCNTranslation from "./locales/zh-CN/translation.json";

export const I18N_LANGUAGE_STORAGE_KEY = "chatlive:lang";

export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const resources = {
    en: { translation: enTranslation },
    "zh-CN": { translation: zhCNTranslation },
} as const;

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: "en",
        supportedLngs: [...SUPPORTED_LANGUAGES],
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["localStorage", "navigator"],
            lookupLocalStorage: I18N_LANGUAGE_STORAGE_KEY,
            caches: ["localStorage"],
        },
        react: {
            useSuspense: false,
        },
    });

export default i18n;
