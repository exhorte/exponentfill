import { useCallback, useEffect, useState } from "react";
import type { FieldMatch } from "@exponent-fill/shared-types";
import { reclassifyUnknown } from "@exponent-fill/form-engine";
import { buildReview, selectFillItems, toMatchFields, type FieldState, type ReviewItem, type ReviewModel } from "@exponent-fill/vault-domain";
import { Button } from "@/components/ui/button";
import { appendAudit, buildEntry, clearAudit, markUndone, readAudit, type AuditEntry } from "@/lib/audit";
import { fillTab, hasUndo, undoTab, type FieldResult, type FillFailure, type UndoResult } from "@/lib/fill";
import { t, type MessageKey } from "@/lib/i18n";
import { getModelCall } from "@/lib/model";
import { scanActiveTab, type PageScan, type ScanFailure } from "@/lib/scan";
import { extensionStore, openVault } from "@/lib/vault/runtime";

const SCAN_FAILURE: Record<ScanFailure, MessageKey> = { no_tab: "pageNoTab", no_access: "pageNoAccess", invalid: "pageInvalid" };
const FILL_FAILURE: Record<FillFailure, MessageKey> = { no_tab: "pageNoTab", no_access: "pageNoAccess", invalid: "pageInvalid", page_changed: "fillPageChanged" };
const REASON: Record<string, MessageKey> = {
  pending_review: "reasonPending", open_conflict: "reasonConflict", no_matching_option: "reasonNoOption", sensitive_unconfirmed: "reasonSensitive",
  secret: "reasonSecret", consent_requires_user: "reasonConsent", nothing_in_vault: "reasonNothing", offline_nothing_cached: "reasonNothing",
  disabled: "reasonDisabled", read_only: "reasonReadOnly", file_not_supported: "reasonFile",
};
const STATE: Record<FieldState, MessageKey> = { known: "stateKnown", inferred: "stateInferred", conflict: "stateConflict", missing: "stateMissing", empty: "stateEmpty", skipped: "stateSkipped" };
const TRUST: Record<string, MessageKey> = { declared: "trustDeclared", extracted: "trustExtracted", verified: "trustVerified", inferred: "trustInferred" };
const STATUS: Record<FieldResult["status"], MessageKey> = { written: "fillStatusWritten", "already-correct": "fillStatusAlready", failed: "fillStatusFailed", refused: "fillStatusRefused" };
const CODE: Record<string, MessageKey> = {
  not_found: "codeNotFound", secret: "codeSecret", commit_control: "codeCommit", no_option: "codeNoOption", ambiguous: "codeAmbiguous", maxlength: "codeMaxlength",
  invalid_value: "codeInvalid", readback_mismatch: "codeReadback", no_popup_options: "codeNoOption", disabled: "reasonDisabled", read_only: "reasonReadOnly", file: "reasonFile",
};
const ORDER: FieldState[] = ["known", "inferred", "conflict", "missing", "empty"];

interface Panel {
  phase: "idle" | "scanning" | "filling" | "done";
  failure?: MessageKey;
  scan?: PageScan;
  url?: string;
  tabId?: number;
  scanId?: string;
  matches?: FieldMatch[];
  review?: ReviewModel;
  checked: ReadonlySet<string>;
  offline?: boolean;
  denied?: boolean;
  results?: FieldResult[];
  undone?: UndoResult[];
  canUndo?: boolean;
  newFields?: boolean;
  entryId?: string;
}

/**
 * Scan the active tab, ask the vault what it could propose, REVIEW, then write only what the user ticked — and read every
 * value back. Nothing is ever submitted: there is no such command (ADR-023).
 */
