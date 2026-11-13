import { useEffect, useState } from "react";
import type { AuthOut } from "@exponent-fill/shared-types";
import { api } from "./api";
import type { MessageKey } from "./i18n";
import { AuthProvider, Button, go, I18nProvider, useAuth, useI18n, useRoute } from "./lib";
import { Forgot, Login, Register, Reset } from "./pages/Auth";
import { DocumentDetail, Documents } from "./pages/Documents";
import { AccountPage, Activity, Overview, PrivacyPage, Review } from "./pages/Other";
import { Profile, type ProfileCategory } from "./pages/Profile";

const NAV: { path: string; label: MessageKey }[] = [
  { path: "/", label: "navOverview" },
  { path: "/profile/personal", label: "navPersonal" },
  { path: "/profile/contact", label: "navContact" },
  { path: "/profile/professional", label: "navProfessional" },
  { path: "/profile/academic", label: "navAcademic" },
  { path: "/profile/skills", label: "navSkills" },
  { path: "/profile/administrative", label: "navAdministrative" },
  { path: "/documents", label: "navDocuments" },
  { path: "/review", label: "navReview" },
  { path: "/activity", label: "navActivity" },
  { path: "/privacy", label: "navPrivacy" },
  { path: "/account", label: "navAccount" },
];
const PUBLIC = ["/login", "/register", "/forgot", "/reset"];

function Page({ route }: { route: string }) {
  const [path, query = ""] = route.split("?");
  if (path === "/") return <Overview />;
  if (path?.startsWith("/profile/")) return <Profile key={path} section={path.slice(9) as ProfileCategory} />;
  if (path === "/documents") return <Documents />;
  if (path?.startsWith("/documents/")) return <DocumentDetail key={path} id={path.slice(11)} />;
  if (path === "/review") return <Review />;
  if (path === "/activity") return <Activity />;
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/account") return <AccountPage />;
  void query;
  return <Overview />;
}

function Shell({ route }: { route: string }) {
  const { t } = useI18n();
  const { setAuth } = useAuth();
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl gap-6 p-4 md:grid-cols-[14rem_1fr]">
      <nav aria-label="Main" className="flex flex-col gap-1 text-sm">
        <div className="mb-2 text-lg font-semibold">{t("appName")}</div>
        {NAV.map((n) => {
          const active = n.path === "/" ? route === "/" : route.startsWith(n.path);
          return (
            <a key={n.path} href={`#${n.path}`} aria-current={active ? "page" : undefined} className={`rounded-md px-2 py-1 ${active ? "bg-muted font-medium" : ""}`}>
              {t(n.label)}
            </a>
          );
        })}
        <Button variant="outline" className="mt-3" onClick={() => void api.logout().finally(() => { setAuth(null); go("/login"); })}>
          {t("signOut")}
        </Button>
      </nav>
      <main>
        <Page route={route} />
      </main>
    </div>
  );
}

function Root() {
  const route = useRoute();
  const { t, setLocale } = useI18n();
  const [auth, setAuthState] = useState<AuthOut | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    api.session().then(
      (a) => {
        setAuthState(a);
        if (a.user.locale === "en" || a.user.locale === "fr") setLocale(a.user.locale);
        setChecked(true);
      },
      () => setChecked(true),
    );
  }, [setLocale]);
  const path = route.split("?")[0] ?? "/";
  if (!checked) return <p className="p-4 text-sm">{t("loading")}</p>;
  const isPublic = PUBLIC.includes(path);
  // Guard: nothing private is rendered without a session.
  if (!auth && !isPublic) {
    go("/login");
    return null;
  }
  return (
    <AuthProvider value={{ auth, setAuth: setAuthState }}>
      {auth && isPublic ? (go("/"), null) : isPublic ? (
        path === "/register" ? <Register /> : path === "/forgot" ? <Forgot /> : path === "/reset" ? <Reset token={new URLSearchParams(route.split("?")[1] ?? "").get("token") ?? ""} /> : <Login />
      ) : (
        <Shell route={route} />
      )}
    </AuthProvider>
  );
}

export function App() {
  return (
    <I18nProvider>
      <Root />
    </I18nProvider>
  );
}
