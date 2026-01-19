import type { WelcomeStatus } from "./welcomeApi";

const STEP_INDEX: Record<string, number> = {
  "/welcome/name": 1,
  "/welcome/website": 2,
  "/welcome/installation": 3,
  "/welcome/integrations": 4,
  "/welcome/company-size": 5,
  "/welcome/team": 6,
} as const;

export function getWelcomeStepIndex(pathname: string): number {
  return STEP_INDEX[pathname] ?? Number.POSITIVE_INFINITY;
}

export function getRequiredWelcomePath(status: WelcomeStatus | null | undefined): string {
  if (status?.completed) return "/conversations";
  if (!status?.display_name) return "/welcome/name";
  if (!status?.website) return "/welcome/website";
  if (!status?.has_site) return "/welcome/website";

  if (!status?.installation_acknowledged) return "/welcome/installation";

  // Treat integrations as completed if the field is present (including empty list).
  // Backend returns null when not started, [] when completed with no selections.
  const integrationsCompleted = status.integrations !== null && status.integrations !== undefined;
  if (!integrationsCompleted) return "/welcome/integrations";

  const hasCompanySize = Boolean(String(status.company_size || "").trim());
  if (!hasCompanySize) return "/welcome/company-size";
  return "/welcome/team";
}
