import { NestFactory } from "@nestjs/core";
import { PaymentMethod, Role } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { AccountingService } from "../src/accounting/accounting.service";
import { IntegrationService } from "../src/accounting/integration.service";
import { TemplatesService } from "../src/accounting/templates.service";
import { countryConfig, lineTax, type IvaRegime } from "../src/countries";
import { PrismaService } from "../src/prisma/prisma.service";
import { PurchasesService } from "../src/purchases/purchases.service";
import { priceSaleCents } from "../src/sales/pricing";
import { SalesService } from "../src/sales/sales.service";
import { ShiftsService } from "../src/shifts/shifts.service";
import { assertDemoDataAllowed } from "./demo-guard";

/**
 * Demo laptops only (start-demo.bat): the books ready for an accountant to
 * look at. On a fresh demo store it rings up a few sales on a shift (cash
 * and Multicaixa) and records a purchase with the supplier's invoice, all
 * through the app's own services, so the documents are numbered and signed
 * as at a till. Then it switches accounting on, enters opening balances (the
 * share capital in the bank and the till) and posts everything, so the
 * trial balance and statements are filled. A demo whose accounting was
 * already set up is left alone; one that already has sales keeps them and
 * only gets its books switched on and posted.
 *   node apps/api/dist/prisma/demo-books.js   (ALLOW_DEMO_SEED=1 in production)
 */
const SALES: { items: [index: number, quantity: number][]; method: PaymentMethod }[] = [
  { items: [[0, 2], [1, 1]], method: PaymentMethod.CASH },
  { items: [[2, 3]], method: PaymentMethod.CARD },
  { items: [[3, 1], [4, 2], [5, 1]], method: PaymentMethod.CASH },
  { items: [[6, 4]], method: PaymentMethod.CARD },
  { items: [[7, 1], [8, 1]], method: PaymentMethod.CASH },
];

async function main() {
  assertDemoDataAllowed("demo-books");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  try {
    const prisma = app.get(PrismaService);
    const business = await prisma.business.findUnique({ where: { id: "seed-business" } });
    if (!business) throw new Error("Run the seed first: the demo business is missing");
    if (await prisma.accountingSettings.findUnique({ where: { businessId: business.id } })) {
      console.log("Accounting was already set up here: nothing changed");
      return;
    }
    const owner = await prisma.user.findFirstOrThrow({ where: { businessId: business.id, role: Role.OWNER } });
    const user = { userId: owner.id, businessId: business.id, role: Role.OWNER };
    const store = await prisma.store.findFirstOrThrow({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });

    if ((await prisma.sale.count({ where: { storeId: store.id } })) === 0) {
      const products = await prisma.product.findMany({
        where: { businessId: business.id, isActive: true, trackStock: true, inventoryItems: { some: { storeId: store.id, quantity: { gte: 10 } } } },
        orderBy: { sku: "asc" },
        take: 9,
      });
      if (products.length < 9) throw new Error("The demo store needs stocked products: run the seed first");
      const shifts = app.get(ShiftsService);
      const sales = app.get(SalesService);
      const shiftClientId = randomUUID();
      const openingFloat = 10000;
      await shifts.open(user, { storeId: store.id, clientId: shiftClientId, openingFloat });
      const config = countryConfig(store.country);
      let cash = 0;
      for (const sale of SALES) {
        const lines = sale.items.map(([i, quantity]) => ({ product: products[i], quantity }));
        const priced = priceSaleCents(
          lines.map((l) => ({ unitPrice: Number(l.product.sellPrice), quantity: l.quantity, taxRate: lineTax(config, store.ivaRegime as IvaRegime, l.product).rate, discount: null })),
          null,
          { taxIncluded: store.pricesIncludeTax },
        );
        const total = priced.total / 100;
        await sales.create(
          business.id,
          owner.id,
          {
            storeId: store.id,
            clientId: randomUUID(),
            shiftClientId,
            lineItems: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
            payments: [{ method: sale.method, amount: total }],
          },
          Role.OWNER,
        );
        if (sale.method === PaymentMethod.CASH) cash += total;
      }
      await shifts.close(user, { storeId: store.id, shiftClientId, countedCash: Math.round((openingFloat + cash) * 100) / 100 });

      // Restocking from a supplier, with the supplier's invoice and its IVA.
      const supplier = await prisma.supplier.findFirstOrThrow({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
      const restock = products.slice(0, 3).map((p) => ({ productId: p.id, quantity: 12, unitCost: Number(p.costPrice) }));
      const base = Math.round(restock.reduce((s, l) => s + l.quantity * l.unitCost, 0) * 100) / 100;
      await app.get(PurchasesService).create(business.id, owner.id, {
        storeId: store.id,
        supplierId: supplier.id,
        lineItems: restock,
        supplierDocument: { type: "FT", number: "FT 2026/1048", date: new Date().toISOString().slice(0, 10), hash: "0" },
        taxLines: [{ taxRate: 14, base }],
      });
      console.log(`Demo sales and a supplier invoice recorded (${SALES.length} sales)`);
    }

    await app.get(AccountingService).updateSettings(business.id, owner.id, { enabled: true });
    // Opening balances: the share capital, paid into the bank and the till, so
    // the cash account doesn't go negative with the seeded rent and bills.
    const account = (code: string) => prisma.ledgerAccount.findUniqueOrThrow({ where: { businessId_code: { businessId: business.id, code } } });
    const [capital, bank, cashAccount] = await Promise.all([account("51.1"), account("43.1.1"), account("45.1.1")]);
    await app.get(TemplatesService).opening(business.id, owner.id, new Date().getFullYear(), [
      { accountId: capital.id, credit: 2_000_000 },
      { accountId: bank.id, debit: 1_500_000 },
      { accountId: cashAccount.id, debit: 500_000 },
    ]);
    const posted = await app.get(IntegrationService).run(business.id, owner.id);
    console.log(`Accounting switched on: ${posted.posted} posted, ${posted.skipped} skipped, ${posted.failed} failed`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
