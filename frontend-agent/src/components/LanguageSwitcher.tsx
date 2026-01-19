import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import i18n, { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";

function GlobeIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
        >
            <path
                d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
                stroke="currentColor"
                strokeWidth="1.7"
            />
            <path
                d="M3 12h18"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
            />
            <path
                d="M12 3c2.6 2.4 4.2 5.6 4.2 9S14.6 18.6 12 21c-2.6-2.4-4.2-5.6-4.2-9S9.4 5.4 12 3Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function LanguageSwitcher() {
    const { t } = useTranslation();
    const location = useLocation();

    // Avoid covering the embed widget UI.
    const hidden = location.pathname.startsWith("/visitor/embed");

    const value = (i18n.resolvedLanguage || i18n.language || "en") as SupportedLanguage;

    const items: MenuProps["items"] = useMemo(
        () => [
            { key: "en", label: t("common.english") },
            { key: "zh-CN", label: t("common.chinese") },
        ],
        [t],
    );

    if (hidden) return null;

    const currentLabel = value === "zh-CN" ? t("common.chinese") : t("common.english");

    const menu: MenuProps = {
        items,
        selectable: true,
        selectedKeys: [SUPPORTED_LANGUAGES.includes(value) ? value : "en"],
        onClick: ({ key }) => void i18n.changeLanguage(key as SupportedLanguage),
    };

    return (
        <div
            style={{
                position: "fixed",
                right: 14,
                bottom: 14,
                zIndex: 9999,
            }}
        >
            <Dropdown trigger={["click"]} placement="topRight" menu={menu}>
                <Tooltip title={`${t("common.language")}: ${currentLabel}`} placement="left">
                    <button
                        type="button"
                        aria-label={t("common.language")}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 999,
                            border: "1px solid rgba(2,6,23,.12)",
                            background: "rgba(255,255,255,.92)",
                            color: "rgba(17,24,39,.9)",
                            boxShadow: "0 10px 30px rgba(2,6,23,.10)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            backdropFilter: "blur(8px)",
                        }}
                    >
                        <GlobeIcon />
                    </button>
                </Tooltip>
            </Dropdown>
        </div>
    );
}
