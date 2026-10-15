import { Prisma } from "@prisma/client";

/**
 * SAF-T de Inventários: the stock a company held on a date (31 December),
 * product by product, with its book value. Its structure is set by AGT's
 * Circular n.º 05/GACA/GJ/DSF/AGT/2026, which we don't have yet
 * (docs/saft-ao/README.md), so the file layout sits behind a format: the
 * DRAFT one has the fields public summaries list. Swap the format, not the
 * data, once the circular arrives.
 */

export interface InventoryRow {
  /** Inventory product type (M, P, A, S, T: draft list in the country config). */
  category: string;
  code: string;
  description: string;
  /** Barcode, or the code. */
  numberCode: string;
  quantity: Prisma.Decimal;
  unit: string;
  /** quantity × weighted average cost, 2 decimals. */
  bookValue: Prisma.Decimal;
}

export interface InventoryFile {
  /** YYYY-MM-DD: the date the stock is counted at (end of that day, the shop's clock). */
  date: string;
  companyTaxId: string;
  /** "CMP": custo médio ponderado (weighted average), the only method we keep. */
  costingMethod: string;
  rows: InventoryRow[];
}

export interface InventoryFormat {
  id: string;
  extension: string;
  mimeType: string;
  write(file: InventoryFile): string;
}

const csvField = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * Draft: semicolon-separated (as the Portuguese inventory file and Excel in
 * Portuguese use), a header row, dot decimals, CRLF. A company with no stock
 * gets the header alone: its "no stock" file.
 */
export const DRAFT_CSV: InventoryFormat = {
  id: "draft-csv",
  extension: "csv",
  mimeType: "text/csv; charset=utf-8",
  write(file) {
    const header = ["ProductCategory", "ProductCode", "ProductDescription", "ProductNumberCode", "ClosingStockQuantity", "UnitOfMeasure", "ClosingStockValue", "CostingMethod"];
    const lines = [header.join(";")];
    for (const r of file.rows) {
      lines.push(
        [r.category, r.code, r.description, r.numberCode, r.quantity.toString(), r.unit, r.bookValue.toFixed(2), file.costingMethod].map((v) => csvField(v.replace(/\s+/g, " ").trim())).join(";"),
      );
    }
    return `${lines.join("\r\n")}\r\n`;
  },
};

/**
 * Stock per product from each store's figures (quantity and average cost
 * on the date): quantities and values add up across stores; nothing held
 * (zero or less) is left out. Sorted by product code.
 */
export function inventoryRows(
  perStore: { productId: string; quantity: Prisma.Decimal; averageCost: Prisma.Decimal }[],
  products: Map<string, { sku: string; name: string; barcode: string | null; unit: string; inventoryType: string | null }>,
): InventoryRow[] {
  const byProduct = new Map<string, { quantity: Prisma.Decimal; value: Prisma.Decimal }>();
  for (const s of perStore) {
    if (s.quantity.lte(0)) continue;
    const sum = byProduct.get(s.productId) ?? { quantity: new Prisma.Decimal(0), value: new Prisma.Decimal(0) };
    sum.quantity = sum.quantity.plus(s.quantity);
    sum.value = sum.value.plus(s.quantity.times(s.averageCost));
    byProduct.set(s.productId, sum);
  }
  const rows: InventoryRow[] = [];
  for (const [productId, sum] of byProduct) {
    const p = products.get(productId);
    if (!p) continue;
    rows.push({
      category: p.inventoryType || "M",
      code: p.sku,
      description: p.name,
      numberCode: p.barcode || p.sku,
      quantity: sum.quantity,
      unit: p.unit,
      bookValue: sum.value.toDecimalPlaces(2),
    });
  }
  return rows.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
