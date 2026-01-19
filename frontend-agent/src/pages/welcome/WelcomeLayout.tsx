import { Alert, Card } from "antd";
import { useTranslation } from "react-i18next";

import "./WelcomeFlow.css";

export function WelcomeLayout(props: {
  step: number;
  title: string;
  subtitle?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const total = 6;

  return (
    <div className="lcWelcome">
      <div className="lcWelcomeInner">
        <div className="lcWelcomeTop">
          <div className="lcWelcomeDots" aria-label={t("welcome.progressAria", { step: props.step, total })}>
            {Array.from({ length: total }).map((_, i) => {
              const idx = i + 1;
              const active = idx <= props.step;
              return (
                <span
                  key={idx}
                  className={"lcWelcomeDot " + (active ? "lcWelcomeDotActive" : "")}
                  aria-hidden
                />
              );
            })}
          </div>
          <div className="lcWelcomeStepText">
            {props.step}/{total}
          </div>
        </div>

        <h1 className="lcWelcomeTitle">{props.title}</h1>
        {props.subtitle ? <div className="lcWelcomeSubtitle">{props.subtitle}</div> : null}

        <div className="lcWelcomeCard">
          {props.error ? <Alert type="error" showIcon message={props.error} style={{ marginBottom: 12 }} /> : null}
          <Card bordered style={{ borderRadius: 16 }}>
            {props.children}
          </Card>
        </div>
      </div>
    </div>
  );
}
