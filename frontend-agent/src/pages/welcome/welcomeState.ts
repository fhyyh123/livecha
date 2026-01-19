const SITE_ID_KEY = "chatlive.welcome.site_id" as const;

export function getWelcomeSiteId() {
  return sessionStorage.getItem(SITE_ID_KEY) || "";
}

export function setWelcomeSiteId(siteId: string) {
  if (!siteId) return;
  sessionStorage.setItem(SITE_ID_KEY, siteId);
}
