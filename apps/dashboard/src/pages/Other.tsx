import { useState } from "react";
import type { Conflict, Fact, Privacy } from "@exponent-fill/shared-types";
import { api } from "../api";
import { Button, Card, ConfirmDialog, ErrorBanner, Field, go, inputClass, Loading, TrustBadge, useAuth, useI18n, useResource } from "../lib";

// ---------------------------------------------------------------- overview
export function Overview() {
  const { t } = useI18n();
  const review = useResource(() => api.review(), []);
  const docs = useResource(() => api.documents(), []);
  const facts = useResource(() => api.facts(), []);
  const audit = useResource(() => api.audit(), []);
  const sections = ["personal", "contact", "professional", "academic", "skills", "administrative"] as const;
  const names = { personal: "navPersonal", contact: "navContact", professional: "navProfessional", academic: "navAcademic", skills: "navSkills", administrative: "navAdministrative" } as const;
  const count = (c: string) => (facts.data?.items ?? []).filter((f) => f.category === c || (c === "professional" && f.category === "experience") || (c === "skills" && f.category === "certifications")).length;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("overviewTitle")}</h1>
      <Loading r={review} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card title={t("navReview")}><a className="text-2xl font-semibold underline" href="#/review">{review.data?.facts.length ?? "…"}</a><p className="text-xs text-muted-foreground">{t("toReview")}</p></Card>
        <Card title={t("conflictsTitle")}><a className="text-2xl font-semibold underline" href="#/review">{review.data?.conflicts.length ?? "…"}</a><p className="text-xs text-muted-foreground">{t("openConflicts")}</p></Card>
        <Card title={t("navDocuments")}><a className="text-2xl font-semibold underline" href="#/documents">{docs.data?.length ?? "…"}</a><p className="text-xs text-muted-foreground">{t("documentsCount")}</p></Card>
      </div>
      <Card>
        <ul className="grid gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s} className="flex justify-between"><a className="underline" href={`#/profile/${s}`}>{t(names[s])}</a><span className="text-muted-foreground">{count(s)}</span></li>
          ))}
        </ul>
      </Card>
      <Card title={t("lastActivity")}>
        <ul className="text-sm">{audit.data?.slice(0, 5).map((e) => <li key={e.id}>{e.created_at.slice(0, 16).replace("T", " ")} · {e.action}</li>)}</ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- review queue
