import { Button, Space } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WelcomeLayout } from "./WelcomeLayout";
import { setWelcomeIntegrations } from "./welcomeApi";
import { useWelcomeStatus } from "./useWelcomeStatus";
import { useWelcomeGuard } from "./useWelcomeGuard";
import { errorMessage } from "./errorMessage";

type OptionKey = "messenger" | "whatsapp" | "sms" | "telegram";

const OPTIONS: Array<{ key: OptionKey; labelKey: string }> = [
  { key: "messenger", labelKey: "welcome.integrations.options.messenger" },
  { key: "whatsapp", labelKey: "welcome.integrations.options.whatsapp" },
  { key: "sms", labelKey: "welcome.integrations.options.sms" },
  { key: "telegram", labelKey: "welcome.integrations.options.telegram" },
];

export function WelcomeIntegrationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, loading: statusLoading } = useWelcomeStatus();
  useWelcomeGuard(status, statusLoading);

  const [selected, setSelected] = useState<OptionKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const initial = useMemo(() => {
    const raw = status?.integrations || [];
    const allowed = new Set<OptionKey>(OPTIONS.map((x) => x.key));
    return raw.filter((x): x is OptionKey => typeof x === "string" && allowed.has(x as OptionKey));
  }, [status?.integrations]);

  const value = selected.length ? selected : initial;

  async function next(skip?: boolean) {
    setLoading(true);
    setError("");
    try {
      const toSave: OptionKey[] = skip ? [] : value;
      await setWelcomeIntegrations(toSave);
      navigate("/welcome/company-size");
    } catch (e: unknown) {
      setError(errorMessage(e, "save_failed"));
    } finally {
      setLoading(false);
    }
  }

  const canContinue = useMemo(() => !loading, [loading]);

  return (
    <WelcomeLayout
      step={4}
      title={t("welcome.integrations.title")}
      subtitle={t("welcome.integrations.subtitle")}
      error={error}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {OPTIONS.map((opt) => {
            const checked = value.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  const nextVal = checked ? value.filter((x) => x !== opt.key) : [...value, opt.key];
                  setSelected(nextVal);
                }}
                style={{
                  border: "2px solid " + (checked ? "#111827" : "#e5e7eb"),
                  borderRadius: 14,
                  padding: "14px 14px",
                  background: "#fff",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, color: "#111827" }}>{t(opt.labelKey)}</div>
              </button>
            );
          })}
        </div>

        <Button className="lcWelcomePrimary" type="primary" onClick={() => void next(false)} disabled={!canContinue} loading={loading}>
          {t("welcome.continue")}
        </Button>

        <div className="lcWelcomeLinkRow">
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => navigate("/welcome/installation")} disabled={loading}>
            {t("welcome.back")}
          </button>
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => void next(true)} disabled={loading}>
            {t("welcome.skip")}
          </button>
        </div>
      </Space>
    </WelcomeLayout>
  );
}
