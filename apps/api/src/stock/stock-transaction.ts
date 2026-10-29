import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const STOCK_BUSY_MESSAGE = "Stock is busy. Please try again.";
export const STOCK_LOCK_WAIT_MS = 750;
export const STOCK_TRANSACTION_ATTEMPTS = 3;

/** Only errors that PostgreSQL guarantees abort the transaction are replayed. */
export function stockSqlState(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return "40001";
    const code = error.meta?.code;
    if (typeof code === "string" && /^(40P01|40001|55P03|57014)$/.test(code)) return code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /PostgresError\s*\{\s*code:\s*"(40P01|40001|55P03|57014)"/.exec(error.message)?.[1] ?? null;
  }
  return null;
}

function busy() {
  // A reachable-server rejection, not 503: checkout must not queue it offline.
  return new ConflictException({ code: "STOCK_BUSY", message: STOCK_BUSY_MESSAGE, retryable: true });
}

/**
 * Serialize stock writers per store, taking multiple stores in one global order.
 * This also covers new inventory/product rows (imports) and opposite transfers.
 * Advisory locks release on commit/rollback; no schema or persisted locks needed.
 */
export async function stockTransaction<T>(
  db: PrismaService,
  storeIds: string[],
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeout?: number; replayBody?: boolean } = {},
): Promise<T> {
  const deadline = Date.now() + (options.timeout ?? 5000);
  for (let attempt = 0; attempt < STOCK_TRANSACTION_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw busy();
    let started = false;
    try {
      return await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${Math.min(STOCK_LOCK_WAIT_MS, remaining)}ms`}, true)`;
        // Bound an active query too: a timed-out transaction must answer before
        // the till's 8-second transport timeout can turn it into an offline sale.
        await tx.$executeRaw`SELECT set_config('statement_timeout', '2000ms', true)`;
        for (const id of [...new Set(storeIds)].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stock:${id}`}, 0))`;
        }
        started = true;
        return work(tx);
      }, { timeout: remaining, maxWait: Math.min(250, remaining) });
    } catch (error) {
      const state = stockSqlState(error);
      const expired = error instanceof Prisma.PrismaClientKnownRequestError && ["P2028", "P2024"].includes(error.code);
      if (!state && !expired) throw error;
      const replay = state && state !== "57014" && (!started || options.replayBody !== false);
      if (!replay || attempt === STOCK_TRANSACTION_ATTEMPTS - 1 || Date.now() >= deadline) throw busy();
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw busy();
}
