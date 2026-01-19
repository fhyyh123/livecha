import { Alert, Button, Input, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WelcomeLayout } from "./WelcomeLayout";
import { completeWelcomeFlow, inviteWelcomeTeam } from "./welcomeApi";
import { useWelcomeStatus } from "./useWelcomeStatus";
import { useWelcomeGuard } from "./useWelcomeGuard";
import { errorMessage } from "./errorMessage";

function normalizeEmails(values: string[]) {
  const out: string[] = [];
  for (const v of values) {
    const t = (v || "").trim();
    if (!t) continue;
    out.push(t);
  }
  return out;
}

export function WelcomeTeamPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { status, loading: statusLoading } = useWelcomeStatus();
  useWelcomeGuard(status, statusLoading);

  const [emails, setEmails] = useState<string[]>(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [ok, setOk] = useState<string>("");

  const cleaned = useMemo(() => normalizeEmails(emails), [emails]);

  async function send() {
    setLoading(true);
    setError("");
    setOk("");
    try {
      const res = await inviteWelcomeTeam(cleaned);
      const count = res.invited.length;
      setOk(t("welcome.team.sent", { count }));
    } catch (e: unknown) {
      setError(errorMessage(e, "send_failed"));
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    setLoading(true);
    setError("");
    try {
      await completeWelcomeFlow();
      navigate("/conversations");
    } catch (e: unknown) {
      setError(errorMessage(e, "save_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WelcomeLayout
      step={6}
      title={t("welcome.team.title")}
      subtitle={t("welcome.team.subtitle")}
      error={error}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {ok ? <Alert type="success" showIcon message={ok} /> : null}

        <Typography.Text>{t("welcome.team.hint")}</Typography.Text>

        {emails.map((v, idx) => (
          <Input
            key={idx}
            className="lcWelcomeInput"
            value={v}
            onChange={(e) => {
              const next = emails.slice();
              next[idx] = e.target.value;
              setEmails(next);
            }}
            placeholder={t("welcome.team.placeholder")}
          />
        ))}

        <Space>
          <Button className="lcWelcomePrimary" type="primary" onClick={() => void send()} disabled={loading || cleaned.length === 0} loading={loading}>
            {t("welcome.team.send")}
          </Button>
          <Button onClick={() => void finish()} disabled={loading}>
            {t("welcome.team.finish")}
          </Button>
        </Space>

        <div className="lcWelcomeLinkRow">
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => navigate("/welcome/company-size")} disabled={loading}>
            {t("welcome.back")}
          </button>
          <button className="lcWelcomeLinkBtn" type="button" onClick={() => void finish()} disabled={loading}>
            {t("welcome.skip")}
          </button>
        </div>
      </Space>
    </WelcomeLayout>
  );
}
