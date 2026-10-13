import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * Cancelling (voiding) a sale (docs/plans/TILL_ESSENTIALS.md, part 1): stock
 * goes back once, reports drop the sale, the permission is enforced, a cancel
 * queued offline finds the sale by its clientId, and sales with a return, an
 * invoice or more than 24 hours behind them are refused.
 */
describe("Cancelling a sale (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "VoidPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let cashierId: string;
  let storeId: string;
  let teaId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const stock = async () =>
    (await prisma.inventoryItem.findUnique({ where: { storeId_productId: { storeId, productId: teaId } } }))!.quantity;
  const sell = async (token = ownerToken, extra: object = {}) =>
    http()
      .post("/sales")
      .set(auth(token))
      .send({
        storeId,
        shiftClientId: await ensureShift(app, token, storeId),
        lineItems: [{ productId: teaId, quantity: 2 }],
        payments: [{ method: "CASH", amount: 4 }],
        ...extra,
      })
      .expect(201);
  const voidSale = (token: string, body: object) =>
    http().post("/sales/void").set(auth(token)).send({ storeId, reason: "WRONG_ITEMS", ...body });

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
        businessName: "E2E Void Shop",
        storeName: "E2E Void Store",
        firstName: "Vera",
        lastName: "Void",
        email: `void-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    teaId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: "TEA-V", name: "Tea", costPrice: 1, sellPrice: 2, taxRate: 0 })
        .expect(201)
    ).body.id;
    await http().put(`/stores/${storeId}/inventory/${teaId}`).set(auth(ownerToken)).send({ quantity: 20 }).expect(200);

    const email = `void-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Cass", lastName: "Hier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    const login = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    cashierToken = login.body.accessToken;
    cashierId = login.body.user.id;
  }, 30_000);

  afterAll(async () => {
    try {
      if (businessId) {
        await deleteBusiness(prisma, businessId);
      }
    } finally {
      await app.close();
    }
  });

  it("cancelling puts the stock back once, records who and why, and drops the sale from reports", async () => {
    const before = await stock();
    const sale = (await sell()).body;
    expect(await stock()).toBe(before - 2);
    const revenueBefore = (await http().get(`/reports/store/${storeId}/summary`).set(auth(ownerToken)).expect(200)).body
      .revenue;

    const res = await voidSale(ownerToken, { saleId: sale.id, reason: "CUSTOMER_CHANGED_MIND", note: " changed mind " }).expect(200);
    expect(res.body).toMatchObject({
      status: "VOIDED",
      voidReason: "CUSTOMER_CHANGED_MIND",
      voidNote: "changed mind",
      voidedBy: { firstName: "Vera" },
      cashier: { firstName: "Vera" },
    });
    expect(res.body.lineItems[0].product.name).toBe("Tea");
    expect(await stock()).toBe(before);

    // Again: same answer, stock unchanged.
    await voidSale(ownerToken, { saleId: sale.id }).expect(200);
    expect(await stock()).toBe(before);

    const revenueAfter = (await http().get(`/reports/store/${storeId}/summary`).set(auth(ownerToken)).expect(200)).body
      .revenue;
    expect(revenueAfter).toBeCloseTo(revenueBefore - 4);

    const list = await http().get(`/sales/store/${storeId}`).set(auth(ownerToken)).expect(200);
    expect(list.body.find((s: { id: string }) => s.id === sale.id).status).toBe("VOIDED");
  });

  it("needs the VOID_SALE permission, which the owner can give a cashier", async () => {
    const sale = (await sell(cashierToken)).body;
    expect(sale.cashier).toMatchObject({ id: cashierId, firstName: "Cass" });
    await voidSale(cashierToken, { saleId: sale.id }).expect(403);

    await http()
      .patch(`/users/${cashierId}/permissions`)
      .set(auth(ownerToken))
      .send({ permission: "VOID_SALE", granted: true })
      .expect(200);
    const res = await voidSale(cashierToken, { saleId: sale.id }).expect(200);
    expect(res.body.voidedBy.id).toBe(cashierId);
  });

  it("a cancel queued offline finds the sale by the till's clientId", async () => {
    const clientId = randomUUID();
    await sell(ownerToken, { clientId });
    const res = await voidSale(ownerToken, { saleClientId: clientId, occurredAt: new Date().toISOString() }).expect(200);
    expect(res.body).toMatchObject({ clientId, status: "VOIDED" });

    await voidSale(ownerToken, { saleClientId: randomUUID() }).expect(404);
    await voidSale(ownerToken, {}).expect(400);
  });

  it("refuses a sale with a return, with an invoice, or older than 24 hours", async () => {
    const returned = (await sell()).body;
    await http()
      .post("/returns")
      .set(auth(ownerToken))
      .send({ storeId, saleId: returned.id, shiftClientId: await ensureShift(app, ownerToken, storeId), lineItems: [{ productId: teaId, quantity: 1 }] })
      .expect(201);
    const r1 = await voidSale(ownerToken, { saleId: returned.id }).expect(400);
    expect(r1.body.message).toContain("Use Returns instead");

    const invoiced = (await sell()).body;
    await http().post(`/sales/${invoiced.id}/invoice`).set(auth(ownerToken)).send({ buyerName: "Acme" }).expect(201);
    await voidSale(ownerToken, { saleId: invoiced.id }).expect(400);

    const old = (await sell()).body;
    await prisma.sale.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    const r3 = await voidSale(ownerToken, { saleId: old.id }).set("X-Language", "pt-PT").expect(400);
    expect(r3.body.message).toBe("As vendas com mais de 24 horas não podem ser anuladas. Use as Devoluções.");
  });

  it("a cancelled sale can't be returned or invoiced", async () => {
    const sale = (await sell()).body;
    await voidSale(ownerToken, { saleId: sale.id }).expect(200);
    await http()
      .post("/returns")
      .set(auth(ownerToken))
      .send({ storeId, saleId: sale.id, shiftClientId: await ensureShift(app, ownerToken, storeId), lineItems: [{ productId: teaId, quantity: 1 }] })
      .expect(400);
    await http().post(`/sales/${sale.id}/invoice`).set(auth(ownerToken)).send({ buyerName: "Acme" }).expect(400);
  });
});
