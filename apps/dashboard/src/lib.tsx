import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthOut, Fact } from "@exponent-fill/shared-types";
import { displayTrust, TRUST_LABEL_KEYS } from "@exponent-fill/vault-domain";
import { ApiError } from "./api";
import { detectLocale, errorMessage, translate, type Locale, type MessageKey } from "./i18n";

// ---------------------------------------------------------------- i18n context
interface I18n {
  locale: Locale;
  t: (key: MessageKey) => string;
  setLocale: (l: Locale) => void;
  err: (e: unknown) => string;
}
const I18nContext = createContext<I18n>({ locale: "en", t: (k) => translate("en", k), setLocale: () => undefined, err: () => "" });
export const useI18n = () => useContext(I18nContext);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>(detectLocale);
  const setLocale = useCallback((l: Locale) => {
    setLoc(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem("ef_locale", l); // the ONLY thing kept in the browser: the language
    } catch {
      /* ignore */
    }
  }, []);
  const value: I18n = {
    locale,
    t: (key) => translate(locale, key),
    setLocale,
    err: (e) => (e instanceof ApiError ? errorMessage(locale, e.code) : translate(locale, "error")),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ---------------------------------------------------------------- session context
interface Auth {
  auth: AuthOut | null;
  setAuth: (a: AuthOut | null) => void;
}
const AuthContext = createContext<Auth>({ auth: null, setAuth: () => undefined });
export const useAuth = () => useContext(AuthContext);
export const AuthProvider = AuthContext.Provider;

// ---------------------------------------------------------------- hash router
export function useRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
export const go = (path: string) => {
  window.location.hash = path;
};

// ---------------------------------------------------------------- data hook
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const alive = useRef(true);
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => alive.current && setState({ data, error: null, loading: false }),
      (error: unknown) => alive.current && setState({ data: null, error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    run();
    return () => {
      alive.current = false;
    };
  }, [run]);
  return { ...state, reload: run };
}

// ---------------------------------------------------------------- small UI kit
export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "danger" }) {
  const base = "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  const look = variant === "primary" ? "bg-primary text-primary-foreground" : variant === "danger" ? "bg-danger text-white" : "border border-border bg-background";
  return <button {...p} className={`${base} ${look} ${className}`} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
export const inputClass = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, err } = useI18n();
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-danger p-2 text-sm text-danger">
      <span>{err(error)}</span>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

const TRUST_TONE: Record<string, string> = { verified: "text-success border-success", declared: "text-foreground border-border", extracted: "text-warning border-warning", inferred: "text-warning border-warning" };
const TRUST_HELP: Record<string, MessageKey> = { declared: "trustHelpDeclared", extracted: "trustHelpExtracted", verified: "trustHelpVerified", inferred: "trustHelpInferred" };

/** "Verified" is displayed ONLY when the server says so and the fact's own fields agree (see vault-domain `displayTrust`). */
export function TrustBadge({ fact }: { fact: Pick<Fact, "trust_class" | "validation_status" | "verification_level" | "origin"> }) {
  const { t } = useI18n();
  const cls = displayTrust(fact);
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${TRUST_TONE[cls]}`} title={t(TRUST_HELP[cls] ?? "trustDeclared")} data-trust={cls}>
      {t(TRUST_LABEL_KEYS[cls] as MessageKey)}
    </span>
  );
}

export function ConfirmDialog({ open, title, body, onConfirm, onCancel }: { open: boolean; title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-sm rounded-lg border border-border bg-background p-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="my-2 text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Loading({ r }: { r: { loading: boolean; error: unknown; reload: () => void } }) {
  const { t } = useI18n();
  if (r.error) return <ErrorBanner error={r.error} onRetry={r.reload} />;
  return r.loading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null;
}
