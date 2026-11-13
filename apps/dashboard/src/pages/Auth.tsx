import { useState } from "react";
import { api } from "../api";
import { Button, ErrorBanner, Field, go, inputClass, useAuth, useI18n } from "../lib";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("appName")}</h1>
        <select aria-label={t("language")} className={inputClass} value={locale} onChange={(e) => setLocale(e.target.value as "en" | "fr")}>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </header>
      <h2 className="text-lg">{title}</h2>
      {children}
    </main>
  );
}

export function Login() {
  const { t } = useI18n();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Shell title={t("signIn")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          api.login(email, password).then(
            (a) => {
              setAuth(a);
              go("/");
            },
            (err: unknown) => {
              setError(err);
              setBusy(false);
            },
          );
        }}
      >
        <ErrorBanner error={error} />
        <Field label={t("email")}>
          <input className={inputClass} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("password")}>
          <input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button disabled={busy}>{t("signIn")}</Button>
      </form>
      <a className="text-sm underline" href="#/forgot">
        {t("forgot")}
      </a>
      <a className="text-sm underline" href="#/register">
        {t("noAccount")}
      </a>
    </Shell>
  );
}

export function Register() {
  const { t, locale } = useI18n();
  const { setAuth } = useAuth();
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState<unknown>(null);
  return (
    <Shell title={t("register")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          api.register(form.email, form.password, form.name, locale).then(
            (a) => {
              setAuth(a);
              go("/");
            },
            setError,
          );
        }}
      >
        <ErrorBanner error={error} />
        <Field label={t("displayName")}>
          <input className={inputClass} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t("email")}>
          <input className={inputClass} type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t("password")} hint={t("passwordHint")}>
          <input className={inputClass} type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button>{t("register")}</Button>
      </form>
      <a className="text-sm underline" href="#/login">
        {t("haveAccount")}
      </a>
    </Shell>
  );
}

export function Forgot() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <Shell title={t("forgot")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void api.resetRequest(email).finally(() => setSent(true)); // identical answer whether or not the account exists
        }}
      >
        <Field label={t("email")}>
          <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button>{t("sendLink")}</Button>
        {sent && (
          <p role="status" className="text-sm">
            {t("resetSent")}
          </p>
        )}
      </form>
      <a className="text-sm underline" href="#/login">
        {t("signIn")}
      </a>
    </Shell>
  );
}

export function Reset({ token }: { token: string }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <Shell title={t("resetPassword")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          api.resetConfirm(token, pw).then(() => go("/login"), setError);
        }}
      >
        <ErrorBanner error={error} />
        <Field label={t("newPassword")} hint={t("passwordHint")}>
          <input className={inputClass} type="password" autoComplete="new-password" required minLength={12} value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Button>{t("resetPassword")}</Button>
      </form>
    </Shell>
  );
}
