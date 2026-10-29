import { Prisma } from "@prisma/client";
import type { StockCountPreviewRowDto } from "@pos/shared";
import type { Table } from "../accounting/bank-import";
import { unitDecimals } from "../sales/pricing";

type Product = { id: string; sku: string; barcode: string | null; name: string; unit: string; trackStock: boolean; isActive: boolean; quantity: string };
const header = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Strict decimals; never turn a blank, exponent, thousands separator or NaN into a count. */
export function countQuantity(text: string): number | null {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text.trim())) return null;
  const value = new Prisma.Decimal(text.trim().replace(",", "."));
  return value.lte("99999999999.999") ? value.toNumber() : null;
}

/** Preview only: all row errors must be resolved before any count can be applied. */
export function previewCountRows(table: Table, products: Product[]): StockCountPreviewRowDto[] {
  const headings = (table[0] ?? []).map(header);
  const sku = headings.indexOf("sku");
  const barcode = headings.findIndex((h) => ["barcode", "codigodebarras"].includes(h));
  const quantity = headings.findIndex((h) => ["quantity", "countedquantity", "counted", "quantidade", "quantidadecontada", "contagem"].includes(h));
  if ((sku < 0 && barcode < 0) || quantity < 0) throw new Error("headers");
  const seen = new Set<string>();
  return table.slice(1).map((cells, index) => {
    const s = sku < 0 ? "" : (cells[sku] ?? "").trim();
    const b = barcode < 0 ? "" : (cells[barcode] ?? "").trim();
    const value = countQuantity(cells[quantity] ?? "");
    const matches = products.filter((p) => (s && p.sku === s) || (b && p.barcode === b));
    const product = matches.length === 1 ? matches[0] : undefined;
    const row: StockCountPreviewRowDto = { row: index + 2, identifier: [s, b].filter(Boolean).join(" / "), quantity: value };
    if (!s && !b) row.error = "missingIdentifier";
    else if (!matches.length) row.error = "unknownProduct";
    else if (!product || (s && product.sku !== s) || (b && product.barcode !== b)) row.error = "ambiguousProduct";
    else if (!product.isActive || !product.trackStock) row.error = "notStockProduct";
    else if (seen.has(product.id)) row.error = "duplicateProduct";
    else if (value === null) row.error = "invalidQuantity";
    else if (unitDecimals(product.unit) === 0 && !Number.isInteger(value)) row.error = "wholeUnits";
    if (product) {
      seen.add(product.id);
      Object.assign(row, { productId: product.id, name: product.name, unit: product.unit, currentQuantity: product.quantity,
        difference: value === null ? undefined : new Prisma.Decimal(value).sub(product.quantity).toString() });
    }
    return row;
  });
}
