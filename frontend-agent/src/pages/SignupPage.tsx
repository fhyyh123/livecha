import { Alert } from "antd";
import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { http, setToken } from "../providers/http";
import { errorMessage } from "../utils/errorMessage";

import "./SignupPage.css";

type RegisterResponse = {
    access_token: string;
    expires_in: number;
    tenant_id: string;
    user_id: string;
    email_verified: boolean;
};

export function SignupPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    const [step, setStep] = useState<"email" | "details">("email");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [passwordTouched, setPasswordTouched] = useState(false);
    const [country, setCountry] = useState("US");
    const [phone, setPhone] = useState("");
    const [phoneTouched, setPhoneTouched] = useState(false);

    const callingCode = useMemo(() => {
        switch (country) {
            case "CN":
                return "86";
            case "SG":
                return "65";
            case "US":
            default:
                return "1";
        }
    }, [country]);

    const phoneDigits = useMemo(() => {
        return phone.replace(/\D/g, "");
    }, [phone]);

    const e164Phone = useMemo(() => {
        if (!phoneDigits) return "";
        return `+${callingCode}${phoneDigits}`;
    }, [callingCode, phoneDigits]);

    const phoneOk = useMemo(() => {
        // Align with backend: ^\+[1-9]\d{7,14}$
        if (!e164Phone) return false;
        return /^\+[1-9]\d{7,14}$/.test(e164Phone);
    }, [e164Phone]);

    const emailOk = useMemo(() => {
        const s = email.trim();
        if (!s) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    }, [email]);

    const passwordChecks = useMemo(() => {
        const hasMin12 = password.length >= 12;
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecial = /[^A-Za-z0-9]/.test(password);
        return { hasMin12, hasUpper, hasNumber, hasSpecial };
    }, [password]);

    const passwordOk = useMemo(() => {
        return (
            passwordChecks.hasMin12 &&
            passwordChecks.hasUpper &&
            passwordChecks.hasNumber &&
            passwordChecks.hasSpecial
        );
    }, [passwordChecks]);

    const canCreate = useMemo(() => {
        if (!emailOk) return false;
        if (!passwordOk) return false;
        if (!phoneOk) return false;
        return true;
    }, [emailOk, passwordOk, phoneOk]);

    function deriveTenantNameFromEmail(raw: string) {
        const s = raw.trim().toLowerCase();
        const at = s.indexOf("@");
        if (at < 0) return "My workspace";
        const domain = s.slice(at + 1);
        const first = domain.split(".").filter(Boolean)[0];
        if (!first) return "My workspace";
        // Capitalize first letter
        return first.charAt(0).toUpperCase() + first.slice(1);
    }

    function GoogleIcon() {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="20" height="20">
                <path
                    fill="#4285F4"
                    fillRule="evenodd"
                    d="M20.64 12.205q-.002-.958-.164-1.841H12v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615"
                    clipRule="evenodd"
                ></path>
                <path
                    fill="#34A853"
                    fillRule="evenodd"
                    d="M12 21c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H3.957v2.332A9 9 0 0 0 12 21"
                    clipRule="evenodd"
                ></path>
                <path
                    fill="#FBBC05"
                    fillRule="evenodd"
                    d="M6.964 13.71A5.4 5.4 0 0 1 6.682 12c0-.593.102-1.17.282-1.71V7.958H3.957A9 9 0 0 0 3 12c0 1.452.348 2.827.957 4.042z"
                    clipRule="evenodd"
                ></path>
                <path
                    fill="#EA4335"
                    fillRule="evenodd"
                    d="M12 6.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C16.462 3.891 14.426 3 12 3a9 9 0 0 0-8.043 4.958l3.007 2.332C7.672 8.163 9.656 6.58 12 6.58"
                    clipRule="evenodd"
                ></path>
            </svg>
        );
    }

    function MicrosoftIcon() {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 25 24" width="20" height="20">
                <path fill="#FEBA08" d="M13.434 12.841h8.409v8.409h-8.409z"></path>
                <path fill="#05A6F0" d="M3.343 12.841h8.409v8.409H3.343z"></path>
                <path fill="#80BC06" d="M13.434 2.75h8.409v8.409h-8.409z"></path>
                <path fill="#F25325" d="M3.343 2.75h8.409v8.409H3.343z"></path>
            </svg>
        );
    }

    function AppleIcon() {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 25 24" width="20" height="20">
                <path
                    fill="currentColor"
                    d="M20.483 7.693c-.114.088-2.127 1.221-2.127 3.74 0 2.914 2.561 3.945 2.638 3.97-.012.063-.407 1.412-1.35 2.786-.842 1.21-1.72 2.417-3.057 2.417s-1.68-.775-3.224-.775c-1.503 0-2.038.8-3.26.8-1.223 0-2.076-1.118-3.057-2.493-1.136-1.614-2.054-4.12-2.054-6.5 0-3.817 2.484-5.841 4.93-5.841 1.299 0 2.382.852 3.198.852.776 0 1.987-.904 3.465-.904.56 0 2.573.052 3.898 1.948m-4.6-3.563c.611-.725 1.044-1.73 1.044-2.735 0-.14-.012-.281-.037-.395-.995.037-2.178.662-2.892 1.488-.56.636-1.083 1.642-1.083 2.66 0 .154.026.307.037.356.063.012.165.025.268.025.892 0 2.015-.596 2.663-1.4"
                ></path>
            </svg>
        );
    }

    function EyeIcon({ open }: { open: boolean }) {
        return open ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path
                    d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                />
                <path
                    d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                />
            </svg>
        ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path
                    d="M3 4.5 21 19.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                />
                <path
                    d="M10.3 9.2A3.2 3.2 0 0 0 14.8 13"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                />
                <path
                    d="M6.5 7.2C4.1 9 2.5 12 2.5 12s3.5 7 9.5 7c2 0 3.8-.6 5.2-1.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                />
                <path
                    d="M9.1 5.5c.9-.3 1.9-.5 2.9-.5 6 0 9.5 7 9.5 7a18 18 0 0 1-3.5 4.7"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                />
            </svg>
        );
    }

    async function createAccount() {
        setLoading(true);
        setError("");
        try {
            const res = await http.post<RegisterResponse>("/api/v1/auth/register", {
                tenant_name: deriveTenantNameFromEmail(email),
                email: email.trim(),
                phone: e164Phone,
                password,
            });
            const data = res.data;
            if (!data?.access_token) throw new Error("missing access_token");
            setToken(data.access_token);
            navigate("/verify-email-code", { state: { email: email.trim() } });
        } catch (e: unknown) {
            setError(errorMessage(e, "register_failed"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="lcSignup">
            <div className="lcSignupTopbar">
                <div className="lcBrandStack" aria-label={t("login.brandAria")}>
                    <img className="lcBrandLogo" src="/LiveChat.png" alt="LiveCha" />
                </div>

                <Link to="/login" className="lcTopbarAction">
                    {t("signup.logIn")}
                </Link>
            </div>

            <div className="lcSignupMain">
                <div className="lcPanel">
                    <h1 className="lcTitle">{t("signup.getStarted")}</h1>
                    <p className="lcSubtitle">{t("signup.noCreditCard")}</p>

                    {error ? <Alert type="error" message={error} showIcon style={{ marginTop: 14 }} /> : null}

                    {step === "email" ? (
                        <>
                            <div className="lcProviders">
                                <button type="button" className="lcProviderBtn" onClick={() => void 0}>
                                    <span className="lcProviderIcon" aria-hidden>
                                        <GoogleIcon />
                                    </span>
                                    {t("signup.google")}
                                </button>
                                <button type="button" className="lcProviderBtn" onClick={() => void 0}>
                                    <span className="lcProviderIcon" aria-hidden>
                                        <MicrosoftIcon />
                                    </span>
                                    {t("signup.microsoft")}
                                </button>
                                <button type="button" className="lcProviderBtn" onClick={() => void 0}>
                                    <span className="lcProviderIcon" aria-hidden style={{ color: "#111827" }}>
                                        <AppleIcon />
                                    </span>
                                    {t("signup.apple")}
                                </button>
                            </div>

                            <div className="lcSeparator">{t("signup.or")}</div>

                            <form
                                className="lcForm"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    setError("");
                                    if (!emailOk) {
                                        setError("invalid_email");
                                        return;
                                    }
                                    setStep("details");
                                }}
                            >
                                <div>
                                    <div className="lcFieldLabelRow">
                                        <div className="lcLabel">{t("signup.businessEmail")}</div>
                                    </div>
                                    <input
                                        className="lcInput"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        inputMode="email"
                                        placeholder={t("signup.emailPlaceholder")}
                                    />
                                </div>

                                <button className="lcPrimaryRed" type="submit" disabled={loading}>
                                    {t("signup.signUpWithEmail")}
                                </button>
                            </form>
                        </>
                    ) : (
                        <form
                            className="lcForm"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!canCreate || loading) return;
                                void createAccount();
                            }}
                        >
                            <div>
                                <div className="lcFieldLabelRow">
                                    <div className="lcLabel">{t("signup.businessEmail")}</div>
                                </div>
                                <input className="lcInput" value={email} disabled />
                            </div>

                            <div>
                                <div className="lcFieldLabelRow">
                                    <div className="lcLabel">{t("signup.password")}</div>
                                </div>
                                <div className="lcPasswordWrap">
                                    <input
                                        className="lcInput"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            if (!passwordTouched) setPasswordTouched(true);
                                        }}
                                        onBlur={() => setPasswordTouched(true)}
                                        autoComplete="new-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder={t("signup.passwordPlaceholder")}
                                    />
                                    <button
                                        className="lcPasswordToggle"
                                        type="button"
                                        aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                                        onClick={() => setShowPassword((v) => !v)}
                                    >
                                        <EyeIcon open={showPassword} />
                                    </button>
                                </div>
                                <ul className="lcReqList">
                                    <li className="lcReqItem">
                                        <span className={`lcReqDot ${passwordChecks.hasMin12 ? "lcReqDotOk" : ""}`} />
                                        {t("signup.reqMin12")}
                                    </li>
                                    <li className="lcReqItem">
                                        <span className={`lcReqDot ${passwordChecks.hasUpper ? "lcReqDotOk" : ""}`} />
                                        {t("signup.reqUpper")}
                                    </li>
                                    <li className="lcReqItem">
                                        <span className={`lcReqDot ${passwordChecks.hasNumber ? "lcReqDotOk" : ""}`} />
                                        {t("signup.reqNumber")}
                                    </li>
                                    <li className="lcReqItem">
                                        <span className={`lcReqDot ${passwordChecks.hasSpecial ? "lcReqDotOk" : ""}`} />
                                        {t("signup.reqSpecial")}
                                    </li>
                                </ul>
                                {passwordTouched && password.length > 0 && !passwordOk ? (
                                    <div className="lcFieldError">{t("signup.passwordInvalid")}</div>
                                ) : null}
                            </div>

                            <div>
                                <div className="lcFieldLabelRow">
                                    <div className="lcLabel">{t("signup.mobilePhone")}</div>
                                </div>
                                <div className="lcPhoneRow">
                                    <select
                                        className="lcSelect"
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value)}
                                        aria-label={t("signup.country")}
                                    >
                                        <option value="US">🇺🇸 +1</option>
                                        <option value="CN">🇨🇳 +86</option>
                                        <option value="SG">🇸🇬 +65</option>
                                    </select>
                                    <input
                                        className="lcInput"
                                        value={phone}
                                        onChange={(e) => {
                                            setPhone(e.target.value);
                                            if (!phoneTouched) setPhoneTouched(true);
                                        }}
                                        onBlur={() => setPhoneTouched(true)}
                                        placeholder={t("signup.phonePlaceholder")}
                                        inputMode="tel"
                                    />
                                </div>
                                {phoneTouched && phoneDigits.length === 0 ? (
                                    <div className="lcFieldError">{t("signup.phoneRequired")}</div>
                                ) : null}
                                {phoneTouched && phoneDigits.length > 0 && !phoneOk ? (
                                    <div className="lcFieldError">{t("signup.phoneInvalid")}</div>
                                ) : null}
                            </div>

                            <button className="lcPrimaryRed" type="submit" disabled={!canCreate || loading}>
                                {loading ? t("signup.creating") : t("signup.createAccount")}
                            </button>
                        </form>
                    )}

                    <div className="lcMutedRow">
                        {t("signup.alreadyHave")} <Link className="lcLink" to="/login">{t("signup.logIn")}</Link>
                    </div>

                    <div className="lcTerms">
                        {t("signup.termsPrefix")} <a className="lcLink" href="#" onClick={(e) => e.preventDefault()}>{t("signup.terms")}</a> {t("signup.and")} {" "}
                        <a className="lcLink" href="#" onClick={(e) => e.preventDefault()}>{t("signup.privacy")}</a>
                    </div>
                </div>
            </div>

            <div className="lcFooter">{t("login.poweredBy")}</div>
        </div>
    );
}
