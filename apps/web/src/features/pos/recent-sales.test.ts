import { describe, expect, it } from "vitest";
import { PaymentMethod, SaleStatus, type SaleDto } from "@pos/shared";
import type { OutboxEntry } from "@/lib/offline-db";
import { mergeRecentSales } from "./recent-sales";

function sale(id: string, createdAt: string, extra: Partial<SaleDto> = {}): SaleDto {
  return {
    id,
    storeId: "s",
    cashierId: "u",
    customerId: null,
    receiptNumber: `R-${id}`,
    subtotal: "2.00",
    taxTotal: "0.00",
    discountTotal: "0.00",
    total: "2.00",
    paymentMethod: PaymentMethod.CASH,
    amountTendered: null,
    changeDue: null,
    status: SaleStatus.COMPLETED,
    createdAt,
    lineItems: [],
    payments: [],
    ...extra,
  };
}

const base = { attempts: 0, createdAt: "2026-10-11T10:00:00Z" };

function queuedSale(clientId: string, createdAt: string, state: OutboxEntry["state"] = "pending"): OutboxEntry {
  return {
    ...base,
    clientId,
    kind: "sale",
    state,
    payload: { storeId: "s", payments: [], lineItems: [], clientId },
    receipt: sale(clientId, createdAt, { clientId, queued: true }),
  };
}

function queuedVoid(target: { saleClientId?: string; saleId?: string }, state: OutboxEntry["state"] = "pending"): OutboxEntry {
  return {
    ...base,
    clientId: `v-${target.saleClientId ?? target.saleId}`,
    kind: "void-sale",
    state,
    payload: { storeId: "s", reason: "WRONG_ITEMS", occurredAt: "2026-10-11T12:00:00Z", ...target },
  };
}

describe("mergeRecentSales", () => {
  it("adds sales waiting to upload, newest first, without duplicating uploaded ones", () => {
    const server = [sale("a", "2026-10-11T09:00:00Z", { clientId: "ca" }), sale("b", "2026-10-11T08:00:00Z")];
    const outbox = [
      queuedSale("ca", "2026-10-11T09:00:00Z", "synced"), // already in the server list
      queuedSale("cq", "2026-10-11T11:00:00Z"),
      queuedSale("cs", "2026-10-11T10:00:00Z", "synced"), // uploaded after the list was fetched
    ];
    const merged = mergeRecentSales(server, outbox);
    expect(merged.map((s) => s.id)).toEqual(["cq", "cs", "a", "b"]);
    expect(merged[0].queued).toBe(true);
    expect(merged[1].queued).toBe(false);
    expect(merged[2].queued).toBeUndefined();
  });

  it("shows a cancel that hasn't uploaded yet, by clientId or by id, but not a refused one", () => {
    const server = [sale("a", "2026-10-11T09:00:00Z", { clientId: "ca" }), sale("b", "2026-10-11T08:00:00Z")];
    const outbox = [
      queuedSale("cq", "2026-10-11T11:00:00Z"),
      queuedVoid({ saleClientId: "cq" }),
      queuedVoid({ saleId: "b" }),
      queuedVoid({ saleClientId: "ca" }, "failed"),
    ];
    const merged = mergeRecentSales(server, outbox);
    const status = Object.fromEntries(merged.map((s) => [s.id, s.status]));
    expect(status).toEqual({ cq: SaleStatus.VOIDED, a: SaleStatus.COMPLETED, b: SaleStatus.VOIDED });
    expect(merged.find((s) => s.id === "b")).toMatchObject({ voidReason: "WRONG_ITEMS", voidedAt: "2026-10-11T12:00:00Z" });
  });

  it("skips old outbox entries that have no receipt", () => {
    const old: OutboxEntry = { ...base, clientId: "x", kind: "sale", state: "pending", payload: { storeId: "s", payments: [], lineItems: [] } };
    expect(mergeRecentSales([], [old])).toEqual([]);
  });
});
