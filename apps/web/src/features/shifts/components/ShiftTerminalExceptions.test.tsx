import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "@/i18n";
import { ShiftTerminalExceptions } from "./ShiftTerminalExceptions";

describe("ShiftTerminalExceptions (Shifts page, for managers)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-AO");
  });

  it("lists each flagged operation with the till and the shift it landed in", () => {
    const html = renderToStaticMarkup(
      <ShiftTerminalExceptions
        items={[
          { id: "a", at: "2026-11-17T10:00:00.000Z", operation: "sale", tillCode: "POS-001", shiftTillCode: null, offline: true, clientId: "c1" },
          { id: "b", at: "2026-11-17T11:00:00.000Z", operation: "shift-close", tillCode: "POS-001", shiftTillCode: "POS-002", offline: false, clientId: null },
        ]}
      />,
    );
    expect(html).toContain("Exceções de caixa");
    expect(html).toContain("Venda da caixa POS-001 num turno do navegador");
    expect(html).toContain("Fecho de turno da caixa POS-001 no turno da caixa POS-002");
    expect(html).toContain("nada nos valores deste turno foi alterado");
  });

  it("nothing flagged: nothing shown", () => {
    expect(renderToStaticMarkup(<ShiftTerminalExceptions items={[]} />)).toBe("");
  });
});
