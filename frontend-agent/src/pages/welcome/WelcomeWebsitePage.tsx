import { Button, Input, Space } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WelcomeLayout } from "./WelcomeLayout";
import { setWelcomeWebsite } from "./welcomeApi";
import { useWelcomeStatus } from "./useWelcomeStatus";
import { useWelcomeGuard } from "./useWelcomeGuard";
import { setWelcomeSiteId } from "./welcomeState";
import { errorMessage } from "./errorMessage";

export function WelcomeWebsitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, loading: statusLoading } = useWelcomeStatus();
  useWelcomeGuard(status, statusLoading);

  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const initial = useMemo(() => (status?.website || "").toString(), [status?.website]);
  const website = value || initial;
  const canContinue = useMemo(() => website.trim().length > 0 && !loading, [website, loading]);

  async function next() {
    const v = website.trim();
    if (!v) return;
    setLoading(true);
    setError("");
    try {
      const siteId = await setWelcomeWebsite(v);
      setWelcomeSiteId(siteId);
      navigate("/welcome/installation");
    } catch (e: unknown) {
      setError(errorMessage(e, "save_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WelcomeLayout
      step={2}
      title={t("welcome.website.title")}
      subtitle={t("welcome.website.subtitle")}
      error={error}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Input
          className="lcWelcomeInput"
          value={website}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("welcome.website.placeholder")}
          autoFocus
        />
        <Button className="lcWelcomePrimary" type="primary" onClick={() => void next()} disabled={!canContinue} loading={loading}>
          {t("welcome.continue")}
        </Button>
      </Space>
    </WelcomeLayout>
  );
}
