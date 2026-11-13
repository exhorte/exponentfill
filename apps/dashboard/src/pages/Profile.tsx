import { useState } from "react";
import type { Fact } from "@exponent-fill/shared-types";
import { api, ApiError } from "../api";
import { Button, Card, ConfirmDialog, ErrorBanner, Field, inputClass, Loading, TrustBadge, useI18n, useResource } from "../lib";

const CATEGORY_TITLE = {
  personal: "navPersonal", contact: "navContact", professional: "navProfessional", academic: "navAcademic", skills: "navSkills", administrative: "navAdministrative",
} as const;
export type ProfileCategory = keyof typeof CATEGORY_TITLE;
/** Categories shown together on one page. */
const PAGE_CATEGORIES: Record<ProfileCategory, string[]> = {
  personal: ["personal"], contact: ["contact"], professional: ["professional", "experience"], academic: ["academic"], skills: ["skills", "certifications"], administrative: ["administrative"],
};

function StatusLabel({ fact }: { fact: Fact }) {
  const { t } = useI18n();
  const map = { pending_review: "statusPending", validated: "statusValidated", rejected: "statusRejected", superseded: "statusSuperseded" } as const;
  return <span className="text-xs text-muted-foreground">{t(map[fact.validation_status])}</span>;
}

function FactRow({ fact, onChange }: { fact: Fact; onChange: () => void }) {
  const { t, err } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(typeof fact.value === "string" ? fact.value : "");
  const [shown, setShown] = useState<string | boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [open, setOpen] = useState(false);
  const history = useResource(() => (open ? api.history(fact.id) : Promise.resolve([])), [open, fact.id, fact.version]);
  const sources = useResource(() => (open ? api.sources(fact.id) : Promise.resolve([])), [open, fact.id, fact.version]);
  const run = (p: Promise<unknown>) => p.then(() => { setError(null); setEditing(false); onChange(); }, setError);

  const display = fact.masked ? (shown === null ? t("masked") : String(shown)) : fact.value === null ? "" : String(fact.value);
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-muted-foreground">{fact.key}</div>
          {editing ? (
            <input aria-label={fact.key} className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <div className="font-medium" data-testid="fact-value">{display}</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TrustBadge fact={fact} />
          <StatusLabel fact={fact} />
          {fact.has_open_conflict && <span className="text-xs text-danger">{t("inConflict")}</span>}
          {fact.usable && <span className="text-xs text-success">{t("usable")}</span>}
        </div>
      </div>
      <ErrorBanner error={error} />
      {error instanceof ApiError && error.code === "stale_version" && <p className="text-sm text-danger">{t("staleVersion")}</p>}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button onClick={() => void run(api.patchFact(fact.id, fact.version, draft))}>{t("save")}</Button>
            <Button variant="outline" onClick={() => setEditing(false)}>{t("cancel")}</Button>
          </>
        ) : (
          <>
            {!fact.masked && <Button variant="outline" onClick={() => setEditing(true)}>{t("edit")}</Button>}
            {fact.masked && <Button variant="outline" onClick={() => void api.reveal(fact.id).then((r) => setShown(r.value), setError)}>{t("reveal")}</Button>}
            {fact.validation_status === "pending_review" && (
              <>
                <Button onClick={() => void run(api.validate(fact.id, fact.version, false))}>{t("validate")}</Button>
                <Button variant="outline" onClick={() => void run(api.reject(fact.id))}>{t("reject")}</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setOpen(!open)}>{t("history")} / {t("sources")}</Button>
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>{t("delete")}</Button>
          </>
        )}
      </div>
      {open && (
        <div className="rounded-md bg-muted p-2 text-xs">
          <Loading r={history} />
          <ul>{history.data?.map((h) => <li key={h.version}>v{h.version} · {h.reason} · {h.actor} · {h.masked ? t("masked") : String(h.value)} · {h.changed_at}</li>)}</ul>
          <ul className="mt-1">{sources.data?.map((s, i) => <li key={i}><a className="underline" href={`#/documents/${s.document_id}`}>{t("source")}</a> · p.{String(s.locator.page ?? "?")} · “{String(s.locator.quote ?? "")}”</li>)}</ul>
        </div>
      )}
      <ConfirmDialog open={confirmDelete} title={t("confirmDeleteTitle")} body={t("confirmDeleteBody")} onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); void api.deleteFact(fact.id).then(onChange, (e: unknown) => setError(e)); }} />
      <span className="sr-only">{err(error)}</span>
    </li>
  );
}

function AddFact({ category, onAdded }: { category: string; onAdded: () => void }) {
  const { t } = useI18n();
  const registry = useResource(() => api.registry(), []);
  const keys = (registry.data ?? []).filter((k) => k.category === category);
  const [key, setKey] = useState("");
  const [custom, setCustom] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<unknown>(null);
  const chosen = custom || key;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); api.createFact(chosen, value).then(() => { setValue(""); setCustom(""); onAdded(); }, setError); }}>
      <Field label={t("chooseKey")}>
        <select className={inputClass} value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">—</option>
          {keys.map((k) => <option key={k.key} value={k.key}>{k.key}{k.sensitive ? " 🔒" : ""}</option>)}
        </select>
      </Field>
      <Field label={t("customKey")}>
        <input className={inputClass} value={custom} placeholder={`${category}.name`} onChange={(e) => setCustom(e.target.value.toLowerCase())} />
      </Field>
      <Field label={t("value")}>
        <input className={inputClass} required value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button disabled={!chosen}>{t("add")}</Button>
      <ErrorBanner error={error} />
    </form>
  );
}

export function Profile({ section }: { section: ProfileCategory }) {
  const { t } = useI18n();
  const cats = PAGE_CATEGORIES[section];
  const facts = useResource(() => api.facts(), []);
  const mine = (facts.data?.items ?? []).filter((f) => cats.includes(f.category));
  // Entries that repeat (experiences, diplomas, certifications) are grouped by `group_id`.
  const groups = new Map<string, Fact[]>();
  for (const f of mine) groups.set(f.group_id ?? `__single:${f.key}`, [...(groups.get(f.group_id ?? `__single:${f.key}`) ?? []), f]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t(CATEGORY_TITLE[section])}</h1>
      <Loading r={facts} />
      {!facts.loading && mine.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {[...groups.entries()].map(([gid, items]) => (
        <Card key={gid} title={gid.startsWith("__single") ? undefined : items[0]?.key.split(".")[0]}>
          <ul>{items.map((f) => <FactRow key={f.id} fact={f} onChange={facts.reload} />)}</ul>
        </Card>
      ))}
      <Card title={t("addInformation")}>
        <AddFact category={cats[0] ?? section} onAdded={facts.reload} />
      </Card>
    </div>
  );
}
