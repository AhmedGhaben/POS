import { describe, expect, it } from "vitest";
import type { InventoryItemDto } from "@pos/shared";
import { draftCountRows } from "./count-draft";

const items = [{ productId: "a", quantity: "8", product: { sku: "TEA", name: "Tea", unit: "un" } }, { productId: "b", quantity: "4", product: { sku: "RICE", unit: "kg" } }] as InventoryItemDto[];
describe("bulk count draft", () => {
  it("keeps the original balance when the background query refreshes; includes hidden edited rows", () => {
    expect(draftCountRows(items, { a: { quantity: "3", expectedQuantity: 10 }, b: { quantity: "0,5", expectedQuantity: 2 } })).toMatchObject([
      { productId: "a", currentQuantity: "10", quantity: 3, difference: "-7" },
      { productId: "b", currentQuantity: "2", quantity: 0.5, difference: "-1.5" },
    ]);
  });
  it("never converts blank/invalid values to zero or rounds fractional whole units", () => {
    for (const quantity of ["", "-1", "1e3", "1.0001", "100000000000"]) expect(draftCountRows(items, { a: { quantity, expectedQuantity: 10 } })[0].error).toBe("invalidQuantity");
    expect(draftCountRows(items, { a: { quantity: "1.5", expectedQuantity: 10 } })[0].error).toBe("wholeUnits");
    expect(draftCountRows(items, { missing: { quantity: "0", expectedQuantity: 0 } })[0].error).toBe("unknownProduct");
  });
});
