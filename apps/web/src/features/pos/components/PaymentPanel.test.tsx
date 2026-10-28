import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentMethod } from "@pos/shared";
import i18n from "@/i18n";
import { PaymentPanel } from "./PaymentPanel";

/**
 * Tester #14/#42: with a split payment, "Adicionar meio de pagamento", the
 * payer count and "Dividir em partes iguais" shared one line and ran off the
 * checkout panel. "Add" now has its own line; payers and "split evenly"
 * share the next one and may wrap.
 */
describe("PaymentPanel: split controls", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-PT");
  });

  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, method: i === 0 ? PaymentMethod.CASH : PaymentMethod.CARD, amount: "10.00" }));

  for (const count of [2, 3]) {
    it(`keeps "add" off the payers line with ${count} rows`, () => {
      const html = renderToStaticMarkup(
        <PaymentPanel total={count * 10} onChange={() => {}} draft={{ isSplit: true, method: PaymentMethod.CASH, tendered: "", rows: rows(count) }} />,
      );
      const line = html.match(/<div class="[^"]*" data-testid="split-evenly-row">([\s\S]*?)<\/div>/)?.[1] ?? "";
      expect(line).toContain("Dividir em partes iguais");
      expect(line).not.toContain("Adicionar meio de pagamento");
      expect(html).toContain("Adicionar meio de pagamento");
      // Long Portuguese labels wrap instead of being cut off.
      expect(html).toMatch(/class="[^"]*whitespace-normal[^"]*"[^>]*>Dividir em partes iguais/);
    });
  }
});
