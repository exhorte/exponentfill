import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { ExtensionResponseSchema, type ExtensionResponse } from "@exponent-fill/shared-types";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/lib/i18n";
import { PagePanel } from "./PagePanel";
import { VaultPanel } from "./VaultPanel";

type State = { kind: "checking" } | { kind: "done"; response: ExtensionResponse };

async function requestHealth(): Promise<ExtensionResponse> {
  try {
    const raw: unknown = await browser.runtime.sendMessage({ type: "health.check" });
    const parsed = ExtensionResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data : { ok: false, error: "invalid_response" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

const ERROR_LABELS: Record<string, MessageKey> = {
  unreachable: "backendUnreachable",
  timeout: "backendTimeout",
  invalid_response: "backendInvalid",
  rejected: "backendRejected",
};

const DATABASE_LABELS: Record<string, MessageKey> = {
  ok: "databaseOk",
  unconfigured: "databaseUnconfigured",
  unreachable: "databaseUnreachable",
};

export function App() {
  const [state, setState] = useState<State>({ kind: "checking" });

  const check = useCallback(async () => {
    setState({ kind: "checking" });
    setState({ kind: "done", response: await requestHealth() });
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  let backendText: string = t("backendChecking");
  let backendTone = "text-muted-foreground";
  let databaseText: string | null = null;

  if (state.kind === "done") {
    if (state.response.ok) {
      backendText = t("backendOk");
      backendTone = "text-success";
      databaseText = t(DATABASE_LABELS[state.response.health.database] ?? "databaseUnreachable");
    } else {
      backendText = t(ERROR_LABELS[state.response.error] ?? "backendUnreachable");
      backendTone = "text-danger";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">{t("appTitle")}</h1>

      <section
        className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-3"
        aria-label={t("backendLabel")}
      >
        <div role="status" aria-live="polite" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("backendLabel")}</span>
          <span className={`font-medium ${backendTone}`}>{backendText}</span>
        </div>
        {databaseText !== null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("databaseLabel")}</span>
            <span className="font-medium">{databaseText}</span>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => void check()} disabled={state.kind === "checking"}>
          {t("retry")}
        </Button>
      </section>

      <VaultPanel />
      <PagePanel />
    </main>
  );
}
