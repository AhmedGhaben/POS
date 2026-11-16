import type { StoreSyncStatus, TillSyncStatus } from "@pos/shared";

/**
 * "Lojas agora": a till's and a store's connection status, from what the
 * server last heard. Pure functions, no I/O.
 *
 * The server can't see a till while it's offline: it only knows when it last
 * heard from it, what it reported then, and whether it has a shift open.
 */

/** Heard from within this long: online, or syncing if it had sales to upload. */
export const SEEN_RECENTLY_MS = 2 * 60_000;
/** Not heard from for longer than this: offline (shift open) or inactive. */
export const GONE_AFTER_MS = 3 * 60_000;

export interface TillFacts {
  /** Server time it was last heard from, or null if never. */
  lastSeenAt: Date | null;
  pendingCountReported: number;
  hasOpenShift: boolean;
}

/** What the till was doing when it was last heard from. */
function whenLastSeen(till: TillFacts): TillSyncStatus {
  return till.pendingCountReported > 0 ? "syncing" : "online";
}

/**
 * A till's status.
 *
 * Between SEEN_RECENTLY_MS and GONE_AFTER_MS the till keeps its previous
 * state, so it doesn't flicker. That previous state can only be the one it
 * had when last heard from (online or syncing): to have been offline or
 * inactive it would need to have gone unheard for longer than GONE_AFTER_MS,
 * and the time it was last heard from only moves forward. So no history is
 * stored: within GONE_AFTER_MS the last report stands.
 */
export function tillStatus(till: TillFacts, now: Date): TillSyncStatus {
  if (!till.lastSeenAt) return "never";
  const age = now.getTime() - till.lastSeenAt.getTime();
  if (age <= GONE_AFTER_MS) return whenLastSeen(till);
  return till.hasOpenShift ? "offline" : "inactive";
}

/** Worst first: the store shows the first of these any of its tills has. */
export const STATUS_SEVERITY: TillSyncStatus[] = ["offline", "syncing", "online", "inactive", "never"];

/**
 * A store's status: the worst of its tills. Without a Windows till, the
 * server can't know the connection: "browser" if a browser shift is open
 * there, otherwise "noTill". Neither is ever offline.
 */
export function storeStatus(tills: TillSyncStatus[], hasOpenBrowserShift: boolean): StoreSyncStatus {
  if (tills.length === 0) return hasOpenBrowserShift ? "browser" : "noTill";
  return STATUS_SEVERITY.find((s) => tills.includes(s))!;
}

/** The later of two times (a till is heard from by heartbeat and by uploads). */
export function latest(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}
