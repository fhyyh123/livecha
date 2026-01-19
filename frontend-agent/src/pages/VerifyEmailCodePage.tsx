import { Alert } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { getToken, http } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

import "./VerifyEmailCodePage.css";

type VerifyEmailResponse = {
    verified: boolean;
};

function readEmailFromLocationState(state: unknown): string | undefined {
    if (!state || typeof state !== "object") return undefined;
    const maybe = state as { email?: unknown };
    return typeof maybe.email === "string" ? maybe.email : undefined;
}

function maskEmail(email: string) {
    const s = (email || "").trim();
    const at = s.indexOf("@");
    if (at <= 1) return s;
    const name = s.slice(0, at);
    const domain = s.slice(at);
    return name[0] + "***" + name[name.length - 1] + domain;
}

export function VerifyEmailCodePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const stateEmail = readEmailFromLocationState(location.state);
    const queryCode = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return (params.get("code") || "").replace(/\D/g, "").slice(0, 6);
    }, [location.search]);

    const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [ok, setOk] = useState(false);

    const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

    const code = useMemo(() => digits.join(""), [digits]);
    const hasToken = useMemo(() => !!getToken(), []);
    const canSubmit = useMemo(() => /^\d{6}$/.test(code) && !loading, [code, loading]);

    useEffect(() => {
        if (!queryCode || queryCode.length !== 6) return;
        setDigits(queryCode.split(""));
        // Auto-verify in dev mode when backend returns dev_verify_url?code=xxxxxx
        void verify(queryCode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryCode]);

    function setDigitAt(index: number, value: string) {
        const next = digits.slice();
        next[index] = value;
        setDigits(next);
    }

    function focusIndex(index: number) {
        const el = inputRefs.current[index];
        if (el) el.focus();
    }

    async function verify(overrideCode?: string) {
        const finalCode = overrideCode ?? code;
        if (!/^\d{6}$/.test(finalCode)) return;
        setLoading(true);
        setError("");
        try {
            const res = await http.post<VerifyEmailResponse>("/api/v1/auth/verify-email-code", {
                code: finalCode,
            });
            if (res.data?.verified) {
                setOk(true);
                navigate("/", { replace: true });
            } else {
                setOk(false);
            }
        } catch (e: unknown) {
            setError(errorMessage(e, "verify_failed"));
        } finally {
            setLoading(false);
        }
    }

    async function resend() {
        setLoading(true);
        setError("");
        try {
            await http.post("/api/v1/auth/resend-verification");
        } catch (e: unknown) {
            setError(errorMessage(e, "resend_failed"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="lcVerify">
            <div className="lcVerifyTopbar">
                <div className="lcBrandStack" aria-label={t("login.brandAria")}
                >
                    <img className="lcBrandLogo" src="/LiveChat.png" alt="LiveCha" />
                </div>

                <Link to="/login" className="lcTopbarAction">
                    {t("common.backToLogin")}
                </Link>
            </div>

            <div className="lcVerifyMain">
                <div className="lcVerifyPanel">
                    <div className="lcVerifyIcon" aria-hidden>
                        <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
                            <path
                                d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11Z"
                                stroke="currentColor"
                                strokeWidth="1.7"
                            />
                            <path
                                d="M6.5 7.5 12 11.5l5.5-4"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>

                    <h1 className="lcTitle">{t("verifyEmailCode.title")}</h1>
                    <p className="lcSubtitle">
                        {stateEmail
                            ? t("verifyEmailCode.subtitleWithEmail", { email: maskEmail(stateEmail) })
                            : t("verifyEmailCode.subtitle")}
                    </p>

                    {!hasToken ? (
                        <Alert
                            type="warning"
                            showIcon
                            message={t("verifyEmailCode.missingAuth")}
                            style={{ marginTop: 14 }}
                        />
                    ) : null}
                    {error ? (
                        <Alert type="error" showIcon message={error} style={{ marginTop: 14 }} />
                    ) : null}
                    {ok ? (
                        <Alert type="success" showIcon message={t("verifyEmailCode.verified")}
                               style={{ marginTop: 14 }} />
                    ) : null}

                    <div className="lcCodeRow" aria-label={t("verifyEmailCode.codeAria")}
                        style={{ marginTop: 18 }}
                    >
                        {digits.map((d, i) => (
                            <input
                                key={i}
                                ref={(el) => {
                                    inputRefs.current[i] = el;
                                }}
                                className="lcCodeBox"
                                inputMode="numeric"
                                autoComplete={i === 0 ? "one-time-code" : "off"}
                                value={d}
                                onChange={(e) => {
                                    const v = (e.target.value || "").replace(/\D/g, "").slice(-1);
                                    setDigitAt(i, v);
                                    if (v && i < 5) focusIndex(i + 1);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Backspace" && !digits[i] && i > 0) {
                                        focusIndex(i - 1);
                                    }
                                    if (e.key === "ArrowLeft" && i > 0) focusIndex(i - 1);
                                    if (e.key === "ArrowRight" && i < 5) focusIndex(i + 1);
                                }}
                                onPaste={(e) => {
                                    const pasted = (e.clipboardData.getData("text") || "")
                                        .replace(/\D/g, "")
                                        .slice(0, 6);
                                    if (pasted.length === 6) {
                                        e.preventDefault();
                                        setDigits(pasted.split(""));
                                        void verify(pasted);
                                    }
                                }}
                            />
                        ))}
                    </div>

                    <button
                        className="lcPrimary"
                        type="button"
                        disabled={!canSubmit || !hasToken}
                        onClick={() => void verify()}
                        style={{ marginTop: 18 }}
                    >
                        {loading ? t("verifyEmailCode.verifying") : t("verifyEmailCode.verify")}
                    </button>

                    <div className="lcVerifyLinks">
                        <button
                            type="button"
                            className="lcLinkBtn"
                            disabled={loading || !hasToken}
                            onClick={() => void resend()}
                        >
                            {t("verifyEmailCode.resend")}
                        </button>
                        <span className="lcDot">·</span>
                        <a
                            className="lcLink"
                            href="https://mail.google.com/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t("verifyEmailCode.openInbox")}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
