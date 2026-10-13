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
 * docs/plans/ANGOLA.md, phase 3: manager override (approval by PIN, single
 * use, audit-logged), cash out, closing a shift (by note/coin, forced by a
 * manager, flagged over the threshold), Consumidor Final, products that
 * don't track stock, and returns with and without cash.
 */
describe("Angola phase 3: checkout (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase3Pass123!";
  const MANAGER_PIN = "5791";
  let businessId: string | undefined;
  let ownerToken: string;
  let storeId: string;
  let cashierToken: string;
  let cashierId: string;
  let managerId: string;
  let managerToken: string;
  let soapId: string; // tracked, 10.00, no tax
  let serviceId: string; // not tracked, 50.00

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function addLogin(role: "CASHIER" | "MANAGER", first: string) {
    const email = `p3-${first.toLowerCase()}-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: first, lastName: "Test", login: { email, role, storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    const login = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    return { token: login.body.accessToken as string, id: login.body.user.id as string };
  }

  function approve(permission: string, extra: object = {}) {
    return http()
      .post("/overrides")
      .set(auth(cashierToken))
      .send({ approverId: managerId, pin: MANAGER_PIN, permission, action: "test", storeId, ...extra });
  }

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
        businessName: "E2E Phase3 Shop",
        storeName: "Phase3 Store",
        firstName: "Olga",
        lastName: "Owner",
        email: `p3-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    soapId = (
      await http().post("/products").set(auth(ownerToken)).send({ sku: "SOAP", name: "Soap", costPrice: 4, sellPrice: 10, taxRate: 0 }).expect(201)
    ).body.id;
    serviceId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: "FIX", name: "Repair service", costPrice: 0, sellPrice: 50, taxRate: 0, trackStock: false })
        .expect(201)
    ).body.id;
    await http().put(`/stores/${storeId}/inventory/${soapId}`).set(auth(ownerToken)).send({ quantity: 20, reorderLevel: 5 }).expect(200);

    ({ token: cashierToken, id: cashierId } = await addLogin("CASHIER", "Cleo"));
    ({ token: managerToken, id: managerId } = await addLogin("MANAGER", "Mia"));
    await http().put("/users/me/pin").set(auth(managerToken)).send({ pin: MANAGER_PIN, password: PASSWORD }).expect(200);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("manager override", () => {
    it("lists who can approve, with a PIN and the permission (not the asker)", async () => {
      const res = await http().get(`/overrides/approvers?permission=VOID_SALE&storeId=${storeId}`).set(auth(cashierToken)).expect(200);
      expect(res.body.map((u: { id: string }) => u.id)).toEqual([managerId]);
    });

    it("refuses a wrong PIN, approving yourself, and someone without the permission", async () => {
      const wrong = await approve("VOID_SALE", { pin: "0000" }).expect(403);
      expect(wrong.body.message).toBe("Wrong PIN");
      await http()
        .post("/overrides")
        .set(auth(managerToken))
        .send({ approverId: managerId, pin: MANAGER_PIN, permission: "VOID_SALE", action: "test" })
        .expect(400);
      await http().put(`/users/${cashierId}/pin`).set(auth(ownerToken)).send({ pin: "2468" }).expect(200);
      await http()
        .post("/overrides")
        .set(auth(managerToken))
        .send({ approverId: cashierId, pin: "2468", permission: "VOID_SALE", action: "test" })
        .expect(403);
    });

    it("an approval works once, only for the person and the permission it was given for", async () => {
      const shift = await ensureShift(app, cashierToken, storeId);
      const sell = () =>
        http()
          .post("/sales")
          .set(auth(cashierToken))
          .send({ storeId, shiftClientId: shift, lineItems: [{ productId: soapId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] })
          .expect(201);
      const a = (await sell()).body;
      const b = (await sell()).body;

      await http().post("/sales/void").set(auth(cashierToken)).send({ storeId, saleId: a.id, reason: "WRONG_ITEMS" }).expect(403);
      const token = (await approve("VOID_SALE", { details: { saleId: a.id } }).expect(200)).body.token;
      // Not for another permission, not for someone else.
      await http().post("/sales/void").set(auth(managerToken)).set("X-Override-Token", token).send({ storeId, saleId: b.id, reason: "OTHER" }).expect(200);
      const wrongPerm = await approve("PROCESS_RETURN").expect(200);
      await http()
        .post("/sales/void")
        .set(auth(cashierToken))
        .set("X-Override-Token", wrongPerm.body.token)
        .send({ storeId, saleId: a.id, reason: "WRONG_ITEMS" })
        .expect(403);

      await http().post("/sales/void").set(auth(cashierToken)).set("X-Override-Token", token).send({ storeId, saleId: a.id, reason: "WRONG_ITEMS" }).expect(200);
      // Used up.
      const c = (await sell()).body;
      const again = await http()
        .post("/sales/void")
        .set(auth(cashierToken))
        .set("X-Override-Token", token)
        .send({ storeId, saleId: c.id, reason: "WRONG_ITEMS" })
        .expect(403);
      expect(again.body.message).toBe("The manager's approval is no longer valid");

      const logged = await prisma.auditLog.findMany({ where: { businessId, action: { startsWith: "MANAGER_OVERRIDE" } } });
      expect(logged.map((l) => l.action)).toEqual(expect.arrayContaining(["MANAGER_OVERRIDE_APPROVED", "MANAGER_OVERRIDE_USED"]));
      const used = logged.find((l) => l.action === "MANAGER_OVERRIDE_USED");
      expect(used).toMatchObject({ userId: cashierId, metadata: expect.objectContaining({ approvedBy: managerId, permission: "VOID_SALE" }) });
    });

    it("an offline sale records the approval the till checked", async () => {
      const shift = await ensureShift(app, cashierToken, storeId);
      const res = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({
          storeId,
          shiftClientId: shift,
          clientId: randomUUID(),
          offline: { createdAt: new Date().toISOString() },
          lineItems: [{ productId: soapId, quantity: 1, unitPrice: 8, taxRate: 0 }],
          payments: [{ method: "CASH", amount: 8 }],
          offlineOverrides: [{ approverId: managerId, permission: "CHANGE_PRICE" }],
        })
        .expect(201);
      expect(res.body.lineItems[0]).toMatchObject({ unitPrice: "8", originalUnitPrice: "10" });
      const recorded = await prisma.managerOverride.findFirst({ where: { businessId, offline: true } });
      expect(recorded).toMatchObject({ requestedById: cashierId, approvedById: managerId, permission: "CHANGE_PRICE" });
    });
  });

  describe("cash in/out and closing", () => {
    let shift: string;

    it("cash in for anyone; cash out needs CASH_OUT or an approval", async () => {
      shift = await ensureShift(app, cashierToken, storeId);
      const move = (type: "IN" | "OUT", amount: number, headers: Record<string, string> = {}) =>
        http()
          .post("/shifts/cash-movements")
          .set({ ...auth(cashierToken), ...headers })
          .send({ storeId, shiftClientId: shift, clientId: randomUUID(), type, amount, reason: "CASH_PICKUP" });
      await move("IN", 100).expect(200);
      const refused = await move("OUT", 40).expect(403);
      expect(refused.body.message).toBe("Taking cash out needs a manager's approval");
      const token = (await approve("CASH_OUT").expect(200)).body.token;
      await move("OUT", 40, { "X-Override-Token": token }).expect(200);
      const out = await prisma.cashMovement.findFirst({ where: { shift: { clientId: shift }, type: "OUT" } });
      expect(out?.approvedById).toBe(managerId);
    });

    it("another cashier can't close it; a manager can force-close it, flagged over the threshold", async () => {
      await http().patch("/businesses/me").set(auth(ownerToken)).send({ shiftDifferenceThreshold: 5 }).expect(200);
      const other = await addLogin("CASHIER", "Otto");
      await http().post("/shifts/close").set(auth(other.token)).send({ storeId, shiftClientId: shift, countedCash: 0 }).expect(403);

      const current = (await http().get(`/shifts/client/${shift}?storeId=${storeId}`).set(auth(managerToken)).expect(200)).body;
      const expected = Number(current.summary.expectedCash);
      const counted = expected - 10; // 10 short
      // By note and coin: must add up.
      await http()
        .post("/shifts/close")
        .set(auth(managerToken))
        .send({ storeId, shiftClientId: shift, countedCash: counted, countedDenominations: { "1": counted + 1 } })
        .expect(400);
      const closed = await http()
        .post("/shifts/close")
        .set(auth(managerToken))
        .send({ storeId, shiftClientId: shift, countedCash: counted, countedDenominations: { "1": counted } })
        .expect(200);
      expect(closed.body).toMatchObject({ status: "CLOSED", forcedClose: true, flagged: true, difference: "-10", closedBy: { id: managerId } });
      const audit = await prisma.auditLog.findFirst({ where: { businessId, action: "SHIFT_FORCE_CLOSED" } });
      expect(audit?.userId).toBe(managerId);

      const flagged = await http().get(`/shifts?storeId=${storeId}&flagged=true`).set(auth(ownerToken)).expect(200);
      expect(flagged.body.items.map((s: { clientId: string }) => s.clientId)).toEqual([shift]);
      const byCashier = await http().get(`/shifts?storeId=${storeId}&cashierId=${cashierId}&status=CLOSED`).set(auth(ownerToken)).expect(200);
      expect(byCashier.body.total).toBe(1);
    });
  });

  describe("customers, stock and returns", () => {
    it("a sale with no customer goes to Consumidor Final (NIF 999999999), which isn't in the customer search", async () => {
      const shift = await ensureShift(app, ownerToken, storeId);
      const sale = await http()
        .post("/sales")
        .set(auth(ownerToken))
        .send({ storeId, shiftClientId: shift, lineItems: [{ productId: soapId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] })
        .expect(201);
      const customer = await prisma.customer.findUnique({ where: { id: sale.body.customerId } });
      expect(customer).toMatchObject({ name: "Consumidor Final", taxId: "999999999", isFinalConsumer: true });
      const search = await http().get("/customers?search=Consumidor").set(auth(ownerToken)).expect(200);
      expect(search.body).toHaveLength(0);
    });

    it("the customer card shows what a customer bought and their last sales", async () => {
      const shift = await ensureShift(app, ownerToken, storeId);
      const customer = (await http().post("/customers").set(auth(ownerToken)).send({ name: "Ana Card", taxId: "5417000000" }).expect(201)).body;
      for (const quantity of [1, 2]) {
        await http()
          .post("/sales")
          .set(auth(ownerToken))
          .send({ storeId, shiftClientId: shift, customerId: customer.id, lineItems: [{ productId: soapId, quantity }], payments: [{ method: "CARD", amount: quantity * 10 }] })
          .expect(201);
      }
      const card = await http().get(`/customers/${customer.id}/card`).set(auth(cashierToken)).expect(200);
      expect(card.body).toMatchObject({ customer: { name: "Ana Card", taxId: "5417000000" }, purchases: { count: 2, total: "30.00" } });
      expect(card.body.recent).toHaveLength(2);
      await http().get(`/customers/does-not-exist/card`).set(auth(ownerToken)).expect(404);
    });

    it("a product that doesn't track stock always sells and never shows in stock or low stock", async () => {
      const shift = await ensureShift(app, ownerToken, storeId);
      await http()
        .post("/sales")
        .set(auth(ownerToken))
        .send({ storeId, shiftClientId: shift, lineItems: [{ productId: serviceId, quantity: 3 }], payments: [{ method: "CARD", amount: 150 }] })
        .expect(201);
      expect(await prisma.inventoryItem.findUnique({ where: { storeId_productId: { storeId, productId: serviceId } } })).toBeNull();
      const inventory = await http().get(`/stores/${storeId}/inventory`).set(auth(ownerToken)).expect(200);
      expect(inventory.body.map((i: { productId: string }) => i.productId)).not.toContain(serviceId);
      await http().put(`/stores/${storeId}/inventory/${serviceId}`).set(auth(ownerToken)).send({ quantity: 5 }).expect(400);
      const low = await http().get(`/reports/store/${storeId}/low-stock`).set(auth(ownerToken)).expect(200);
      expect(low.body.map((i: { productId: string }) => i.productId)).not.toContain(serviceId);
    });

    it("cash back needs an open shift; a refund without cash can be done from the back office", async () => {
      const shift = await ensureShift(app, ownerToken, storeId);
      const sale = await http()
        .post("/sales")
        .set(auth(ownerToken))
        .send({ storeId, shiftClientId: shift, lineItems: [{ productId: soapId, quantity: 2 }], payments: [{ method: "CARD", amount: 20 }] })
        .expect(201);
      const line = [{ productId: soapId, quantity: 1 }];
      const cash = await http().post("/returns").set(auth(ownerToken)).send({ storeId, saleId: sale.body.id, lineItems: line }).expect(400);
      expect(cash.body.message).toBe("A cash refund has to be done at a till with an open shift");
      const card = await http()
        .post("/returns")
        .set(auth(ownerToken))
        .send({ storeId, saleId: sale.body.id, refundMethod: "CARD", lineItems: line })
        .expect(201);
      expect(card.body).toMatchObject({ refundMethod: "CARD", shiftId: null });
      await http().post("/returns").set(auth(ownerToken)).send({ storeId, saleId: sale.body.id, shiftClientId: shift, lineItems: line }).expect(201);
    });

    it("a cashier returns with a manager's approval", async () => {
      const shift = await ensureShift(app, cashierToken, storeId);
      const sale = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({ storeId, shiftClientId: shift, lineItems: [{ productId: soapId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] })
        .expect(201);
      const body = { storeId, saleId: sale.body.id, shiftClientId: shift, lineItems: [{ productId: soapId, quantity: 1 }] };
      await http().post("/returns").set(auth(cashierToken)).send(body).expect(403);
      const token = (await approve("PROCESS_RETURN").expect(200)).body.token;
      await http().post("/returns").set(auth(cashierToken)).set("X-Override-Token", token).send(body).expect(201);
    });
  });
});
