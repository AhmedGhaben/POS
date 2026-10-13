import { readFileSync } from "fs";
import { join } from "path";
import * as shared from "../../../../packages/shared/src/pricing";
import { priceSaleCents, type DiscountInput, type PricingLineInput } from "./pricing";

/** The server must charge exactly what the till showed and printed. */
describe("pricing (API copy)", () => {
  it("is byte-identical to the till's copy", () => {
    const ours = readFileSync(join(__dirname, "pricing.ts"), "utf8").replace(/\r\n/g, "\n");
    const theirs = readFileSync(join(__dirname, "../../../../packages/shared/src/pricing.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(ours).toBe(theirs);
  });

  it("agrees with the till's copy on random carts, with and without tax in the price", () => {
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
        quantity: rand(2) ? 1 + rand(12) : (1 + rand(9_999)) / 1000,
        taxRate: [0, 1, 5, 6.5, 7, 14][rand(6)],
        discount: discount(),
      }));
      const saleDiscount = discount();
      const options = { taxIncluded: rand(2) === 0 };
      expect(priceSaleCents(lines, saleDiscount, options)).toEqual(shared.priceSaleCents(lines, saleDiscount, options));
    }
  });
});
