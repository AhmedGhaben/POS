import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { addDays } from "../src/fiscal/saft/period";
import { localDateTime } from "../src/fiscal/fiscal-format";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { saleTotal } from "./sale-total";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 10: the back-office reports, from the fiscal
 * documents (credit notes subtract, annulled ones don't count), for the
 * store's calendar days. Expected figures are read back from the documents
 * themselves, so the test doesn't depend on the store's IVA settings.
 */
describe("Angola phase 10: reports (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase10Pass123!";
  const TODAY = localDateTime(new Date(), "Africa/Luanda").date;
  let businessId: string | undefined;
  let ownerToken: string;
  let managerToken: string;
  let storeId: string;
  let shiftClientId: string;
  let drinkId: string;
  let breadId: string;
  let customerId: string;
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const report = async (name: string, query: Record<string, string> = {}, token = ownerToken, status = 200) =>
    (await http().get(`/reports/tables/${name}?${new URLSearchParams({ storeId, startDate: TODAY, endDate: TODAY, ...query })}`).set(auth(token)).expect(status)).body;
  const docs = () => prisma.fiscalDocument.findMany({ where: { businessId, documentType: { in: ["FR", "FT", "NC"] }, status: "N" }, include: { lines: true } });
  const signed = (d: { documentType: string }, v: Prisma.Decimal) => (d.documentType === "NC" ? v.negated() : v);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Relatorios Lda", storeName: "Loja Benguela", firstName: "Ana", lastName: "Owner", email: `p10-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    const email = `p10-manager-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Mário", lastName: "Manager", login: { email, role: "MANAGER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    managerToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;

    const drinks = (await http().post("/categories").set(auth(ownerToken)).send({ name: "Bebidas" }).expect(201)).body.id;
    drinkId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `SUMO-${RUN}`, name: "Sumo 1L", categoryId: drinks, costPrice: 4, sellPrice: 10, trackStock: false }).expect(201)).body.id;
    breadId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `PAO-${RUN}`, name: "Pão", costPrice: 3, sellPrice: 5, trackStock: false }).expect(201)).body.id;
    customerId = (await http().post("/customers").set(auth(ownerToken)).send({ name: "Obras Lobito", taxId: "5000777666" }).expect(201)).body.id;
    await http().patch(`/customers/${customerId}`).set(auth(ownerToken)).send({ creditLimit: 1000 }).expect(200);
    shiftClientId = await ensureShift(app, ownerToken, storeId);

    const sell = (body: object) => http().post("/sales").set(auth(ownerToken)).send({ storeId, shiftClientId, clientId: randomUUID(), ...body }).expect(201);
    const price = async (productId: string, quantity: number) => {
      const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      return saleTotal(app, storeId, { ...p, sellPrice: p.sellPrice.toString(), taxRate: p.taxRate.toString() }, quantity);
    };
    // Two drinks for cash, a bread by card, a drink on account; one cash drink comes back.
    const cash = (await sell({ lineItems: [{ productId: drinkId, quantity: 2 }], payments: [{ method: "CASH", amount: await price(drinkId, 2) }] })).body;
    await sell({ lineItems: [{ productId: breadId, quantity: 1 }], payments: [{ method: "CARD", amount: await price(breadId, 1) }] });
    await sell({ lineItems: [{ productId: drinkId, quantity: 1 }], payments: [], creditAmount: await price(drinkId, 1), customerId });
    await http().post("/returns").set(auth(ownerToken)).send({ storeId, shiftClientId, saleId: cash.id, reason: "Avariado", refundMethod: "CASH", lineItems: [{ productId: drinkId, quantity: 1 }] }).expect(201);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  it("a manager sees their store, not the whole business; unknown reports and missing dates are refused", async () => {
    await report("salesByDay", {}, managerToken);
    await http().get(`/reports/tables/salesByDay?startDate=${TODAY}&endDate=${TODAY}`).set(auth(managerToken)).expect(403);
    await report("salesByDay", { storeId: "" }, ownerToken);
    await report("nope", {}, ownerToken, 404);
    await report("salesByDay", { startDate: "" }, ownerToken, 400);
  });

  it("sales by day: four documents (2 FR, FT, NC), the credit note subtracting; the next day has none", async () => {
    const all = await docs();
    const gross = all.reduce((a, d) => a.plus(signed(d, d.grossTotal)), D(0));
    const body = await report("salesByDay");
    expect(body).toMatchObject({ report: "salesByDay", startDate: TODAY, endDate: TODAY, storeId });
    expect(body.tables[0].rows).toEqual([expect.objectContaining({ period: TODAY, documents: 4, gross: gross.toFixed(2) })]);
    expect(body.tables[0].totals).toMatchObject({ documents: 4, gross: gross.toFixed(2) });
    const next = addDays(TODAY, 1);
    expect((await report("salesByDay", { startDate: next, endDate: next })).tables[0].rows).toEqual([]);
    expect((await report("salesByMonth")).tables[0].rows).toEqual([expect.objectContaining({ period: TODAY.slice(0, 7), documents: 4 })]);
  });

  it("by product and category: quantities net of the return, cost at the sale's cost, margin", async () => {
    const all = await docs();
    const netOf = (productId: string) => all.flatMap((d) => d.lines.filter((l) => l.productId === productId).map((l) => signed(d, l.netAmount))).reduce((a, b) => a.plus(b), D(0));
    const drinkNet = netOf(drinkId);
    const { tables } = await report("salesByProduct");
    const drink = tables[0].rows.find((r: { product: string }) => r.product === "Sumo 1L");
    // 2 + 1 sold, 1 returned: 2 at a cost of 4.
    expect(drink).toMatchObject({ category: "Bebidas", quantity: "2", net: drinkNet.toFixed(2), cost: "8.00", margin: drinkNet.minus(8).toFixed(2) });
    expect(drink.marginPercent).toBeCloseTo(drinkNet.minus(8).div(drinkNet).times(100).toNumber(), 1);
    const byCategory = (await report("salesByCategory")).tables[0].rows;
    expect(byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "Bebidas", quantity: "2", cost: "8.00" }),
        expect.objectContaining({ category: null, quantity: "1", cost: "3.00" }),
      ]),
    );
  });

  it("by cashier, by document type, by payment method (and what was sold on account)", async () => {
    const all = await docs();
    const gross = (type: string) => all.filter((d) => d.documentType === type).reduce((a, d) => a.plus(d.grossTotal), D(0));
    expect((await report("salesByCashier")).tables[0].rows).toEqual([expect.objectContaining({ cashier: "Ana Owner", documents: 4 })]);
    const types = (await report("salesByDocumentType")).tables[0].rows;
    expect(types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentType: "FR", documents: 2, annulled: 0, gross: gross("FR").toFixed(2) }),
        expect.objectContaining({ documentType: "FT", documents: 1 }),
        expect.objectContaining({ documentType: "NC", documents: 1, gross: gross("NC").toFixed(2) }),
      ]),
    );
    const [methods, onAccount] = (await report("salesByPayment")).tables;
    const cashIn = all.filter((d) => d.documentType === "FR" && d.lines.some((l) => l.productId === drinkId)).reduce((a, d) => a.plus(d.grossTotal), D(0));
    expect(methods.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "CASH", received: cashIn.toFixed(2), refunded: gross("NC").toFixed(2) }),
        expect.objectContaining({ method: "CARD", refunded: "0.00" }),
      ]),
    );
    expect(onAccount).toMatchObject({ title: "onAccount", rows: [{ documents: 1, gross: gross("FT").toFixed(2) }] });
  });

  it("IVA summary matches the documents; a Simplificado store also owes 7% of what it received", async () => {
    const all = await docs();
    const net = all.reduce((a, d) => a.plus(signed(d, d.netTotal)), D(0));
    const tax = all.reduce((a, d) => a.plus(signed(d, d.taxPayable)), D(0));
    const body = await report("ivaSummary");
    expect(body.tables).toHaveLength(1);
    expect(body.tables[0].totals).toMatchObject({ base: net.toFixed(2), tax: tax.toFixed(2) });

    await prisma.store.update({ where: { id: storeId }, data: { ivaRegime: "SIMPLIFICADO" } });
    try {
      const [, simplified] = (await report("ivaSummary")).tables;
      const methods = (await report("salesByPayment")).tables[0].totals;
      const received = D(methods.net);
      expect(simplified).toMatchObject({ title: "simplified", rows: [{ store: "Loja Benguela", received: received.toFixed(2), rate: 7, due: received.times(7).div(100).toFixed(2) }] });
    } finally {
      await prisma.store.update({ where: { id: storeId }, data: { ivaRegime: "GERAL" } });
    }
  });

  it("stock value, customers' balances (no period needed)", async () => {
    await prisma.inventoryItem.upsert({
      where: { storeId_productId: { storeId, productId: drinkId } },
      create: { storeId, productId: drinkId, quantity: 10, averageCost: "4.25" },
      update: { quantity: 10, averageCost: "4.25" },
    });
    await prisma.product.update({ where: { id: drinkId }, data: { trackStock: true } });
    const stock = await http().get(`/reports/tables/stockValuation?storeId=${storeId}`).set(auth(ownerToken)).expect(200);
    expect(stock.body).toMatchObject({ startDate: null, endDate: null });
    expect(stock.body.tables[0].rows).toEqual([expect.objectContaining({ product: "Sumo 1L", quantity: "10", averageCost: "4.25", value: "42.50" })]);
    const ft = (await docs()).find((d) => d.documentType === "FT")!;
    const balances = await http().get(`/reports/tables/customerBalances?storeId=${storeId}`).set(auth(ownerToken)).expect(200);
    expect(balances.body.tables[0].rows).toEqual([expect.objectContaining({ customer: "Obras Lobito", balance: ft.grossTotal.toFixed(2) })]);
  });
});
