import { desktop, useDeviceStore } from "@/features/desktop/bridge";
import { onSyncPassEnd, type SyncResult } from "./sync";
import { useOfflineStore } from "./offline-store";

/**
 * The till's heartbeat ("Lojas agora", docs/brand/SYNC_STATUS_SPEC.md):
 * while it's online, a registered Windows till tells the server how many
 * sales are waiting and whether it's up to date, so the owner's dashboard
 * can show each store's connection.
 *
 * Fire-and-forget: one small request with a 5 s timeout, never retried,
 * never awaited by anything else. If it fails, the till carries on exactly
 * as before. It reads the sync state; it never changes it.
 */

export const HEARTBEAT_EVERY_MS = 60_000;
export const HEARTBEAT_TIMEOUT_MS = 5_000;
const CHECK_EVERY_MS = 15_000;

export interface HeartbeatBody {
  pendingCount: number;
  syncedOk: boolean;
  appVersion?: string;
}

/** Up to date: the last pass ended with nothing pending and nothing failed. */
export function passWasClean(result: SyncResult | null, pendingCount: number, failedCount: number): boolean {
  return !!result && !result.interrupted && pendingCount === 0 && failedCount === 0;
}

/** After a pass: report at once only if it uploaded something or the count moved. */
export function reportAfterPass(result: SyncResult | null, pendingBefore: number, pendingAfter: number): boolean {
  return (result?.synced ?? 0) > 0 || pendingAfter !== pendingBefore;
}

/** The regular heartbeat: once a minute (anything sent in between counts). */
export function heartbeatDue(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= HEARTBEAT_EVERY_MS;
}

function online(): boolean {
  const { internet, server } = useOfflineStore.getState();
  return internet && server === "up";
}

/** A registered Windows till (it sends its key with every request). */
function registeredTill(): boolean {
  return !!desktop && !!useDeviceStore.getState().terminal;
}

let appVersion: string | undefined;

/**
 * Starts the heartbeat for this session; returns a stop function. Does
 * nothing in a browser or on a till that isn't registered.
 */
export function startHeartbeat(): () => void {
  let stopped = false;
  let lastSentAt: number | null = null;
  // Until a pass has run, don't claim the till is up to date.
  let lastPassClean = false;

  if (desktop && !appVersion) {
    void desktop.app
      .info()
      .then((info) => (appVersion = info.version))
      .catch(() => {});
  }

  function send() {
    if (stopped || !registeredTill() || !online()) return;
    const { pendingCount } = useOfflineStore.getState();
    const body: HeartbeatBody = { pendingCount, syncedOk: lastPassClean, ...(appVersion ? { appVersion } : {}) };
    lastSentAt = Date.now();
    // Not awaited by anyone; errors and timeouts are dropped (the next one is in a minute).
    void fetch("/api/terminals/me/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    }).catch(() => {});
  }

  const stopPasses = onSyncPassEnd((result, pendingBefore) => {
    const { pendingCount, failedCount } = useOfflineStore.getState();
    lastPassClean = passWasClean(result, pendingCount, failedCount);
    if (reportAfterPass(result, pendingBefore, pendingCount)) send();
  });

  // Back online (or the server is back): report at once.
  const stopReconnect = useOfflineStore.subscribe((state, prev) => {
    const nowOnline = state.internet && state.server === "up";
    const wasOnline = prev.internet && prev.server === "up";
    if (nowOnline && !wasOnline) send();
  });

  const timer = setInterval(() => {
    if (heartbeatDue(lastSentAt, Date.now())) send();
  }, CHECK_EVERY_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    stopPasses();
    stopReconnect();
  };
}
