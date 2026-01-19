import { Button, Space } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WelcomeLayout } from "./WelcomeLayout";
import { setWelcomeCompanySize } from "./welcomeApi";
import { useWelcomeStatus } from "./useWelcomeStatus";
import { useWelcomeGuard } from "./useWelcomeGuard";
import { errorMessage } from "./errorMessage";

const OPTIONS = ["2-9", "10-49", "50-99", "100-499", "500-999", "1000+", "just-me"] as const;

type CompanySize = (typeof OPTIONS)[number];

export function WelcomeCompanySizePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, loading: statusLoading } = useWelcomeStatus();
  useWelcomeGuard(status, statusLoading);

  const [selected, setSelected] = useState<CompanySize | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const initial = useMemo(() => {
    const v = (status?.company_size || "").toString();
    return (OPTIONS as readonly string[]).includes(v) ? (v as CompanySize) : "";
  }, [status?.company_size]);

  const value = selected || initial;
  const canContinue = useMemo(() => !!value && !loading, [value, loading]);

  async function next() {
    if (!value) return;
    setLoading(true);
    setError("");
    try {
      await setWelcomeCompanySize(value);
      navigate("/welcome/team");
    } catch (e: unknown) {
      setError(errorMessage(e, "save_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WelcomeLayout
      step={5}
      title={t("welcome.companySize.title")}
      subtitle={t("welcome.companySize.subtitle")}
      error={error}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {OPTIONS.map((opt) => {
            const checked = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSelected(opt)}
                style={{
                  border: "2px solid " + (checked ? "#111827" : "#e5e7eb"),
                  borderRadius: 14,
                  padding: "12px 12px",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                {opt === "just-me" ? t("welcome.companySize.justMe") : opt}
              </button>
            );
          })}
        </div>

        <Button className="lcWelcomePrimary" type="primary" onClick={() => void next()} disabled={!canContinue} loading={loading}>
          {t("welcome.continue")}
        </Button>

        <div className="lcWelcomeLinkRow">
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => navigate("/welcome/integrations")} disabled={loading}>
            {t("welcome.back")}
          </button>
        </div>
      </Space>
    </WelcomeLayout>
  );
}
