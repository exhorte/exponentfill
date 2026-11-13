import type { FieldMatch, MatchField } from "@exponent-fill/shared-types";
import { afterPush, applySync, emptyCache, enqueue, offlineMatch, type CacheState, type Proposal } from "@exponent-fill/vault-domain";
import { VaultError, type VaultClient } from "./client";

/** Persistence the service needs (browser.storage.local in the extension, a Map in tests). */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

const CACHE_KEY = "ef.vault.cache";
const QUEUE_KEY = "ef.vault.queue";

export interface MatchResult {
  matches: FieldMatch[];
  /** True when the answer comes from the local cache because the service could not be reached. */
  offline: boolean;
  /** True when the device token was refused: the user must reconnect. */
  unauthorized: boolean;
}

/**
 * Shared referential, seen from the extension (ADR-019): the server is the source of truth; this keeps a cache of the
 * USABLE and NON-SENSITIVE facts and a queue of proposals made offline.
 */
export class VaultService {
  constructor(
    private readonly client: VaultClient,
    private readonly store: KeyValueStore,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async cache(): Promise<CacheState> {
    const raw = (await this.store.get(CACHE_KEY)) as CacheState | undefined;
    return raw && typeof raw.seq === "number" && raw.facts ? raw : emptyCache();
  }

  async queue(): Promise<Proposal[]> {
    const raw = await this.store.get(QUEUE_KEY);
    return Array.isArray(raw) ? (raw as Proposal[]) : [];
  }

  /** Pulls everything changed since the last sync (tombstones included) and updates the cache. */
  async refresh(): Promise<CacheState> {
    let state = await this.cache();
    for (let guard = 0; guard < 20; guard++) {
      const out = await this.client.sync(state.seq);
      state = applySync(state, out);
      if (!out.more) break;
    }
    await this.store.set(CACHE_KEY, state);
    return state;
  }

  /** Online: the server decides (fill / suggest / none). Offline: the cache answers, conservatively (fill or nothing). */
  async match(fields: readonly MatchField[], opts: { revealSensitive?: boolean } = {}): Promise<MatchResult> {
    try {
      const out = await this.client.match(fields, opts.revealSensitive ?? false);
      return { matches: out.matches, offline: false, unauthorized: false };
    } catch (e) {
      if (e instanceof VaultError && e.kind === "unauthorized") return { matches: [], offline: false, unauthorized: true };
      if (e instanceof VaultError && (e.kind === "network" || e.kind === "timeout")) {
        return { matches: offlineMatch(await this.cache(), fields), offline: true, unauthorized: false };
      }
      throw e;
    }
  }

  /** The agent PROPOSES a fact learned from a form. It enters the vault only after the user approves it (OB-14 spec). */
  async propose(key: string, value: string, groupId?: string | null): Promise<number> {
    const q = enqueue(await this.queue(), { key, value, group_id: groupId ?? null }, this.newId);
    await this.store.set(QUEUE_KEY, q);
    return q.length;
  }

  /** Sends queued proposals (idempotent by client id). Returns how many are still waiting. */
  async flush(): Promise<number> {
    const q = await this.queue();
    if (q.length === 0) return 0;
    try {
      const out = await this.client.push(q);
      const rest = afterPush(q, out.results);
      await this.store.set(QUEUE_KEY, rest);
      return rest.length;
    } catch (e) {
      if (e instanceof VaultError && (e.kind === "network" || e.kind === "timeout")) return q.length; // try again later
      throw e;
    }
  }

  async clear(): Promise<void> {
    await this.store.remove(CACHE_KEY);
    await this.store.remove(QUEUE_KEY);
  }
}
