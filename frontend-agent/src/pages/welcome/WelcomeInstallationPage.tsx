import { Alert, Button, Space, Typography, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WelcomeLayout } from "./WelcomeLayout";
import { acknowledgeWelcomeInstallation, getInstallStatus, getWidgetSnippet } from "./welcomeApi";
import { getWelcomeSiteId, setWelcomeSiteId } from "./welcomeState";
import { useWelcomeStatus } from "./useWelcomeStatus";
import { useWelcomeGuard } from "./useWelcomeGuard";
import { errorMessage } from "./errorMessage";

export function WelcomeInstallationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, loading: statusLoading } = useWelcomeStatus();
  useWelcomeGuard(status, statusLoading);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const [siteId, setSiteId] = useState<string>("");
  const [snippet, setSnippet] = useState<string>("");
  const [installed, setInstalled] = useState<boolean>(false);
  const [lastPage, setLastPage] = useState<string>("");

  const resolvedSiteId = useMemo(() => {
    const ss = getWelcomeSiteId();
    return ss || status?.first_site_id || "";
  }, [status?.first_site_id]);

  async function loadAll() {
    const sid = resolvedSiteId;
    if (!sid) return;
    setLoading(true);
    setError("");
    try {
      setSiteId(sid);
      setWelcomeSiteId(sid);

      const sn = await getWidgetSnippet(sid);
      setSnippet(sn.snippet_html || "");

      const st = await getInstallStatus(sid);
      setInstalled(!!st.installed);
      setLastPage((st.last_page_url || "").toString());
    } catch (e: unknown) {
      setError(errorMessage(e, "load_failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSiteId]);

  useEffect(() => {
    if (!siteId) return;
    const timer = window.setInterval(() => {
      void getInstallStatus(siteId)
        .then((st) => {
          setInstalled(!!st.installed);
          setLastPage((st.last_page_url || "").toString());
        })
        .catch(() => {
          // ignore
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [siteId]);

  const canContinue = useMemo(() => !loading && !!snippet, [loading, snippet]);

  async function proceedNext(path: string) {
    setSubmitting(true);
    setError("");
    try {
      await acknowledgeWelcomeInstallation();
      navigate(path);
    } catch (e: unknown) {
      setError(errorMessage(e, "save_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <WelcomeLayout
      step={3}
      title={t("welcome.installation.title")}
      subtitle={t("welcome.installation.subtitle")}
      error={error}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {!siteId ? <Alert type="warning" showIcon message={t("welcome.installation.missingSite")} /> : null}

        <Typography.Text strong>{t("welcome.installation.codeTitle")}</Typography.Text>
        <Input.TextArea className="lcWelcomeCode" value={snippet} readOnly rows={8} />

        {installed ? (
          <Alert type="success" showIcon message={t("welcome.installation.installed")} description={lastPage ? t("welcome.installation.lastPage", { page: lastPage }) : undefined} />
        ) : (
          <Alert type="info" showIcon message={t("welcome.installation.notInstalled")} />
        )}

        <Space>
          <Button className="lcWelcomePrimary" type="primary" onClick={() => void proceedNext("/welcome/integrations")} disabled={!canContinue || submitting}>
            {t("welcome.continue")}
          </Button>
          <Button onClick={() => void loadAll()} disabled={loading || submitting}>
            {t("welcome.refresh")}
          </Button>
        </Space>

        <div className="lcWelcomeLinkRow">
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => navigate("/welcome/website")} disabled={loading || submitting}>
            {t("welcome.back")}
          </button>
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => void proceedNext("/welcome/integrations")} disabled={loading || submitting}>
            {t("welcome.skip")}
          </button>
        </div>
      </Space>
    </WelcomeLayout>
  );
}
