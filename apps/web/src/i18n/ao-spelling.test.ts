import { describe, expect, it } from "vitest";
import { aoSpelling, aoSpellingTree } from "./ao-spelling";

describe("Angolan spelling", () => {
  it("uses the pre-1990 forms, keeping the case", () => {
    expect(aoSpelling("Fatura")).toBe("Factura");
    expect(aoSpelling("FATURA RECIBO")).toBe("FACTURA RECIBO");
    expect(aoSpelling("faturação e faturas")).toBe("facturação e facturas");
    expect(aoSpelling("Selecionar a seleção atual")).toBe("Seleccionar a selecção actual");
    expect(aoSpelling("desativar o produto ativo")).toBe("desactivar o produto activo");
    expect(aoSpelling("uma ação, duas ações")).toBe("uma acção, duas acções");
    expect(aoSpelling("Receção e direção")).toBe("Recepção e direcção");
  });

  it("leaves words that don't change alone", () => {
    for (const word of ["informação", "operação", "configuração", "transação", "data", "direito", "fato", "contato", "relatório"]) {
      expect(aoSpelling(word)).toBe(word);
    }
    expect(aoSpelling("Atualmente")).toBe("Actualmente");
    expect(aoSpelling("{{count}} faturas")).toBe("{{count}} facturas");
  });

  it("changes every string in a translation tree, and nothing else", () => {
    expect(aoSpellingTree({ a: "Fatura", b: { c: "seleção" }, n: 3 })).toEqual({ a: "Factura", b: { c: "selecção" }, n: 3 });
  });
});
