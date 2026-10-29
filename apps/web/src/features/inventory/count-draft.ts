import { unitDecimals, type InventoryItemDto, type StockCountPreviewRowDto } from "@pos/shared";

export type CountEdits = Record<string, { quantity: string; expectedQuantity: number }>;

export function draftCountRows(items: InventoryItemDto[], edits: CountEdits): StockCountPreviewRowDto[] {
  return Object.entries(edits).map(([productId, edit], index) => {
    const item = items.find((i) => i.productId === productId);
    const text = edit.quantity.trim();
    const value = /^\d+(?:[.,]\d{1,3})?$/.test(text) ? Number(text.replace(",", ".")) : NaN;
    const quantity = Number.isFinite(value) && value <= 99999999999.999 ? value : null;
    return { row: index + 1, productId, identifier: item?.product.sku ?? productId, name: item?.product.name,
      quantity, currentQuantity: String(edit.expectedQuantity), difference: quantity === null ? undefined : String(Math.round((quantity - edit.expectedQuantity) * 1000) / 1000),
      error: !item ? "unknownProduct" : quantity === null ? "invalidQuantity" : unitDecimals(item.product.unit ?? "un") === 0 && !Number.isInteger(quantity) ? "wholeUnits" : undefined };
  });
}