function ConflictCard({ c, onDone }: { c: Conflict; onDone: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const resolve = (keep: "a" | "b" | "dismiss") => api.resolve(c.id, keep).then(onDone, setError);
  const side = (s: Conflict["a"], keep: "a" | "b") => (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2">
      <b data-testid="conflict-value">{s.masked ? t("masked") : String(s.value)}</b>
      <TrustBadge fact={{ trust_class: s.trust_class, validation_status: s.validation_status, verification_level: s.trust_class === "verified" ? "user_confirmed" : "none", origin: "declared" }} />
      <Button onClick={() => void resolve(keep)}>{keep === "a" ? t("keepA") : t("keepB")}</Button>
    </div>
  );
  return (
    <Card title={c.key}>
      <ErrorBanner error={error} />
      <div className="grid gap-2 sm:grid-cols-2">{side(c.a, "a")}{side(c.b, "b")}</div>
      <Button className="mt-2" variant="outline" onClick={() => void resolve("dismiss")}>{t("dismissConflict")}</Button>
    </Card>
  );
}

function ReviewFact({ f, onDone }: { f: Fact; onDone: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const [src, setSrc] = useState<{ document_id: string; locator: Record<string, unknown> } | null>(null);
  return (
    <li className="flex flex-col gap-1 border-b border-border py-2 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{f.key}: <b>{f.masked ? t("masked") : String(f.value)}</b></span>
        <TrustBadge fact={f} />
      </div>
      <ErrorBanner error={error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void api.validate(f.id, f.version, false).then(onDone, setError)}>{t("validate")}</Button>
        {f.sources_count > 0 && <Button variant="outline" onClick={() => void api.validate(f.id, f.version, true).then(onDone, setError)}>{t("validateWithDocument")}</Button>}
        <Button variant="outline" onClick={() => void api.reject(f.id).then(onDone, setError)}>{t("reject")}</Button>
        {f.sources_count > 0 && <Button variant="outline" onClick={() => void api.sources(f.id).then((s) => setSrc(s[0] ?? null), setError)}>{t("source")}</Button>}
      </div>
      {src && <p className="text-xs text-muted-foreground">“{String(src.locator.quote ?? "")}” — <a className="underline" href={`#/documents/${src.document_id}`}>{t("source")}</a></p>}
    </li>
  );
}

export function Review() {
  const { t } = useI18n();
  const review = useResource(() => api.review(), []);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("reviewTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("reviewIntro")}</p>
      <Loading r={review} />
      {review.data && review.data.conflicts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t("conflictsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("conflictIntro")}</p>
          {review.data.conflicts.map((c) => <ConflictCard key={c.id} c={c} onDone={review.reload} />)}
        </section>
      )}
      <Card>
        {review.data?.facts.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        <ul>{review.data?.facts.map((f) => <ReviewFact key={f.id} f={f} onDone={review.reload} />)}</ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- activity
export function Activity() {
  const { t } = useI18n();
  const events = useResource(() => api.audit(), []);
  const verify = useResource(() => api.auditVerify(), []);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("activityTitle")}</h1>
      <Loading r={events} />
      {verify.data && <p role="status" className={verify.data.valid ? "text-success" : "text-danger"}>{verify.data.valid ? t("chainValid") : t("chainBroken")} ({verify.data.events})</p>}
      <Card>
        <table className="w-full text-sm">
          <tbody>{events.data?.map((e) => <tr key={e.id} className="border-b border-border"><td className="py-1 pr-2 text-muted-foreground">{e.created_at.slice(0, 19).replace("T", " ")}</td><td>{e.action}</td><td>{e.actor}</td><td>{e.outcome}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- privacy and security
export function PrivacyPage() {
  const { t } = useI18n();
  const prefs = useResource(() => api.privacy(), []);
  const sessions = useResource(() => api.sessions(), []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.aiPreview>> | null>(null);
  const [device, setDevice] = useState({ label: "Chrome", token: "" });
  const save = (p: Privacy) => api.putPrivacy(p).then(() => { setSaved(true); prefs.reload(); }, setError);
  const p = prefs.data;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("privacyTitle")}</h1>
      <Loading r={prefs} />
      <ErrorBanner error={error} />
      {p && (
        <Card title={t("aiSharing")}>
          <div className="flex flex-col gap-2 text-sm">
            {(["none", "structure_only", "selected"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="ai" checked={p.ai_sharing_mode === m} onChange={() => void save({ ...p, ai_sharing_mode: m })} />
                {m === "none" ? t("aiNone") : m === "structure_only" ? t("aiStructure") : t("aiSelected")}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">{t("sensitiveNever")}</p>
            <Button variant="outline" onClick={() => void api.aiPreview("preview").then(setPreview, setError)}>{t("aiPreview")}</Button>
            {preview && <p className="text-xs">{preview.shareable.length} · {t("aiExcluded")}: {JSON.stringify(preview.excluded)}</p>}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={p.device_validation_allowed} onChange={(e) => void save({ ...p, device_validation_allowed: e.target.checked })} />
              {t("deviceValidation")}
            </label>
            <Field label={t("retention")}>
              <input className={inputClass} type="number" min={1} value={p.document_retention_days ?? ""} onChange={(e) => void save({ ...p, document_retention_days: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            {saved && <span role="status">{t("save_ok")}</span>}
          </div>
        </Card>
      )}
      <Card title={t("sessions")}>
        <Loading r={sessions} />
        <ul className="flex flex-col gap-1 text-sm">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span>{s.kind} · {s.label} · {s.last_seen_at.slice(0, 16).replace("T", " ")}{s.current ? ` · ${t("current")}` : ""}</span>
              {!s.current && <Button variant="outline" onClick={() => void api.revokeSession(s.id).then(sessions.reload, setError)}>{t("revoke")}</Button>}
            </li>
          ))}
        </ul>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); api.createDevice(device.label, []).then((d) => { setDevice({ ...device, token: d.token }); sessions.reload(); }, setError); }}>
          <Field label={t("deviceLabel")}><input className={inputClass} value={device.label} onChange={(e) => setDevice({ ...device, label: e.target.value })} /></Field>
          <Button>{t("createDevice")}</Button>
        </form>
        {device.token && <p role="status" className="mt-2 break-all rounded-md bg-muted p-2 text-xs"><b>{t("deviceToken")}</b><br /><code>{device.token}</code></p>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- account
export function AccountPage() {
  const { t, locale, setLocale } = useI18n();
  const { auth, setAuth } = useAuth();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState({ open: false, password: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const user = auth?.user;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("accountTitle")}</h1>
      <ErrorBanner error={error} />
      {msg && <p role="status">{msg}</p>}
      {user && !user.email_verified && <p className="text-sm text-warning">{t("verifyEmail")}</p>}
      {user?.deletion_scheduled_for && (
        <Card><p className="text-sm">{t("deletionScheduled")} {user.deletion_scheduled_for.slice(0, 10)}</p><Button onClick={() => void api.cancelDeletion().then(() => api.account().then((u) => auth && setAuth({ ...auth, user: u })), setError)}>{t("cancelDeletion")}</Button></Card>
      )}
      <Card title={t("language")}>
        <select aria-label={t("language")} className={inputClass} value={locale} onChange={(e) => { setLocale(e.target.value as "en" | "fr"); void api.patchAccount({ locale: e.target.value }); }}>
          <option value="en">English</option><option value="fr">Français</option>
        </select>
      </Card>
      <Card title={t("changePassword")}>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); api.changePassword(pw.current, pw.next).then(() => { setMsg(t("save_ok")); setPw({ current: "", next: "" }); }, setError); }}>
          <Field label={t("currentPassword")}><input className={inputClass} type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t("newPassword")} hint={t("passwordHint")}><input className={inputClass} type="password" autoComplete="new-password" required minLength={12} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Button>{t("save")}</Button>
        </form>
      </Card>
      <Card title="Export">
        <div className="flex flex-wrap gap-2">
          <a className="rounded-md border border-border px-3 py-1.5 text-sm" href="/v1/account/export" download="exponent-fill-export.json">{t("exportData")}</a>
          <a className="rounded-md border border-border px-3 py-1.5 text-sm" href="/v1/account/export.zip" download="exponent-fill-export.zip">{t("exportZip")}</a>
        </div>
      </Card>
      <Card title={t("deleteAccount")}>
        <p className="mb-2 text-sm text-muted-foreground">{t("deleteAccountHelp")}</p>
        <Button variant="danger" onClick={() => setDel({ ...del, open: true })}>{t("deleteAccount")}</Button>
        <ConfirmDialog open={del.open} title={t("deleteAccount")} body={t("deleteAccountHelp")} onCancel={() => setDel({ open: false, password: "" })}
          onConfirm={() => api.deleteAccount(del.password).then(() => { setAuth(null); go("/login"); }, (e: unknown) => { setError(e); setDel({ open: false, password: "" }); })} />
        {del.open && <input className={`${inputClass} mt-2`} type="password" aria-label={t("password")} placeholder={t("password")} value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />}
      </Card>
    </div>
  );
}
