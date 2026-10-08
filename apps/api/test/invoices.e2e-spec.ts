import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). A fresh
 * business makes sales in two stores and invoices them: numbering under
 * concurrency, idempotency, store access, the frozen seller snapshot and the
 * list. Deletes everything it creates in afterAll.
 */
describe("Invoices (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const OWNER_EMAIL = `invoice-owner-${RUN}@e2e.test`;
  const CASHIER_EMAIL = `invoice-cashier-${RUN}@e2e.test`;
  const PASSWORD = "InvoicePass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeA: string;
  let storeB: string;
  const saleIds: { a1?: string; a2?: string; b1?: string } = {};
  const invoiceIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function sell(storeId: string, productId: string): Promise<string> {
    const res = await http()
      .post("/sales")
      .set(auth(ownerToken))
      .send({
        storeId,
        lineItems: [{ productId, quantity: 2 }],
        payments: [{ method: "CARD", amount: 23.8 }],
      })
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({
        businessName: "E2E Invoice Co",
        storeName: "E2E Invoice Store A",
        firstName: "Ivan",
        lastName: "Voice",
        email: OWNER_EMAIL,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeA = reg.body.stores[0].id;
    storeB = (await http().post("/stores").set(auth(ownerToken)).send({ name: "E2E Invoice Store B" }).expect(201))
      .body.id;

    await http()
      .patch("/businesses/me")
      .set(auth(ownerToken))
      .send({ legalName: "E2E Invoice Co Ltd", taxId: "TAX-1", currency: "EUR" })
      .expect(200);

    const product = await http()
      .post("/products")
      .set(auth(ownerToken))
      .send({ sku: `INV-${RUN}`, name: "Invoice Widget", costPrice: 5, sellPrice: 10, taxRate: 19 })
      .expect(201);
    for (const storeId of [storeA, storeB]) {
      await http()
        .put(`/stores/${storeId}/inventory/${product.body.id}`)
        .set(auth(ownerToken))
        .send({ quantity: 50 })
        .expect(200);
    }
    saleIds.a1 = await sell(storeA, product.body.id);
    saleIds.a2 = await sell(storeA, product.body.id);
    saleIds.b1 = await sell(storeB, product.body.id);

    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cass",
        lastName: "Ier",
        login: { email: CASHIER_EMAIL, role: "CASHIER", storeIds: [storeA], password: PASSWORD },
      })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email: CASHIER_EMAIL, password: PASSWORD }).expect(200))
      .body.accessToken;
  });

  afterAll(async () => {
    if (businessId) {
      const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
      const storeIds = (await prisma.store.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
      const saleWhere = { storeId: { in: storeIds } };
      await prisma.$transaction([
        prisma.invoice.deleteMany({ where: { businessId } }),
        prisma.invoiceCounter.deleteMany({ where: { businessId } }),
        prisma.salePayment.deleteMany({ where: { sale: saleWhere } }),
        prisma.saleLineItem.deleteMany({ where: { sale: saleWhere } }),
        prisma.sale.deleteMany({ where: saleWhere }),
        prisma.inventoryItem.deleteMany({ where: { storeId: { in: storeIds } } }),
        prisma.product.deleteMany({ where: { businessId } }),
        prisma.auditLog.deleteMany({ where: { businessId } }),
        prisma.employee.deleteMany({ where: { businessId } }),
        prisma.storeUser.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.store.deleteMany({ where: { businessId } }),
        prisma.business.delete({ where: { id: businessId } }),
      ]);
    }
    await app.close();
  });

  it("gives concurrent invoices consecutive, gap-free numbers", async () => {
    const results = await Promise.all(
      [saleIds.a1, saleIds.a2, saleIds.b1].map((saleId, i) =>
        http()
          .post(`/sales/${saleId}/invoice`)
          .set(auth(ownerToken))
          .send({ buyerName: `Buyer ${i}`, buyerTaxId: `VAT-${i}` }),
      ),
    );
    for (const res of results) expect(res.status).toBe(201);

    const year = results[0].body.year;
    expect(results.map((r) => r.body.sequence).sort()).toEqual([1, 2, 3]);
    expect(results.map((r) => r.body.number).sort()).toEqual([
      `INV-${year}-0001`,
      `INV-${year}-0002`,
      `INV-${year}-0003`,
    ]);
    invoiceIds.push(...results.map((r) => r.body.id));

    const a1 = results[0].body;
    expect(a1.seller).toMatchObject({ legalName: "E2E Invoice Co Ltd", taxId: "TAX-1", currency: "EUR" });
    expect(a1.sale.lineItems).toHaveLength(1);
  });

  it("returns the same invoice when a sale is invoiced again", async () => {
    const first = await prisma.invoice.findUniqueOrThrow({ where: { saleId: saleIds.a1! } });
    const again = await http()
      .post(`/sales/${saleIds.a1}/invoice`)
      .set(auth(ownerToken))
      .send({ buyerName: "Someone Else" })
      .expect(201);
    expect(again.body).toMatchObject({ id: first.id, number: first.number, buyerName: first.buyerName });
  });

  it("lets a cashier invoice at their store but not another store", async () => {
    const own = await http()
      .post(`/sales/${saleIds.a2}/invoice`)
      .set(auth(cashierToken))
      .send({ buyerName: "Whoever" })
      .expect(201);
    expect(own.body.saleId).toBe(saleIds.a2);

    await http().post(`/sales/${saleIds.b1}/invoice`).set(auth(cashierToken)).send({ buyerName: "X" }).expect(404);
  });

  it("keeps the seller snapshot when settings change later", async () => {
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ legalName: "Renamed Ltd" }).expect(200);

    const invoice = await http().get(`/invoices/${invoiceIds[0]}`).set(auth(ownerToken)).expect(200);
    expect(invoice.body.seller.legalName).toBe("E2E Invoice Co Ltd");
  });

  it("lists invoices newest first, for owners and managers only", async () => {
    const list = await http().get("/invoices").set(auth(ownerToken)).expect(200);
    expect(list.body.total).toBe(3);
    expect(list.body.items[0].number).toMatch(/-0003$/);
    expect(list.body.items[0].sale.total).toBeDefined();

    await http().get("/invoices").set(auth(cashierToken)).expect(403);
  });

  it("requires a buyer name and hides other businesses' invoices", async () => {
    await http().post(`/sales/${saleIds.a1}/invoice`).set(auth(ownerToken)).send({ buyerName: "  " }).expect(400);

    const seedOwner = await http()
      .post("/auth/login")
      .send({ email: "owner@demo-store.test", password: "OwnerPass123!" })
      .expect(200);
    await http().get(`/invoices/${invoiceIds[0]}`).set(auth(seedOwner.body.accessToken)).expect(404);
  });
});
