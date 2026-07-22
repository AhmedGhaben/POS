import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CreateSaleDto } from "@pos/shared";

export interface PendingSale {
  localId: string;
  dto: CreateSaleDto;
  createdAt: string;
  status: "pending" | "failed";
  error?: string;
}

interface PosOfflineDB extends DBSchema {
  "pending-sales": {
    key: string;
    value: PendingSale;
  };
}

let dbPromise: Promise<IDBPDatabase<PosOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<PosOfflineDB>("pos-offline", 1, {
      upgrade(db) {
        db.createObjectStore("pending-sales", { keyPath: "localId" });
      },
    });
  }
  return dbPromise;
}

export async function enqueuePendingSale(dto: CreateSaleDto): Promise<PendingSale> {
  const db = await getDb();
  const sale: PendingSale = {
    localId: crypto.randomUUID(),
    dto,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await db.put("pending-sales", sale);
  return sale;
}

export async function listPendingSales(): Promise<PendingSale[]> {
  const db = await getDb();
  const all = await db.getAll("pending-sales");
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removePendingSale(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pending-sales", localId);
}

export async function markPendingSaleFailed(localId: string, error: string): Promise<void> {
  const db = await getDb();
  const sale = await db.get("pending-sales", localId);
  if (sale) {
    await db.put("pending-sales", { ...sale, status: "failed", error });
  }
}
