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
 * Discounts (docs/plans/TILL_ESSENTIALS.md, part 2): the server works out
 * line and whole-sale discounts itself, taxes the discounted amount, enforces
 * APPLY_DISCOUNT and the business's maximum (not for the owner), keeps an
 * offline sale's discounts, refunds what was paid, and reports net revenue.
 */
describe("Discounts (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "DiscPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let cashierId: string;
  let storeId: string;
  let shirtId: string; // 20.00, 10% tax
  let capId: string; // 5.00, no tax

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  // Each person sells in their own open shift (opened in beforeAll).
  const shifts = new Map<string, string>();
  const sale = (token: string, body: object) =>
    http().post("/sales").set(auth(token)).send({ storeId, shiftClientId: shifts.get(token), ...body });

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
        businessName: "E2E Discount Shop",
        storeName: "E2E Discount Store",
        firstName: "Dora",
        lastName: "Disc",
        email: `disc-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    // These tests price without tax (added at the till); new stores price with IVA in.
    await prisma.store.updateMany({ where: { businessId }, data: { pricesIncludeTax: false } });

    const product = (sku: string, sellPrice: number, taxRate: number) =>
      http().post("/products").set(auth(ownerToken)).send({ sku, name: sku, costPrice: 1, sellPrice, ...(taxRate ? { taxRate } : { exemptionCode: "M10" }) }).expect(201);
    shirtId = (await product("SHIRT", 20, 10)).body.id;
    capId = (await product("CAP", 5, 0)).body.id;
    for (const id of [shirtId, capId]) {
      await http().put(`/stores/${storeId}/inventory/${id}`).set(auth(ownerToken)).send({ quantity: 100 }).expect(200);
    }

    const email = `disc-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Cal", lastName: "Cash", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    const login = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    cashierToken = login.body.accessToken;
    cashierId = login.body.user.id;
    for (const token of [ownerToken, cashierToken]) shifts.set(token, await ensureShift(app, token, storeId));
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

  it("works out line and whole-sale discounts, with tax on the discounted amount", async () => {
    // Shirt x2 = 40.00, 10% off -> 36.00; cap x1 = 5.00. 10% off the sale's
    // 41.00 = 4.10, shared 36:5 -> 3.60 and 0.50. Shirt net 32.40 + 3.24 tax,
    // cap 4.50: 40.14.
    const res = await sale(ownerToken, {
      lineItems: [
        { productId: shirtId, quantity: 2, discount: { type: "PERCENT", value: 10 } },
        { productId: capId, quantity: 1 },
      ],
      discount: { type: "PERCENT", value: 10 },
      payments: [{ method: "CASH", amount: 40.14 }],
    }).expect(201);

    const [shirt, cap] = res.body.lineItems;
    expect(shirt).toMatchObject({
      discountType: "PERCENT",
      discountValue: "10",
      lineDiscountAmount: "4",
      discountAmount: "7.6", // 4.00 own + 3.60 share
      taxAmount: "3.24", // 10% of 32.40
      lineTotal: "35.64",
    });
    expect(cap).toMatchObject({ discountType: null, lineDiscountAmount: "0", discountAmount: "0.5", taxAmount: "0", lineTotal: "4.5" });
    expect(res.body).toMatchObject({
      subtotal: "45",
      discountTotal: "8.1",
      saleDiscountAmount: "4.1",
      discountType: "PERCENT",
      taxTotal: "3.24",
      total: "40.14",
    });
  });

  it("the payments must cover the discounted total", async () => {
    await sale(ownerToken, {
      lineItems: [{ productId: capId, quantity: 2 }],
      discount: { type: "AMOUNT", value: 3 },
      payments: [{ method: "CASH", amount: 10 }],
    }).expect(400);
    await sale(ownerToken, {
      lineItems: [{ productId: capId, quantity: 2 }],
      discount: { type: "AMOUNT", value: 3 },
      payments: [{ method: "CASH", amount: 7 }],
    }).expect(201);
  });

  it("needs APPLY_DISCOUNT, and stays within the maximum for everyone but the owner", async () => {
    const tenPercentCap = {
      lineItems: [{ productId: capId, quantity: 2, discount: { type: "PERCENT", value: 15 } }],
      payments: [{ method: "CASH", amount: 8.5 }],
    };
    await sale(cashierToken, tenPercentCap).expect(403);

    await http()
      .patch(`/users/${cashierId}/permissions`)
      .set(auth(ownerToken))
      .send({ permission: "APPLY_DISCOUNT", granted: true })
      .expect(200);
    await sale(cashierToken, tenPercentCap).expect(201);

    await http().patch("/businesses/me").set(auth(ownerToken)).send({ maxDiscountPercent: 10 }).expect(200);
    const over = await sale(cashierToken, tenPercentCap).set("X-Language", "pt-BR").expect(400);
    expect(over.body.message).toBe("Os descontos não podem passar de 10% do preço");
    await sale(cashierToken, {
      lineItems: [{ productId: capId, quantity: 2, discount: { type: "PERCENT", value: 10 } }],
      payments: [{ method: "CASH", amount: 9 }],
    }).expect(201);
    // The owner has no limit.
    await sale(ownerToken, { ...tenPercentCap, lineItems: [{ ...tenPercentCap.lineItems[0], discount: { type: "PERCENT", value: 50 } }], payments: [{ method: "CASH", amount: 5 }] }).expect(201);

    const cleared = await http().patch("/businesses/me").set(auth(ownerToken)).send({ maxDiscountPercent: null }).expect(200);
    expect(cleared.body.maxDiscountPercent).toBeNull();
  });

  it("refuses a percentage over 100", async () => {
    await sale(ownerToken, {
      lineItems: [{ productId: capId, quantity: 1, discount: { type: "PERCENT", value: 120 } }],
      payments: [{ method: "CASH", amount: 0.01 }],
    }).expect(400);
  });

  it("an offline sale keeps its discount even without the permission", async () => {
    await http()
      .patch(`/users/${cashierId}/permissions`)
      .set(auth(ownerToken))
      .send({ permission: "APPLY_DISCOUNT", granted: false })
      .expect(200);
    const res = await sale(cashierToken, {
      clientId: randomUUID(),
      offline: { createdAt: new Date().toISOString() },
      lineItems: [{ productId: capId, quantity: 1, unitPrice: 5, taxRate: 0, discount: { type: "AMOUNT", value: 1 } }],
      payments: [{ method: "CASH", amount: 4 }],
    }).expect(201);
    expect(res.body).toMatchObject({ discountTotal: "1", total: "4", createdOffline: true });
  });

  it("a return refunds what was actually paid", async () => {
    const sold = (
      await sale(ownerToken, {
        lineItems: [{ productId: shirtId, quantity: 2, discount: { type: "AMOUNT", value: 10 } }],
        payments: [{ method: "CASH", amount: 33 }], // 30.00 + 10% tax
      }).expect(201)
    ).body;
    const ret = await http()
      .post("/returns")
      .set(auth(ownerToken))
      .send({ storeId, saleId: sold.id, shiftClientId: shifts.get(ownerToken), lineItems: [{ productId: shirtId, quantity: 1 }] })
      .expect(201);
    expect(ret.body.totalRefund).toBe("16.5");
  });

  it("reports count revenue after discounts", async () => {
    const before = (await http().get(`/reports/store/${storeId}/summary`).set(auth(ownerToken)).expect(200)).body.revenue;
    await sale(ownerToken, {
      lineItems: [{ productId: capId, quantity: 4 }],
      discount: { type: "AMOUNT", value: 5 },
      payments: [{ method: "CASH", amount: 15 }],
    }).expect(201);
    const after = (await http().get(`/reports/store/${storeId}/summary`).set(auth(ownerToken)).expect(200)).body.revenue;
    expect(after - before).toBeCloseTo(15);
  });
});
