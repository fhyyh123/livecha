import { Refine } from "@refinedev/core";
import {
  ErrorComponent,
  RefineThemes,
  notificationProvider,
} from "@refinedev/antd";
import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from "@refinedev/react-router-v6";
import { ConfigProvider } from "antd";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { authProvider } from "./providers/authProvider";
import { http } from "./providers/http";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailCodePage } from "./pages/VerifyEmailCodePage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { Authenticated } from "@refinedev/core";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { WsAutoConnect } from "./components/WsAutoConnect";
import { accessControlProvider } from "./providers/accessControlProvider";
import { AppShell } from "./components/AppShell";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const WorkbenchPage = lazy(() => import("./pages/WorkbenchPage").then((m) => ({ default: m.WorkbenchPage })));
const ArchivesPage = lazy(() => import("./pages/ArchivesPage").then((m) => ({ default: m.ArchivesPage })));
const VisitorEmbedPage = lazy(() => import("./pages/VisitorEmbedPage").then((m) => ({ default: m.VisitorEmbedPage })));
const SitesPage = lazy(() => import("./pages/SitesPage").then((m) => ({ default: m.SitesPage })));
const TrustedDomainsPage = lazy(() => import("./pages/TrustedDomainsPage").then((m) => ({ default: m.TrustedDomainsPage })));
const WidgetCustomizePage = lazy(() => import("./pages/WidgetCustomizePage").then((m) => ({ default: m.WidgetCustomizePage })));
const InactivityTimeoutsPage = lazy(() => import("./pages/InactivityTimeoutsPage").then((m) => ({ default: m.InactivityTimeoutsPage })));
const InvitesPage = lazy(() => import("./pages/InvitesPage").then((m) => ({ default: m.InvitesPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const SettingsPlaceholderPage = lazy(() => import("./pages/SettingsPlaceholderPage").then((m) => ({ default: m.SettingsPlaceholderPage })));

const WelcomeNamePage = lazy(() => import("./pages/welcome/WelcomeNamePage").then((m) => ({ default: m.WelcomeNamePage })));
const WelcomeWebsitePage = lazy(() => import("./pages/welcome/WelcomeWebsitePage").then((m) => ({ default: m.WelcomeWebsitePage })));
const WelcomeInstallationPage = lazy(() => import("./pages/welcome/WelcomeInstallationPage").then((m) => ({ default: m.WelcomeInstallationPage })));
const WelcomeIntegrationsPage = lazy(() => import("./pages/welcome/WelcomeIntegrationsPage").then((m) => ({ default: m.WelcomeIntegrationsPage })));
const WelcomeCompanySizePage = lazy(() => import("./pages/welcome/WelcomeCompanySizePage").then((m) => ({ default: m.WelcomeCompanySizePage })));
const WelcomeTeamPage = lazy(() => import("./pages/welcome/WelcomeTeamPage").then((m) => ({ default: m.WelcomeTeamPage })));

function RouteFallback() {
  // Keep it minimal to avoid layout jank.
  return null;
}

type MeResponse = {
  email_verified?: boolean;
};

function RequireEmailVerified({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "verified" | "unverified">("loading");

  useEffect(() => {
    let mounted = true;
    http
      .get<MeResponse>("/api/v1/auth/me")
      .then((res) => {
        if (!mounted) return;
        const me = res.data;
        setStatus(me.email_verified === false ? "unverified" : "verified");
      })
      .catch(() => {
        if (!mounted) return;
        // If token is invalid, Authenticated will already redirect to /login.
        setStatus("verified");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "loading") return null;
  if (status === "unverified") return <CatchAllNavigate to="/verify-email-code" />;
  return <>{children}</>;
}

function App() {
  const { t } = useTranslation();

  // Public visitor embed route: should not require agent auth nor trigger /auth/me.
  // We intentionally keep this as a plain (non-hook) computation.
  const isVisitorEmbed = typeof window !== "undefined" && window.location.pathname.startsWith("/visitor/embed");

  const [meRole, setMeRole] = useState<string>("");

  useEffect(() => {
    if (isVisitorEmbed) return;
    let mounted = true;
    http
      .get<{ role?: string }>("/api/v1/auth/me")
      .then((res) => {
        if (!mounted) return;
        setMeRole(String(res.data?.role || ""));
      })
      .catch(() => {
        if (!mounted) return;
        setMeRole("");
      });
    return () => {
      mounted = false;
    };
  }, [isVisitorEmbed]);

  const resources = useMemo(() => {
    const list = [
      {
        name: "conversations",
        list: "/conversations",
        meta: { label: t("nav.conversations") },
      },
        {
          name: "archives",
          list: "/archives",
          meta: { label: t("nav.archives") },
        },
      {
        name: "team",
        list: "/team",
        meta: { label: t("nav.team") },
      },
    ];

    if (meRole === "admin") {
      list.splice(1, 0,
        {
          name: "sites",
          list: "/sites",
          meta: { label: t("nav.sites") },
        },
        {
          name: "invites",
          list: "/invites",
          meta: { label: t("nav.invites") },
        },
      );
    }

    return list;
  }, [meRole, t]);

  // Embed-only mode: do not mount Refine/auth providers to avoid /auth/me requests.
  if (isVisitorEmbed) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/visitor/embed"
            element={
              <Suspense fallback={<RouteFallback />}>
                <VisitorEmbedPage />
              </Suspense>
            }
          />
          <Route path="*" element={<CatchAllNavigate to="/visitor/embed" />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <ConfigProvider theme={RefineThemes.Blue}>
        <LanguageSwitcher />
        <Refine
          authProvider={authProvider}
          routerProvider={routerProvider}
          accessControlProvider={accessControlProvider}
          notificationProvider={notificationProvider}
          resources={resources}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
            projectId: "chatlive",
          }}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email-code" element={<VerifyEmailCodePage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            <Route
              path="/visitor/embed"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <VisitorEmbedPage />
                </Suspense>
              }
            />

            <Route
              element={
                <Authenticated
                  key="auth-welcome"
                  fallback={<CatchAllNavigate to="/login" />}
                >
                  <RequireEmailVerified>
                    <Outlet />
                  </RequireEmailVerified>
                </Authenticated>
              }
            >
              <Route
                path="/welcome/name"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WelcomeNamePage />
                  </Suspense>
                }
              />
              <Route
                path="/welcome/website"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WelcomeWebsitePage />
                  </Suspense>
                }
              />
              <Route
                path="/welcome/installation"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WelcomeInstallationPage />
                  </Suspense>
                }
              />
              <Route
                path="/welcome/integrations"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WelcomeIntegrationsPage />
                  </Suspense>
                }
              />
              <Route
                path="/welcome/company-size"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WelcomeCompanySizePage />
                  </Suspense>
                }
              />
              <Route
                path="/welcome/team"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WelcomeTeamPage />
                  </Suspense>
                }
              />
            </Route>

            <Route
              element={
                <Authenticated
                  key="auth-layout"
                  fallback={<CatchAllNavigate to="/login" />}
                >
                  <RequireEmailVerified>
                    <AppShell>
                      <Outlet />
                    </AppShell>
                  </RequireEmailVerified>
                </Authenticated>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <HomePage />
                  </Suspense>
                }
              />
              <Route
                path="/conversations"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WorkbenchPage />
                  </Suspense>
                }
              />
              <Route
                path="/conversations/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WorkbenchPage />
                  </Suspense>
                }
              />
              <Route
                path="/archives"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ArchivesPage />
                  </Suspense>
                }
              />
              <Route
                path="/archives/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ArchivesPage />
                  </Suspense>
                }
              />
              <Route
                path="/sites"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SitesPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/security/trusted-domains"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TrustedDomainsPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/widget/customize"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WidgetCustomizePage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/chat-settings/inactivity-timeouts"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <InactivityTimeoutsPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SettingsPlaceholderPage />
                  </Suspense>
                }
              />
              <Route
                path="/invites"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <InvitesPage />
                  </Suspense>
                }
              />
              <Route
                path="/team"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TeamPage />
                  </Suspense>
                }
              />
              <Route
                path="/profile"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ProfilePage />
                  </Suspense>
                }
              />
            </Route>

            <Route
              element={
                <Authenticated key="auth-catchall" fallback={<Outlet />}>
                  <CatchAllNavigate to="/" />
                </Authenticated>
              }
            >
              <Route path="*" element={<ErrorComponent />} />
            </Route>
          </Routes>

          <WsAutoConnect />

          <UnsavedChangesNotifier />
          <DocumentTitleHandler />
        </Refine>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