export function PagePanel() {
  const [s, setS] = useState<Panel>({ phase: "idle", checked: new Set() });
  const [history, setHistory] = useState<AuditEntry[]>([]);

  useEffect(() => {
    void readAudit(extensionStore).then(setHistory);
  }, []);

  const run = useCallback(async () => {
    setS({ phase: "scanning", checked: new Set() });
    const res = await scanActiveTab();
    if (!res.ok) return setS({ phase: "done", failure: SCAN_FAILURE[res.reason], checked: new Set() });
    // Optional second pass: a model reclassifies fields the taxonomy left unknown (no model is wired yet: see lib/model.ts).
    const call = await getModelCall();
    const fields = call ? (await reclassifyUnknown(res.scan.fields, call)).fields : res.scan.fields;
    const scan = { ...res.scan, fields };
    const vault = await openVault();
    const out = vault ? await vault.match(toMatchFields(fields)).catch(() => null) : null;
    const matches = out?.matches ?? [];
    const review = buildReview(fields, matches);
    setS({
      phase: "done", scan, url: res.url, tabId: res.tabId, scanId: res.scanId, matches, review, offline: out?.offline, denied: out?.unauthorized,
      checked: new Set(review.items.filter((i) => i.defaultChecked).map((i) => i.fieldId)), canUndo: await hasUndo(res.tabId),
    });
  }, []);

  const toggle = (id: string) =>
    setS((p) => {
      const next = new Set(p.checked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...p, checked: next };
    });

  const fill = async () => {
    if (!s.review || !s.tabId || !s.url || !s.scanId) return;
    const items = selectFillItems(s.review, s.checked);
    if (items.length === 0) return;
    setS((p) => ({ ...p, phase: "filling", results: undefined, undone: undefined, newFields: false }));
    const out = await fillTab(s.tabId, s.url, s.scanId, items);
    if (!out.ok) return setS((p) => ({ ...p, phase: "done", failure: FILL_FAILURE[out.reason] }));
    const entry = buildEntry(new URL(s.url).host, s.review.items, s.checked, out.results, new Date(), crypto.randomUUID());
    setHistory(await appendAudit(extensionStore, entry));
    // A filled field can reveal others (conditional fields): look again, without changing anything.
    const again = await scanActiveTab();
    setS((p) => ({ ...p, phase: "done", failure: undefined, results: out.results, entryId: entry.id, canUndo: out.results.some((r) => r.status === "written"), newFields: again.ok && s.scan ? again.scan.fields.length > s.scan.fields.length : false }));
  };

  const undo = async () => {
    if (!s.tabId) return;
    const out = await undoTab(s.tabId);
    if (!out.ok) return setS((p) => ({ ...p, failure: FILL_FAILURE[out.reason] }));
    if (s.entryId) setHistory(await markUndone(extensionStore, s.entryId));
    setS((p) => ({ ...p, undone: out.results, results: undefined, canUndo: false }));
  };

  const review = s.review;
  const chosen = review ? selectFillItems(review, s.checked).length : 0;
  const labelOf = new Map((review?.items ?? []).map((i) => [i.fieldId, i.label]));

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label={t("pageTitle")}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("pageTitle")}</h2>
        <Button size="sm" onClick={() => void run()} disabled={s.phase === "scanning" || s.phase === "filling"}>{s.phase === "scanning" ? t("pageScanning") : t("pageScan")}</Button>
      </div>
      {s.failure && <p role="alert" className="text-sm text-danger">{t(s.failure)}</p>}
      {s.denied && <p role="alert" className="text-sm text-danger">{t("vaultUnauthorized")}</p>}
      {s.offline && <p role="status" className="text-xs text-muted-foreground">{t("matchOffline")}</p>}

      {s.scan && review && (
        <>
          <p className="text-xs text-muted-foreground">
            {s.scan.fields.length} {t("pageFields")} · {review.counts.known} {t("stateKnown")} · {review.counts.inferred} {t("stateInferred")} · {review.counts.conflict} {t("stateConflict")} · {review.counts.missing} {t("stateMissing")} · {s.scan.buttons.filter((b) => b.intent === "commit").length} {t("pageCommitButtons")}
          </p>
          {s.scan.fields.length === 0 && <p className="text-sm">{t("pageNoFields")}</p>}

          {review.toComplete.length > 0 && (
            <div className="rounded-md border border-border bg-muted p-2" aria-label={t("reviewToComplete")}>
              <p className="text-xs font-medium">{t("reviewToComplete")}</p>
              <ul className="list-disc pl-4 text-xs">{review.toComplete.map((i) => <li key={i.fieldId}>{i.label}</li>)}</ul>
            </div>
          )}

          <ul className="flex flex-col gap-1 text-sm">
            {ORDER.flatMap((st) => review.items.filter((i) => i.state === st)).map((i) => <Row key={i.fieldId} item={i} checked={s.checked.has(i.fieldId)} onToggle={() => toggle(i.fieldId)} />)}
          </ul>
          {review.counts.skipped > 0 && <p className="text-xs text-muted-foreground">{review.counts.skipped} {t("stateSkipped")}</p>}

          <p className="text-xs text-muted-foreground">{t("reviewApprovalNote")}</p>
          <Button onClick={() => void fill()} disabled={chosen === 0 || s.phase === "filling"}>{s.phase === "filling" ? t("fillRunning") : `${t("fillRun")} (${chosen})`}</Button>
          <p className="text-xs text-muted-foreground">{t("fillNote")}</p>
        </>
      )}

      {s.results && (
        <div className="flex flex-col gap-1" aria-label={t("fillResults")}>
          <h3 className="text-xs font-semibold">{t("fillResults")}</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {s.results.map((r) => (
              <li key={r.fieldId} className={r.status === "failed" ? "text-danger" : undefined}>
                <b>{labelOf.get(r.fieldId) ?? r.fieldId}</b> — {t(STATUS[r.status])}{r.status === "failed" || r.status === "refused" ? ` (${t(CODE[r.code] ?? "codeOther")})` : ""}
              </li>
            ))}
          </ul>
          {s.newFields && <p role="status" className="text-xs">{t("fillNewFields")}</p>}
        </div>
      )}
      {s.undone && (
        <ul className="flex flex-col gap-1 text-xs" aria-label={t("fillUndo")}>
          {s.undone.map((r) => <li key={r.fieldId} className={r.status === "failed" ? "text-danger" : undefined}><b>{labelOf.get(r.fieldId) ?? r.fieldId}</b> — {r.status === "restored" ? t("fillRestored") : t("fillRestoreFailed")}</li>)}
        </ul>
      )}
      {s.canUndo && (
        <div className="flex flex-col gap-1">
          <Button variant="outline" size="sm" onClick={() => void undo()}>{t("fillUndo")}</Button>
          <p className="text-xs text-muted-foreground">{t("fillUndoNote")}</p>
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer font-medium">{t("auditTitle")} ({history.length})</summary>
        <p className="text-muted-foreground">{t("auditNoValues")}</p>
        {history.length === 0 ? <p>{t("auditEmpty")}</p> : (
          <ul className="flex flex-col gap-1">
            {history.slice(0, 20).map((e) => (
              <li key={e.id}>{new Date(e.ts).toLocaleString()} · {e.host} · {e.written} {t("fillStatusWritten")} · {e.failed + e.refused} {t("fillStatusFailed")}{e.undone ? ` · ${t("auditUndone")}` : ""}</li>
            ))}
          </ul>
        )}
        {history.length > 0 && <Button variant="ghost" size="sm" onClick={() => void clearAudit(extensionStore).then(() => setHistory([]))}>{t("auditClear")}</Button>}
      </details>
    </section>
  );
}

