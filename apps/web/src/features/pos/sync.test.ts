import { describe, expect, it } from "vitest";
import type { ProductDto } from "@pos/shared";
import { ApiError, isRetryableError, isUnreachableError } from "@/lib/api-client";
import type { OutboxEntry } from "@/lib/offline-db";
import { drainOutbox } from "./sync";
import { filterProducts } from "./catalog";
import { offlineReceiptNumber } from "./offline-sale";

function entry(n: number, state: OutboxEntry["state"] = "pending"): OutboxEntry {
  return {
    clientId: `c${n}`,
    kind: "sale",
    payload: { storeId: "s", payments: [], lineItems: [] },
    createdAt: `2026-10-09T10:00:0${n}Z`,
    state,
    attempts: 0,
  };
}

/** In-memory outbox + a scripted server for drainOutbox. */
function harness(entries: OutboxEntry[], respond: (e: OutboxEntry) => { id: string } | Error) {
  const db = new Map(entries.map((e) => [e.clientId, { ...e }]));
  const uploaded: string[] = [];
  const result = drainOutbox({
    list: async () => [...db.values()],
    update: async (id, patch) => {
      db.set(id, { ...db.get(id)!, ...patch });
    },
    upload: async (e) => {
      uploaded.push(e.clientId);
      const r = respond(e);
      if (r instanceof Error) throw r;
      return r;
    },
    now: () => new Date("2026-10-09T12:00:00Z"),
  });
  return { db, uploaded, result };
}

describe("drainOutbox", () => {
  it("uploads pending entries in order and marks them synced", async () => {
    const h = harness([entry(1), entry(2), entry(3, "synced")], (e) => ({ id: `srv-${e.clientId}` }));
    expect(await h.result).toEqual({ synced: 2, failed: 0, interrupted: false });
    expect(h.uploaded).toEqual(["c1", "c2"]);
    expect(h.db.get("c1")).toMatchObject({ state: "synced", serverId: "srv-c1", attempts: 1 });
  });

  it("stops at the first unreachable error and keeps the rest pending (no reordering)", async () => {
    // 10 pending; the connection drops after 4 are accepted.
    const entries = Array.from({ length: 10 }, (_, i) => entry(i));
    let calls = 0;
    const h = harness(entries, (e) => (++calls > 4 ? new TypeError("Failed to fetch") : { id: e.clientId }));
    expect(await h.result).toEqual({ synced: 4, failed: 0, interrupted: true });
    const states = [...h.db.values()].map((e) => e.state);
    expect(states.filter((s) => s === "synced")).toHaveLength(4);
    expect(states.filter((s) => s === "pending")).toHaveLength(6);

    // Connection back: only the remaining 6 are uploaded.
    const again = harness([...h.db.values()], (e) => ({ id: e.clientId }));
    expect(await again.result).toEqual({ synced: 6, failed: 0, interrupted: false });
    expect(again.uploaded).toEqual(["c4", "c5", "c6", "c7", "c8", "c9"]);
  });

  it.each([
    ["server error", new ApiError(500, "boom")],
    ["bad gateway", new ApiError(502, "down")],
    ["rate limited", new ApiError(429, "slow down")],
    ["session expired", new ApiError(401, "Unauthorized")],
  ])("%s leaves the entry pending", async (_label, error) => {
    const h = harness([entry(1), entry(2)], () => error);
    expect((await h.result).interrupted).toBe(true);
    expect(h.db.get("c1")).toMatchObject({ state: "pending", lastError: error.message });
    expect(h.uploaded).toEqual(["c1"]);
  });

  it("a rejection marks only that entry failed and carries on", async () => {
    const h = harness([entry(1), entry(2)], (e) =>
      e.clientId === "c1" ? new ApiError(400, "Payment amounts do not cover the total") : { id: "ok" },
    );
    expect(await h.result).toEqual({ synced: 1, failed: 1, interrupted: false });
    expect(h.db.get("c1")).toMatchObject({ state: "failed", lastError: "Payment amounts do not cover the total" });
    expect(h.db.get("c2")!.state).toBe("synced");
  });

  it("skips failed entries until someone retries them", async () => {
    const h = harness([entry(1, "failed"), entry(2)], () => ({ id: "ok" }));
    await h.result;
    expect(h.uploaded).toEqual(["c2"]);
  });
});

describe("error classification", () => {
  it("treats network failures, timeouts and gateway errors as unreachable", () => {
    expect(isUnreachableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isUnreachableError(new DOMException("timed out", "TimeoutError"))).toBe(true);
    expect(isUnreachableError(new ApiError(503, "x"))).toBe(true);
    expect(isUnreachableError(new ApiError(500, "x"))).toBe(false);
    expect(isUnreachableError(new ApiError(400, "x"))).toBe(false);
  });

  it("retries 5xx/408/429 but not rejections", () => {
    expect(isRetryableError(new ApiError(500, "x"))).toBe(true);
    expect(isRetryableError(new ApiError(408, "x"))).toBe(true);
    expect(isRetryableError(new ApiError(429, "x"))).toBe(true);
    for (const status of [400, 403, 404, 409, 422]) {
      expect(isRetryableError(new ApiError(status, "x"))).toBe(false);
    }
  });
});

describe("offline catalog search", () => {
  const p = (id: string, name: string, sku: string, barcode: string | null, categoryId: string | null) =>
    ({ id, name, sku, barcode, categoryId }) as ProductDto;
  const products = [
    p("1", "Green Tea", "TEA-1", "5000001", "drinks"),
    p("2", "Black Coffee", "COF-1", null, "drinks"),
    p("3", "Teaspoon", "SPN-1", "5000003", "kitchen"),
  ];

  it("matches name, SKU and barcode case-insensitively, like the API", () => {
    expect(filterProducts(products, "tea").map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterProducts(products, "cof-1").map((x) => x.id)).toEqual(["2"]);
    expect(filterProducts(products, "000003").map((x) => x.id)).toEqual(["3"]);
  });

  it("filters by category", () => {
    expect(filterProducts(products, undefined, "drinks").map((x) => x.id)).toEqual(["1", "2"]);
    expect(filterProducts(products, "tea", "kitchen").map((x) => x.id)).toEqual(["3"]);
  });
});

describe("offlineReceiptNumber", () => {
  it("matches the API's formula (same vector as sales.service.spec.ts)", () => {
    expect(offlineReceiptNumber("cmstore0000abcd", "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd")).toBe(
      "OFF-ABCD-3F2A9C1E7B4D",
    );
  });
});
