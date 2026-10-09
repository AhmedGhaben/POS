import type { SaleDto } from "@pos/shared";
import { apiClient, ApiError, isRetryableError, onServerStatus } from "@/lib/api-client";
import { listOutbox, tidyOutbox, updateOutbox, type OutboxEntry } from "@/lib/offline-db";
import { desktopLog } from "@/features/desktop/bridge";
import { useOfflineStore, type ServerState } from "./offline-store";
import { refreshCatalog } from "./catalog";

export interface SyncResult {
  synced: number;
  failed: number;
  /** Stopped early because the server couldn't be reached or the session ended. */
  interrupted: boolean;
}

export interface DrainDeps {
  list: () => Promise<OutboxEntry[]>;
  update: (clientId: string, patch: Partial<OutboxEntry>) => Promise<void>;
  upload: (entry: OutboxEntry) => Promise<{ id: string }>;
  now?: () => Date;
}

/**
 * Uploads pending entries oldest first. A server that can't be reached,
 * errors, or wants a fresh login stops the run with the entry left
 * `pending`, so later sales never overtake it. A rejection (4xx: the server
 * understood and said no) marks just that entry `failed` for a manager to
 * review, and the run carries on.
 */
export async function drainOutbox(deps: DrainDeps): Promise<SyncResult> {
  const now = deps.now ?? (() => new Date());
  const result: SyncResult = { synced: 0, failed: 0, interrupted: false };

  for (const entry of await deps.list()) {
    if (entry.state !== "pending") continue;
    await deps.update(entry.clientId, { state: "syncing", attempts: entry.attempts + 1 });
    try {
      const saved = await deps.upload(entry);
      await deps.update(entry.clientId, {
        state: "synced",
        syncedAt: now().toISOString(),
        serverId: saved.id,
        lastError: undefined,
      });
      result.synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRetryableError(err) || (err instanceof ApiError && err.status === 401)) {
        await deps.update(entry.clientId, { state: "pending", lastError: message });
        result.interrupted = true;
        break;
      }
      await deps.update(entry.clientId, { state: "failed", lastError: message });
      result.failed++;
    }
  }
  return result;
}

function uploadEntry(entry: OutboxEntry) {
  return apiClient.post<SaleDto>("/sales", entry.payload, { timeoutMs: 15_000 });
}

let running: Promise<SyncResult> | null = null;

/** Runs one sync pass; concurrent callers share the same run. */
export function syncOutbox(): Promise<SyncResult> {
  if (!running) {
    const store = useOfflineStore.getState();
    store.setSyncing(true);
    running = (async () => {
      await tidyOutbox();
      const result = await drainOutbox({ list: () => listOutbox(), update: updateOutbox, upload: uploadEntry });
      if (result.synced || result.failed || result.interrupted) {
        desktopLog(
          result.failed || result.interrupted ? "warn" : "info",
          `[sync] synced ${result.synced}, failed ${result.failed}${result.interrupted ? ", stopped: server unreachable" : ""}`,
        );
      }
      if (!result.interrupted) useOfflineStore.getState().setLastSyncAt(new Date().toISOString());
      return result;
    })().finally(async () => {
      running = null;
      useOfflineStore.getState().setSyncing(false);
      await useOfflineStore.getState().refreshPendingCount();
    });
  }
  return running;
}

/** Retry a failed entry (e.g. after a manager fixed the product). */
export async function retryFailed(clientId: string) {
  await updateOutbox(clientId, { state: "pending", lastError: undefined });
  await useOfflineStore.getState().refreshPendingCount();
  return syncOutbox();
}

async function serverAnswers(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

const BASE_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 5 * 60_000;

/**
 * App-wide background sync, independent of which page is open. Runs at
 * start, then checks the server every 30 s (backing off to 5 min only while
 * the server answers but uploads keep erroring), when the browser comes back
 * online, and the moment any request shows the server is back. Returns a
 * stop function.
 */
export function startSyncEngine(): () => void {
  const store = useOfflineStore.getState;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = BASE_INTERVAL_MS;
  let lastLogged: ServerState = store().server;

  function setServer(state: ServerState) {
    store().setServer(state);
    if (state !== lastLogged && state !== "unknown") {
      desktopLog(state === "up" ? "info" : "warn", `[sync] server ${state === "up" ? "reachable" : "unreachable"}`);
      lastLogged = state;
    }
  }

  async function tick() {
    if (stopped) return;
    clearTimeout(timer);
    await store().refreshPendingCount();

    const reachable = store().internet && (await serverAnswers());
    setServer(reachable ? "up" : "down");
    if (reachable) {
      const result = await syncOutbox().catch(() => null);
      await refreshCatalog().catch(() => {});
      delay = result?.interrupted ? Math.min(delay * 2, MAX_INTERVAL_MS) : BASE_INTERVAL_MS;
    } else {
      // A health check is cheap: keep looking every 30 s so sales go up
      // soon after the server is back.
      delay = BASE_INTERVAL_MS;
    }
    if (!stopped) timer = setTimeout(tick, delay);
  }

  function handleOnline() {
    store().setInternet(true);
    delay = BASE_INTERVAL_MS;
    void tick();
  }
  function handleOffline() {
    store().setInternet(false);
  }

  const stopListening = onServerStatus((reachable) => {
    const wasDown = store().server === "down";
    setServer(reachable ? "up" : "down");
    // Some request just got through after an outage: sync now, not in 5 min.
    if (reachable && wasDown) {
      delay = BASE_INTERVAL_MS;
      setTimeout(() => void tick(), 0);
    }
  });

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  void tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    stopListening();
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
