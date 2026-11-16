import { desktop, useDeviceStore } from "@/features/desktop/bridge";
import { onSyncPassEnd, type SyncResult } from "./sync";
import { useOfflineStore } from "./offline-store";

/**
 * The till's heartbeat ("Lojas agora", docs/brand/SYNC_STATUS_SPEC.md):
 * while it's online, a registered Windows till tells the server how many
 * sales are waiting and whether it's up to date, so the owner's dashboard
 * can show each store's connection.
 *
 * It runs with the app, not with a session: no one need be signed in.
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

/** The computer has a network; whether the server answers is the request's business. */
function internetUp(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** A registered Windows till (it sends its key with every request). */
function registeredTill(): boolean {
  return !!desktop && !!useDeviceStore.getState().terminal;
}

/** The till's main window: not the customer display, which runs the same app on a second screen. */
function mainWindow(): boolean {
  return typeof window === "undefined" || !window.location?.pathname?.startsWith("/customer-display");
}

let appVersion: string | undefined;

/**
 * Starts the heartbeat for as long as the app runs; returns a stop function.
 * It doesn't need anyone signed in: the till authenticates with its own key
 * (X-Terminal-Key), so a till left on the PIN screen between cashiers, with
 * its shift open, still reports itself online. Does nothing in a browser,
 * on a till that isn't registered, or in the customer display window.
 */
export function startHeartbeat(): () => void {
  if (!mainWindow()) return () => {};
  let stopped = false;
  let lastSentAt: number | null = null;
  // Until a pass has run, don't claim the till is up to date.
  let lastPassClean = false;

  if (desktop) {
    // Which till this is (set up on This device); the sign-in pages load it too.
    if (!useDeviceStore.getState().loaded) void useDeviceStore.getState().load().catch(() => {});
    if (!appVersion) {
      void desktop.app
        .info()
        .then((info) => (appVersion = info.version))
        .catch(() => {});
    }
  }

  async function send() {
    if (stopped || !registeredTill() || !internetUp()) return;
    lastSentAt = Date.now();
    // The queue is per till, not per person: read its size even with nobody signed in.
    await useOfflineStore
      .getState()
      .refreshPendingCount()
      .catch(() => {});
    const { pendingCount, failedCount } = useOfflineStore.getState();
    const body: HeartbeatBody = {
      pendingCount,
      // Up to date: the last pass ended clean and nothing has been queued since.
      syncedOk: lastPassClean && pendingCount === 0 && failedCount === 0,
      ...(appVersion ? { appVersion } : {}),
    };
    // Not awaited by anyone; errors and timeouts are dropped (the next one is in a minute).
    await fetch("/api/terminals/me/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    }).catch(() => {});
  }

  const stopPasses = onSyncPassEnd((result, pendingBefore) => {
    const { pendingCount, failedCount } = useOfflineStore.getState();
    lastPassClean = passWasClean(result, pendingCount, failedCount);
    if (reportAfterPass(result, pendingBefore, pendingCount)) void send();
  });

  // Back online (or the server is back, as the sync engine saw it): report at once.
  const stopReconnect = useOfflineStore.subscribe((state, prev) => {
    const nowOnline = state.internet && state.server === "up";
    const wasOnline = prev.internet && prev.server === "up";
    if (nowOnline && !wasOnline) void send();
  });
  const handleOnline = () => void send();
  if (typeof window !== "undefined") window.addEventListener?.("online", handleOnline);

  const timer = setInterval(() => {
    if (heartbeatDue(lastSentAt, Date.now())) void send();
  }, CHECK_EVERY_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    stopPasses();
    stopReconnect();
    if (typeof window !== "undefined") window.removeEventListener?.("online", handleOnline);
  };
}
