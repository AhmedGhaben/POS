import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "@/i18n";
import { StockOnHand } from "./ProductFormDialog";

/** Tester #36: before archiving or deleting, the product's stock per store is shown. */
describe("stock on hand before archiving", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-PT");
  });

  it("lists each store holding some", () => {
    const html = renderToStaticMarkup(
      <StockOnHand
        stock={[
          { storeId: "a", storeName: "Armazém", quantity: "3" },
          { storeId: "b", storeName: "Loja Principal", quantity: "12.5" },
        ]}
      />,
    );
    expect(html).toContain("Armazém");
    expect(html).toContain("3 em stock");
    expect(html).toContain("Loja Principal");
    expect(html).toContain("12,5 em stock");
  });
});
