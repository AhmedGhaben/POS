import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoreDto } from "@pos/shared";
import i18n from "@/i18n";
import { customerAddress } from "../customer-address";
import { A4Document, type SellerDetails } from "./A4Document";
import { QuoteSlip } from "./QuoteSlip";

/** Tester #38: a quote shows the customer's name, NIF and address, like the A4 invoice. */
describe("quote buyer", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-PT");
  });
  const store = { id: "s1", name: "Loja", address: "Rua 1", phone: null, country: "AO" } as unknown as StoreDto;

  it("a saved customer's address, as printed", () => {
    expect(customerAddress({ address: "Rua da Missão 12", postalCode: "1000", city: "Luanda", province: "LUA" })).toBe("Rua da Missão 12\n1000 Luanda\nLUA");
    expect(customerAddress({ address: null, postalCode: null, city: "Luanda", province: null })).toBe("Luanda");
  });

  it("the A4 quote and the slip show the NIF", () => {
    const a4 = renderToStaticMarkup(
      <A4Document title="PROFORMA" meta={[]} store={store} lines={[]} seller={{ name: "Negócio", currency: "AOA" } as SellerDetails} billTo={{ name: "Kianda Lda", taxId: "5417123456", address: "Rua da Missão 12" }} />,
    );
    expect(a4).toContain("Kianda Lda");
    expect(a4).toContain("5417123456");
    expect(a4).toContain("Rua da Missão 12");
    const slip = renderToStaticMarkup(<QuoteSlip store={store} lines={[]} reference="Q-1" issuedAt={new Date()} forName="Kianda Lda" forTaxId="5417123456" />);
    expect(slip).toContain("5417123456");
  });
});
