import { describe, expect, it } from "vitest";
import { filterOptions, normalizeSearch } from "./combobox-filter";

const exemptions = [
  { value: "M11", label: "Medicamentos", description: "M11" },
  { value: "M10", label: "Bens alimentares", description: "M10" },
  { value: "M13", label: "Livros", description: "M13", keywords: ["formato digital"] },
  { value: "M17", label: "Transporte colectivo de passageiros", description: "M17" },
];

describe("combobox filtering", () => {
  it("ignores case and accents", () => {
    expect(normalizeSearch("  Crédito Agrícola ")).toBe("credito agricola");
    const banks = [{ value: "bpc", label: "Banco de Poupança e Crédito" }];
    expect(filterOptions(banks, "poupanca credito")).toHaveLength(1);
  });

  it("finds by name, by code (secondary text) and by keyword", () => {
    expect(filterOptions(exemptions, "aliment").map((o) => o.value)).toEqual(["M10"]);
    expect(filterOptions(exemptions, "m13").map((o) => o.value)).toEqual(["M13"]);
    expect(filterOptions(exemptions, "digital").map((o) => o.value)).toEqual(["M13"]);
  });

  it("needs every typed word, in any order", () => {
    expect(filterOptions(exemptions, "passageiros transporte").map((o) => o.value)).toEqual(["M17"]);
    expect(filterOptions(exemptions, "transporte livros")).toEqual([]);
  });

  it("puts names starting with the text first, otherwise keeps the order", () => {
    const options = [
      { value: "1", label: "Sumo de laranja" },
      { value: "2", label: "Laranja" },
      { value: "3", label: "Doce de laranja" },
    ];
    expect(filterOptions(options, "laranja").map((o) => o.value)).toEqual(["2", "1", "3"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterOptions(exemptions, "   ")).toBe(exemptions);
  });
});
