import type { InventoryItemDto } from "@pos/shared";

/** At or below its reorder level. */
export function isLowStock(item: InventoryItemDto): boolean {
  return Number(item.quantity) <= Number(item.reorderLevel);
}

/**
 * The inventory rows matching a search (name, SKU or barcode, ignoring case
 * and accents), and only the low ones when asked.
 */
export function filterInventory(items: InventoryItemDto[], search: string, lowOnly: boolean): InventoryItemDto[] {
  const query = fold(search.trim());
  return items.filter((item) => {
    if (lowOnly && !isLowStock(item)) return false;
    if (!query) return true;
    const { name, sku, barcode } = item.product;
    return fold(name).includes(query) || fold(sku).includes(query) || (!!barcode && barcode.includes(query));
  });
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
