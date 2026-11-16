import { describe, expect, it } from "vitest";
import { axisAmount, chartProductNames, noWrap } from "./chart-labels";

describe("chart labels", () => {
  it("shows product names without the barcode, and tells duplicates apart", () => {
    const rows = chartProductNames([
      { name: "Queijo da Serra 1792234297373" },
      { name: "Queijo da Serra 5601234567890" },
      { name: "Água 1,5 L" },
      { name: "Pão" },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Queijo da Serra", "Queijo da Serra · 2", "Água 1,5 L", "Pão"]);
    // The product itself is untouched.
    expect(rows[0].name).toBe("Queijo da Serra 1792234297373");
  });

  it("keeps a name that is only a code", () => {
    expect(chartProductNames([{ name: "12345678" }])[0].label).toBe("12345678");
  });

  it("axis ticks are short and carry no currency", () => {
    expect(axisAmount(12_000, "AOA").replace(/\s/g, " ")).toBe("12 mil");
    expect(axisAmount(0, "AOA")).toBe("0");
  });

  it("value labels can't wrap between the number and Kz", () => {
    expect(noWrap("2 000,0 Kz")).not.toContain(" ");
  });
});
