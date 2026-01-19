import { Button, Input, Space } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WelcomeLayout } from "./WelcomeLayout";
import { setWelcomeName } from "./welcomeApi";
import { useWelcomeStatus } from "./useWelcomeStatus";
import { useWelcomeGuard } from "./useWelcomeGuard";
import { errorMessage } from "./errorMessage";

export function WelcomeNamePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, loading: statusLoading } = useWelcomeStatus();
  useWelcomeGuard(status, statusLoading);

  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const initial = useMemo(() => (status?.display_name || "").toString(), [status?.display_name]);
  const displayValue = value || initial;
  const canContinue = useMemo(() => displayValue.trim().length > 0 && !loading, [displayValue, loading]);

  async function next() {
    const name = displayValue.trim();
    if (!name) return;
    setLoading(true);
    setError("");
    try {
      await setWelcomeName(name);
      navigate("/welcome/website");
    } catch (e: unknown) {
      setError(errorMessage(e, "save_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WelcomeLayout
      step={1}
      title={t("welcome.name.title")}
      subtitle={t("welcome.name.subtitle")}
      error={error}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Input
          className="lcWelcomeInput"
          value={displayValue}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("welcome.name.placeholder")}
          autoFocus
        />

        <Button className="lcWelcomePrimary" type="primary" onClick={() => void next()} disabled={!canContinue} loading={loading}>
          {t("welcome.continue")}
        </Button>
      </Space>
    </WelcomeLayout>
  );
}
