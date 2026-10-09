import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CreateSaleDto } from "@pos/shared";

/**
 * Durable local queue of things the till did that the server hasn't seen
 * yet. Entries are written before the receipt prints and only leave the
 * queue as `synced` (pruned after a week) — a failed upload never deletes
 * a sale.
 */
export type OutboxState = "pending" | "syncing" | "synced" | "failed";

export interface OutboxEntry {
  /** Stable idempotency key, also sent to the server as `clientId`. */
  clientId: string;
  kind: "sale";
  payload: CreateSaleDto;
  createdAt: string;
  state: OutboxState;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
  serverId?: string;
}

export interface CatalogRecord {
  key: string;
  savedAt: string;
  data: unknown;
}

/** v1 queue, kept only to migrate entries saved by older builds. */
interface LegacyPendingSale {
  localId: string;
  dto: CreateSaleDto;
  createdAt: string;
  status: "pending" | "failed";
  error?: string;
}

interface PosOfflineDB extends DBSchema {
  "pending-sales": {
    key: string;
    value: LegacyPendingSale;
  };
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { "by-createdAt": string };
  };
  catalog: {
    key: string;
    value: CatalogRecord;
  };
}

export const SYNCED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase<PosOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<PosOfflineDB>("pos-offline", 2, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore("pending-sales", { keyPath: "localId" });
        }
        if (oldVersion < 2) {
          const outbox = db.createObjectStore("outbox", { keyPath: "clientId" });
          outbox.createIndex("by-createdAt", "createdAt");
          db.createObjectStore("catalog", { keyPath: "key" });

          const legacy = await tx.objectStore("pending-sales").getAll();
          for (const sale of legacy) {
            await outbox.put({
              clientId: sale.localId,
              kind: "sale",
              payload: { ...sale.dto, clientId: sale.localId },
              createdAt: sale.createdAt,
              state: sale.status,
              attempts: 0,
              lastError: sale.error,
            });
          }
          await tx.objectStore("pending-sales").clear();
        }
      },
    });
  }
  return dbPromise;
}

export async function addToOutbox(
  entry: Pick<OutboxEntry, "clientId" | "kind" | "payload" | "createdAt">,
): Promise<OutboxEntry> {
  const db = await getDb();
  const full: OutboxEntry = { ...entry, state: "pending", attempts: 0 };
  // "strict": the browser flushes this to disk before reporting success, so
  // a sale that showed "Saved offline" survives a power cut the next second.
  // (Chromium's default lets the OS hold the write in a cache first.)
  const tx = db.transaction("outbox", "readwrite", { durability: "strict" });
  await tx.store.put(full);
  await tx.done;
  return full;
}

/** Oldest first, so sales reach the server in the order they happened. */
export async function listOutbox(states?: OutboxState[]): Promise<OutboxEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("outbox", "by-createdAt");
  return states ? all.filter((e) => states.includes(e.state)) : all;
}

export async function updateOutbox(clientId: string, patch: Partial<OutboxEntry>): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  const entry = await tx.store.get(clientId);
  if (entry) await tx.store.put({ ...entry, ...patch, clientId });
  await tx.done;
}

export async function outboxCounts(): Promise<Record<OutboxState, number>> {
  const counts: Record<OutboxState, number> = { pending: 0, syncing: 0, synced: 0, failed: 0 };
  for (const entry of await listOutbox()) counts[entry.state]++;
  return counts;
}

/**
 * Housekeeping at the start of every sync run: an entry left `syncing` by a
 * crash or reload goes back to `pending` (safe: the server deduplicates by
 * clientId), and week-old `synced` entries are dropped.
 */
export async function tidyOutbox(now = Date.now()): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  for (const entry of await tx.store.getAll()) {
    if (entry.state === "syncing") {
      await tx.store.put({ ...entry, state: "pending" });
    } else if (entry.state === "synced" && entry.syncedAt && now - Date.parse(entry.syncedAt) > SYNCED_RETENTION_MS) {
      await tx.store.delete(entry.clientId);
    }
  }
  await tx.done;
}

export async function saveCatalog(key: string, data: unknown): Promise<void> {
  const db = await getDb();
  await db.put("catalog", { key, data, savedAt: new Date().toISOString() });
}

export async function loadCatalog<T>(key: string): Promise<{ data: T; savedAt: string } | null> {
  const db = await getDb();
  const record = await db.get("catalog", key);
  return record ? { data: record.data as T, savedAt: record.savedAt } : null;
}
