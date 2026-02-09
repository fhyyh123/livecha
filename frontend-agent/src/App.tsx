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
import { I18nextProvider, useTranslation } from "react-i18next";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { embedI18n } from "./i18nEmbed";

import { authProvider } from "./providers/authProvider";
import { AUTH_CHANGED_EVENT, getToken, http } from "./providers/http";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailCodePage } from "./pages/VerifyEmailCodePage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { Authenticated, useCan } from "@refinedev/core";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { WsAutoConnect } from "./components/WsAutoConnect";
import { accessControlProvider } from "./providers/accessControlProvider";
import { AppShell } from "./components/AppShell";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const WorkbenchPage = lazy(() => import("./pages/WorkbenchPage").then((m) => ({ default: m.WorkbenchPage })));
const ArchivesPage = lazy(() => import("./pages/ArchivesPage").then((m) => ({ default: m.ArchivesPage })));
const VisitorEmbedPage = lazy(() => import("./pages/VisitorEmbedPage").then((m) => ({ default: m.VisitorEmbedPage })));
const ChatPagePublic = lazy(() => import("./pages/ChatPagePublic").then((m) => ({ default: m.ChatPagePublic })));
const SitesPage = lazy(() => import("./pages/SitesPage").then((m) => ({ default: m.SitesPage })));
const TrustedDomainsPage = lazy(() => import("./pages/TrustedDomainsPage").then((m) => ({ default: m.TrustedDomainsPage })));
const WidgetCustomizePage = lazy(() => import("./pages/WidgetCustomizePage").then((m) => ({ default: m.WidgetCustomizePage })));
const WidgetLanguagePage = lazy(() => import("./pages/WidgetLanguagePage.tsx").then((m) => ({ default: m.WidgetLanguagePage })));
const PreChatFormPage = lazy(() => import("./pages/PreChatFormPage").then((m) => ({ default: m.PreChatFormPage })));
const AskForEmailPage = lazy(() => import("./pages/AskForEmailPage").then((m) => ({ default: m.AskForEmailPage })));
const PostChatFormPage = lazy(() => import("./pages/PostChatFormPage").then((m) => ({ default: m.PostChatFormPage })));
const TicketFormPage = lazy(() => import("./pages/TicketFormPage").then((m) => ({ default: m.TicketFormPage })));
const InactivityTimeoutsPage = lazy(() => import("./pages/InactivityTimeoutsPage").then((m) => ({ default: m.InactivityTimeoutsPage })));
const FileSharingPage = lazy(() => import("./pages/FileSharingPage").then((m) => ({ default: m.FileSharingPage })));
const ChatAssignmentPage = lazy(() => import("./pages/ChatAssignmentPage").then((m) => ({ default: m.ChatAssignmentPage })));
const InvitesPage = lazy(() => import("./pages/InvitesPage").then((m) => ({ default: m.InvitesPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const SkillGroupEditPage = lazy(() => import("./pages/SkillGroupEditPage").then((m) => ({ default: m.SkillGroupEditPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const ChatPageSettingsPage = lazy(() => import("./pages/ChatPageSettingsPage").then((m) => ({ default: m.ChatPageSettingsPage })));
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

function RequireCan({
  resource,
  children,
}: {
  resource: string;
  children: React.ReactNode;
}) {
  const { data, isLoading } = useCan({ resource, action: "list" });
  if (isLoading) return null;
  if (!data?.can) return <CatchAllNavigate to="/" />;
  return <>{children}</>;
}

function RequireEmailVerified({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "verified" | "unverified">("loading");
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    const onAuthChanged = () => setAuthTick((x) => x + 1);
    try {
      globalThis.window?.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    } catch {
      // ignore
    }
    return () => {
      try {
        globalThis.window?.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    // In case this component gets mounted before login completes, avoid calling
    // /auth/me with no token.
    const token = getToken();
    if (!token) return;
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
  }, [authTick]);

  if (!getToken()) return null;
  if (status === "loading") return null;
  if (status === "unverified") return <CatchAllNavigate to="/verify-email-code" />;
  return <>{children}</>;
}

function App() {
  const { t } = useTranslation();

  // Public visitor routes: should not require agent auth nor trigger /auth/me.
  // We intentionally keep this as a plain (non-hook) computation.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const isPublicVisitor = !!path && (path.startsWith("/visitor/embed") || path.startsWith("/chat/"));

  const resources = useMemo(() => {
    return [
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
    ];
  }, [t]);

  // Public visitor mode: do not mount Refine/auth providers to avoid /auth/me requests.
  if (isPublicVisitor) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/visitor/embed"
            element={
              <Suspense fallback={<RouteFallback />}>
                <I18nextProvider i18n={embedI18n}>
                  <VisitorEmbedPage />
                </I18nextProvider>
              </Suspense>
            }
          />
          <Route
            path="/chat/:siteKey"
            element={
              <Suspense fallback={<RouteFallback />}>
                <I18nextProvider i18n={embedI18n}>
                  <ChatPagePublic />
                </I18nextProvider>
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
                  <I18nextProvider i18n={embedI18n}>
                    <VisitorEmbedPage />
                  </I18nextProvider>
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
                  <RequireCan resource="sites">
                    <Suspense fallback={<RouteFallback />}>
                      <SitesPage />
                    </Suspense>
                  </RequireCan>
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
                path="/settings/widget/language"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <WidgetLanguagePage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/chat-page"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ChatPageSettingsPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/forms/pre-chat"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <PreChatFormPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/forms/ask-for-email"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <AskForEmailPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/forms/post-chat"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <PostChatFormPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/forms/ticket"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TicketFormPage />
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
                path="/settings/chat-settings/file-sharing"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <FileSharingPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings/chat-settings/chat-assignment"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ChatAssignmentPage />
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
                  <RequireCan resource="invites">
                    <Suspense fallback={<RouteFallback />}>
                      <InvitesPage />
                    </Suspense>
                  </RequireCan>
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
                path="/team/groups/:groupId/edit"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SkillGroupEditPage />
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