function Row({ item, checked, onToggle }: { item: ReviewItem; checked: boolean; onToggle: () => void }) {
  const id = `ef-${item.fieldId}`;
  return (
    <li className="flex flex-col rounded-md border border-border p-2">
      <div className="flex items-start gap-2">
        <input id={id} type="checkbox" checked={checked} disabled={!item.fillable} onChange={onToggle} className="mt-1" />
        <label htmlFor={id} className="flex flex-1 flex-col">
          <span className="font-medium">{item.label}{item.required ? " *" : ""}</span>
          <span className="text-xs text-muted-foreground">{item.kind} · {item.semanticType} · {t(STATE[item.state])}{item.alreadyFilled ? ` · ${t("reviewAlreadyFilled")}` : ""}</span>
          {item.value !== null && <span className="text-xs">“{typeof item.value === "boolean" ? (item.value ? "✓" : "✗") : item.value}”{item.trust ? ` · ${t(TRUST[item.trust] ?? "trustDeclared")}` : ""}{item.sourcesCount > 0 ? ` · ${item.sourcesCount} src` : ""}</span>}
          {item.state !== "known" && <span className="text-xs text-muted-foreground">{t(REASON[item.reason] ?? "reasonOther")}</span>}
        </label>
      </div>
    </li>
  );
}
