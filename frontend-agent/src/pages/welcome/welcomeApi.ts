import { http } from "../../providers/http";

export type WelcomeStatus = {
  email_verified: boolean;
  has_site: boolean;
  first_site_id?: string | null;
  display_name?: string | null;
  website?: string | null;
  installation_acknowledged?: boolean;
  company_size?: string | null;
  integrations?: string[] | null;
  completed?: boolean;
};

export type WidgetSnippetResponse = {
  site_id: string;
  site_key: string;
  embed_url: string;
  widget_script_url: string;
  widget_script_versioned_url: string;
  cookie_domain?: string | null;
  cookie_samesite?: string | null;
  snippet_html: string;
};

export type InstallStatusDto = {
  installed: boolean;
  last_seen_at?: string | null;
  last_origin?: string | null;
  last_page_url?: string | null;
};

export type InviteTeamResponse = {
  invited: Array<{ invite_id: string; email: string; role: string; dev_accept_url?: string | null }>;
};

export async function getWelcomeStatus() {
  const res = await http.get<WelcomeStatus>("/api/v1/admin/welcome/status");
  return res.data as WelcomeStatus;
}

export async function setWelcomeName(displayName: string) {
  await http.post("/api/v1/admin/welcome/name", { display_name: displayName });
}

export async function setWelcomeWebsite(website: string) {
  const res = await http.post<{ site_id: string }>("/api/v1/admin/welcome/website", { website });
  return (res.data as { site_id: string }).site_id;
}

export async function setWelcomeIntegrations(integrations: string[]) {
  await http.post("/api/v1/admin/welcome/integrations", { integrations });
}

export async function setWelcomeCompanySize(companySize: string) {
  await http.post("/api/v1/admin/welcome/company-size", { company_size: companySize });
}

export async function acknowledgeWelcomeInstallation() {
  await http.post("/api/v1/admin/welcome/installation/ack");
}

export async function inviteWelcomeTeam(emails: string[]) {
  const res = await http.post<InviteTeamResponse>("/api/v1/admin/welcome/team", { emails });
  return res.data as InviteTeamResponse;
}

export async function completeWelcomeFlow() {
  await http.post("/api/v1/admin/welcome/complete");
}

export async function getWidgetSnippet(siteId: string) {
  const res = await http.get<WidgetSnippetResponse>(
    `/api/v1/admin/sites/${encodeURIComponent(siteId)}/widget/snippet`,
  );
  return res.data as WidgetSnippetResponse;
}

export async function getInstallStatus(siteId: string) {
  const res = await http.get<InstallStatusDto>(
    `/api/v1/admin/sites/${encodeURIComponent(siteId)}/install-status`,
  );
  return res.data as InstallStatusDto;
}
