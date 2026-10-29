import { countQuantity, previewCountRows } from "./count-import";

const products = [
  { id: "a", sku: "TEA", barcode: "00123", name: "Tea", unit: "un", trackStock: true, isActive: true, quantity: "10" },
  { id: "b", sku: "RICE", barcode: null, name: "Rice", unit: "kg", trackStock: true, isActive: true, quantity: "2.5" },
];

describe("stock count import", () => {
  it("accepts strict non-negative decimals, including zero, and rejects lossy values", () => {
    for (const text of ["", "-1", "NaN", "Infinity", "1e3", "1.2345", "1,234.5", "100000000000"]) expect(countQuantity(text)).toBeNull();
    expect(countQuantity("0")).toBe(0);
    expect(countQuantity("1,250")).toBe(1.25);
    expect(countQuantity("99999999999.999")).toBe(99999999999.999);
  });
  it("matches barcodes without losing leading zeroes and previews decimal differences", () => {
    expect(previewCountRows([["Código de barras", "Quantidade contada"], ["00123", "4"]], products)[0]).toMatchObject({ productId: "a", currentQuantity: "10", quantity: 4, difference: "-6" });
    expect(previewCountRows([["SKU", "Counted quantity"], ["RICE", "3,125"]], products)[0]).toMatchObject({ productId: "b", difference: "0.625" });
  });
  it("reports duplicates, fractional units, missing products and mismatched identifiers", () => {
    const rows = previewCountRows([["SKU", "Barcode", "Quantity"], ["TEA", "00123", "1.5"], ["TEA", "", "2"], ["OTHER", "", "0"], ["RICE", "00123", "3"]], products);
    expect(rows.map((r) => r.error)).toEqual(["wholeUnits", "duplicateProduct", "unknownProduct", "ambiguousProduct"]);
    expect(previewCountRows([["SKU", "Quantity"], ["TEA", ""]], products)[0].error).toBe("invalidQuantity");
    expect(() => previewCountRows([["Name", "Count"]], products)).toThrow("headers");
  });
  it("rejects inactive/non-stock products and duplicate barcodes", () => {
    expect(previewCountRows([["SKU", "Quantity"], ["TEA", "1"]], [{ ...products[0], trackStock: false }])[0].error).toBe("notStockProduct");
    expect(previewCountRows([["Barcode", "Quantity"], ["00123", "1"]], [products[0], { ...products[1], barcode: "00123" }])[0].error).toBe("ambiguousProduct");
  });
});
