import { describe, expect, it } from "vitest";
import type { InventoryItemDto } from "@pos/shared";
import { filterInventory } from "./filter";

const item = (name: string, sku: string, barcode: string | null, quantity: string, reorderLevel = "0") =>
  ({ id: sku, storeId: "s", productId: sku, quantity, reorderLevel, product: { name, sku, barcode } }) as unknown as InventoryItemDto;

const items = [
  item("Café moído", "CAF-1", "5601234000017", "12", "5"),
  item("Água 1,5 l", "AGU-15", null, "3", "6"),
  item("Pão", "PAO-1", "5609999000001", "0"),
];

describe("filterInventory", () => {
  it("matches name (ignoring case and accents), SKU and barcode", () => {
    expect(filterInventory(items, "cafe", false).map((i) => i.id)).toEqual(["CAF-1"]);
    expect(filterInventory(items, "agu-", false).map((i) => i.id)).toEqual(["AGU-15"]);
    expect(filterInventory(items, "5609999", false).map((i) => i.id)).toEqual(["PAO-1"]);
  });

  it("returns everything for an empty search", () => {
    expect(filterInventory(items, "  ", false)).toHaveLength(3);
  });

  it("keeps only rows at or below their reorder level when asked", () => {
    expect(filterInventory(items, "", true).map((i) => i.id)).toEqual(["AGU-15", "PAO-1"]);
    expect(filterInventory(items, "pao", true).map((i) => i.id)).toEqual(["PAO-1"]);
  });
});
