import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { localDateTime } from "../src/fiscal/fiscal-format";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { saleTotal } from "./sale-total";
import { ensureShift } from "./shift-helper";

/**
 * The dashboard's revenue and profit take returns off, without IVA, so they
 * match the report tables: a taxed sale of three, one of which comes back.
 * Runs against the dev database with its own business, deleted in afterAll.
 */
describe("Dashboard totals net of returns (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const TODAY = localDateTime(new Date(), "Africa/Luanda").date;
  let businessId: string | undefined;
  let token: string;
  let storeId: string;
  let productId: string;
  let saleId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const summary = async () => (await http().get(`/reports/store/${storeId}/summary?days=1`).set(auth()).expect(200)).body;
  const table = async (name: string) =>
    (await http().get(`/reports/tables/${name}?${new URLSearchParams({ storeId, startDate: TODAY, endDate: TODAY })}`).set(auth()).expect(200)).body
      .tables[0].totals;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({
        businessName: "E2E Returns Shop",
        storeName: "E2E Returns Store",
        firstName: "Rita",
        lastName: "Turns",
        email: `returns-owner-${RUN}@e2e.test`,
        password: "ReturnsPass123!",
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    token = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    // Taxed at the general rate, so "without IVA" matters.
    const product = (await http().post("/products").set(auth()).send({ sku: `RET-${RUN}`, name: "Taxed thing", costPrice: 40, sellPrice: 114, trackStock: false }).expect(201)).body;
    productId = product.id;
    const shiftClientId = await ensureShift(app, token, storeId);
    const sale = await http()
      .post("/sales")
      .set(auth())
      .send({
        storeId,
        shiftClientId,
        clientId: randomUUID(),
        lineItems: [{ productId, quantity: 3 }],
        payments: [{ method: "CASH", amount: await saleTotal(app, storeId, product, 3) }],
      })
      .expect(201);
    saleId = sale.body.id;
  }, 60_000);

  afterAll(async () => {
    if (businessId) {
      await deleteBusiness(prisma, businessId);
    }
    await app.close();
  });

  it("takes a partial return off revenue and profit, matching the report tables", async () => {
    const before = await summary();
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId }, include: { lineItems: true } });
    const net = Number(sale.total) - Number(sale.taxTotal);
    expect(Number(sale.taxTotal)).toBeGreaterThan(0);
    expect(before.revenue).toBeCloseTo(net, 2);
    expect(before.profit).toBeCloseTo(net - 3 * 40, 2);

    await http()
      .post("/returns")
      .set(auth())
      .send({ storeId, saleId, shiftClientId: await ensureShift(app, token, storeId), reason: "Avariado", refundMethod: "CASH", lineItems: [{ productId, quantity: 1 }] })
      .expect(201);

    const after = await summary();
    expect(after.orderCount).toBe(1);
    expect(after.revenue).toBeCloseTo((net * 2) / 3, 2);
    expect(after.profit).toBeCloseTo((net * 2) / 3 - 2 * 40, 2);

    // The same as the report tables (which count the credit note when the store issues one).
    expect(after.revenue).toBeCloseTo(Number((await table("salesByDay")).net), 2);
    expect(after.profit).toBeCloseTo(Number((await table("salesByProduct")).margin), 2);

    const [store] = (await http().get("/reports/business/store-comparison?days=1").set(auth()).expect(200)).body;
    expect(store.revenue).toBeCloseTo(after.revenue, 2);
    expect(store.profit).toBeCloseTo(after.profit, 2);
  });
});
