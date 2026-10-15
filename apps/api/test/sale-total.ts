import type { INestApplication } from "@nestjs/common";
import { countryConfig, lineTax, type IvaRegime } from "../src/countries";
import { PrismaService } from "../src/prisma/prisma.service";
import { priceSaleCents } from "../src/sales/pricing";

/**
 * What the till would charge for `quantity` of a product in this store,
 * priced as the API prices it: the store's regime and whether its prices
 * include IVA (a freshly seeded store's do; older databases' may not).
 */
export async function saleTotal(
  app: INestApplication,
  storeId: string,
  product: { sellPrice: string | number; taxRate?: string | number | null; taxCode?: string | null; exemptionCode?: string | null },
  quantity: number,
): Promise<number> {
  const store = await app.get(PrismaService).store.findUniqueOrThrow({ where: { id: storeId }, select: { pricesIncludeTax: true, country: true, ivaRegime: true } });
  const tax = lineTax(countryConfig(store.country), store.ivaRegime as IvaRegime, {
    taxRate: Number(product.taxRate ?? 0),
    taxCode: product.taxCode ?? null,
    exemptionCode: product.exemptionCode ?? null,
  });
  const priced = priceSaleCents([{ unitPrice: Number(product.sellPrice), quantity, taxRate: tax.rate, discount: null }], null, { taxIncluded: store.pricesIncludeTax });
  return priced.total / 100;
}
