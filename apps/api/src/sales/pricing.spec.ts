import * as shared from "../../../../packages/shared/src/pricing";
import { priceSaleCents, type DiscountInput, type PricingLineInput } from "./pricing";

/** The server must charge exactly what the till showed and printed. */
describe("pricing (API copy)", () => {
  it("agrees with the till's copy on random carts", () => {
    let seed = 11;
    const rand = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    const discount = (): DiscountInput | null => {
      const pick = rand(4);
      if (pick === 0) return { type: "PERCENT", value: rand(10_000) / 100 };
      if (pick === 1) return { type: "AMOUNT", value: rand(5_000) / 100 };
      return null;
    };
    for (let run = 0; run < 2_000; run++) {
      const lines: PricingLineInput[] = Array.from({ length: 1 + rand(8) }, () => ({
        unitPrice: rand(20_000) / 100,
        quantity: 1 + rand(12),
        taxRate: [0, 5, 6.5, 14, 23][rand(5)],
        discount: discount(),
      }));
      const saleDiscount = discount();
      expect(priceSaleCents(lines, saleDiscount)).toEqual(shared.priceSaleCents(lines, saleDiscount));
    }
  });
});
