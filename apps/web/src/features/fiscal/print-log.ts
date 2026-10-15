import type { SaleDto } from "@pos/shared";
import { isWorkingOffline } from "@/features/pos/offline-store";
import { recordPrint } from "./api";
import { saleDocument } from "./sale-document";

/**
 * Logs a slip print of a sale's fiscal document, best-effort: offline, or
 * for a sale still waiting to upload, nothing is logged and the print goes
 * ahead (the server's log then only knows the prints it saw).
 */
export function logSlipPrint(sale: SaleDto, copies = 1): void {
  const doc = saleDocument(sale);
  if (!doc?.id || isWorkingOffline()) return;
  void recordPrint(doc.id, "RECEIPT", copies).catch(() => undefined);
}
