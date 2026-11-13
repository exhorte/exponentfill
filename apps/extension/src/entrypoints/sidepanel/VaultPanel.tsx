import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { clearToken, extensionStore, getToken, openVault, saveToken } from "@/lib/vault/runtime";

/** Connection of this device to the user's vault (device token created in the dashboard). */
export function VaultPanel() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<{ cached: number; queued: number } | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    setDenied(false);
    const vault = await openVault();
    setConnected(vault !== null);
    if (!vault) return;
    try {
      const cache = await vault.refresh();
      await vault.flush();
      setInfo({ cached: Object.keys(cache.facts).length, queued: (await vault.queue()).length });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("unauthorized")) setDenied(true);
      setInfo({ cached: Object.keys((await vault.cache()).facts).length, queued: (await vault.queue()).length });
    }
  }, []);

  useEffect(() => {
    void getToken().then((tok) => setConnected(tok !== null));
    void refresh();
  }, [refresh]);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-3" aria-label={t("vaultTitle")}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("vaultTitle")}</span>
        <span className={connected ? "font-medium text-success" : "font-medium"}>{connected ? t("vaultConnected") : t("vaultNotConnected")}</span>
      </div>
      {denied && <p role="alert" className="text-sm text-danger">{t("vaultUnauthorized")}</p>}
      {connected === false && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveToken(token).then(() => { setToken(""); return refresh(); });
          }}
        >
          <p className="text-xs text-muted-foreground">{t("vaultTokenHint")}</p>
          <input aria-label={t("vaultTokenLabel")} type="password" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
          <Button size="sm">{t("vaultSave")}</Button>
        </form>
      )}
      {connected && (
        <>
          {info && <p className="text-xs text-muted-foreground">{info.cached} {t("vaultCached")} · {info.queued} {t("vaultQueued")}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()}>{t("vaultSync")}</Button>
            <Button variant="outline" size="sm" onClick={() => void clearToken().then(() => extensionStore.remove("ef.vault.cache")).then(() => { setInfo(null); return refresh(); })}>{t("vaultDisconnect")}</Button>
          </div>
        </>
      )}
    </section>
  );
}
