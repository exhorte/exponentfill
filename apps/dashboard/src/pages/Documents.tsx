import { useRef, useState } from "react";
import { api } from "../api";
import { Button, Card, ConfirmDialog, ErrorBanner, go, Loading, TrustBadge, useI18n, useResource } from "../lib";

export function Documents() {
  const { t } = useI18n();
  const docs = useResource(() => api.documents(), []);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [over, setOver] = useState(false);
  const upload = (file: File | undefined) => {
    if (!file) return;
    api.upload(file).then((d) => go(`/documents/${d.id}`), (e: unknown) => setError(e));
  };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("navDocuments")}</h1>
      <ErrorBanner error={error} />
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm ${over ? "bg-muted" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]); }}
      >
        <p>{t("dropHere")}</p>
        <input ref={input} type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg" className="mt-2" aria-label={t("uploadDocument")} onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      <Loading r={docs} />
      {!docs.loading && docs.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <ul className="flex flex-col gap-2">
        {docs.data?.map((d) => (
          <li key={d.id} className="rounded-md border border-border p-3">
            <a className="font-medium underline" href={`#/documents/${d.id}`}>{d.filename}</a>
            <div className="text-xs text-muted-foreground">{t("docType")}: {d.doc_type} ({Math.round(d.doc_type_confidence * 100)}%) · {t("docStatus")}: {d.status} · v{d.version}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocumentDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const doc = useResource(() => api.document(id), [id]);
  const text = useResource(() => api.documentText(id), [id]);
  const facts = useResource(() => api.documentFacts(id), [id]);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState(false);
  const [policy, setPolicy] = useState("detach");
  const replace = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <a className="text-sm underline" href="#/documents">← {t("navDocuments")}</a>
      <Loading r={doc} />
      <ErrorBanner error={error} />
      {doc.data && (
        <>
          <h1 className="text-xl font-semibold">{doc.data.filename}</h1>
          <p className="text-sm text-muted-foreground">{doc.data.doc_type} · {doc.data.status}{doc.data.status_reason ? ` (${doc.data.status_reason})` : ""} · {doc.data.page_count} p. · {doc.data.language ?? "?"}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => replace.current?.click()}>{t("replaceFile")}</Button>
            <input ref={replace} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) api.replaceDocument(id, f).then((n) => go(`/documents/${n.id}`), (er: unknown) => setError(er)); }} />
            <Button variant="danger" onClick={() => setConfirm(true)}>{t("deleteDocument")}</Button>
          </div>
        </>
      )}
      <Card title={t("factsFromDocument")}>
        <Loading r={facts} />
        <ul className="flex flex-col gap-1 text-sm">
          {facts.data?.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span>{f.key}: <b>{f.masked ? t("masked") : String(f.value)}</b></span>
              <TrustBadge fact={f} />
            </li>
          ))}
        </ul>
        {facts.data && facts.data.length > 0 && <a className="mt-2 inline-block text-sm underline" href="#/review">{t("navReview")} →</a>}
      </Card>
      <Card title={t("extractedText")}>
        <Loading r={text} />
        {text.data && (text.data.text ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{text.data.text}</pre> : <p className="text-sm text-muted-foreground">{t("noText")}</p>)}
      </Card>
      <ConfirmDialog open={confirm} title={t("deleteDocument")} body={`${t("factsPolicy")} ${t(policy === "keep" ? "policyKeep" : policy === "delete" ? "policyDelete" : "policyDetach")}`}
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); api.deleteDocument(id, policy).then(() => go("/documents"), (e: unknown) => setError(e)); }} />
      {confirm && (
        <select aria-label={t("factsPolicy")} className="rounded-md border border-border p-1 text-sm" value={policy} onChange={(e) => setPolicy(e.target.value)}>
          <option value="keep">{t("policyKeep")}</option>
          <option value="detach">{t("policyDetach")}</option>
          <option value="delete">{t("policyDelete")}</option>
        </select>
      )}
    </div>
  );
}
