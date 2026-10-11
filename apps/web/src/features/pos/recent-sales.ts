import { SaleStatus, type SaleDto } from "@pos/shared";
import type { OutboxEntry } from "@/lib/offline-db";

const LIMIT = 50;

/**
 * The till's Recent sales list: the server's latest sales, plus sales still
 * waiting in the outbox (or uploaded since the server list was fetched), with
 * cancels that haven't uploaded yet already applied. Newest first.
 */
export function mergeRecentSales(server: SaleDto[], outbox: OutboxEntry[]): SaleDto[] {
  const byKey = new Map<string, SaleDto>();
  for (const sale of server) byKey.set(sale.clientId ?? sale.id, sale);

  for (const entry of outbox) {
    if (entry.kind !== "sale" || !entry.receipt || byKey.has(entry.clientId)) continue;
    byKey.set(entry.clientId, { ...entry.receipt, queued: entry.state !== "synced" });
  }

  // A refused cancel (failed) didn't happen; one waiting or uploaded did.
  for (const entry of outbox) {
    if (entry.kind !== "void-sale" || entry.state === "failed") continue;
    const { saleClientId, saleId, reason, note, occurredAt } = entry.payload;
    const sale = saleClientId
      ? byKey.get(saleClientId)
      : [...byKey.values()].find((s) => s.id === saleId);
    if (!sale || sale.status === SaleStatus.VOIDED) continue;
    byKey.set(sale.clientId ?? sale.id, {
      ...sale,
      status: SaleStatus.VOIDED,
      voidedAt: occurredAt ?? entry.createdAt,
      voidReason: reason,
      voidNote: note ?? null,
    });
  }

  return [...byKey.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LIMIT);
}
