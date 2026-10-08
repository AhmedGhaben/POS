import { describe, expect, it } from "vitest";
import { buildPreview, mapColumns } from "./import-rows";

describe("mapColumns", () => {
  it("matches template headers and common alternatives in any order and case", () => {
    const { columns, missing } = mapColumns(["Price", "Item code", "PRODUCT NAME", "Tax %", "Qty", "EAN"]);
    expect(columns).toEqual({ sellPrice: 0, sku: 1, name: 2, taxRate: 3, stock: 4, barcode: 5 });
    expect(missing).toEqual([]);
  });

  it("reports missing required columns by their template name", () => {
    expect(mapColumns(["Name", "Barcode"]).missing).toEqual(["SKU", "Sell price"]);
  });
});

describe("buildPreview", () => {
  const { columns } = mapColumns(["Name", "SKU", "Sell price", "Cost price", "Tax %", "Stock", "Category"]);

  it("marks new vs update and builds the payload, leaving blank optionals out", () => {
    const rows = buildPreview(
      [
        ["Tea", "TEA-1", "2,50", "", "", "", "Drinks"],
        ["Coffee", "COF-1", "3", "1.2", "19", "10", ""],
      ],
      columns,
      new Set(["TEA-1"]),
    );
    expect(rows.map((r) => r.status)).toEqual(["update", "new"]);
    expect(rows[0].payload).toEqual({ line: 2, sku: "TEA-1", name: "Tea", sellPrice: 2.5, category: "Drinks" });
    expect(rows[1].payload).toEqual({
      line: 3,
      sku: "COF-1",
      name: "Coffee",
      sellPrice: 3,
      costPrice: 1.2,
      taxRate: 19,
      stock: 10,
    });
  });

  it("explains every problem on a bad row", () => {
    const [row] = buildPreview([["", "", "abc", "-1", "150", "2.5", ""]], columns, new Set());
    expect(row.status).toBe("error");
    expect(row.payload).toBeUndefined();
    expect(row.errors).toEqual([
      "Name is missing",
      "SKU is missing",
      `Sell price "abc" isn't a number`,
      "Cost price can't be negative",
      "Tax % is over 100",
      `Stock "2.5" must be a whole number, 0 or more`,
    ]);
  });

  it("flags a SKU repeated later in the file", () => {
    const rows = buildPreview(
      [
        ["A", "X-1", "1", "", "", "", ""],
        ["B", "X-1", "1", "", "", "", ""],
      ],
      columns,
      new Set(),
    );
    expect(rows[1].errors).toEqual(["SKU appears earlier in the file"]);
  });

  it("rejects more than 2 decimals", () => {
    const [row] = buildPreview([["A", "X", "1.999", "", "", "", ""]], columns, new Set());
    expect(row.errors).toEqual(["Sell price has more than 2 decimals"]);
  });
});
