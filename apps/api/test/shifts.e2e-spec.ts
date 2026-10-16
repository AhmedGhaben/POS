import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";

/**
 * Shifts (docs/plans/TILL_ESSENTIALS.md, part 4): one open shift per till,
 * sales/returns/cash movements linked by the till's shift id, expected cash
 * = float + cash sales - cash refunds + cash in - cash out (cancelled sales
 * left out), the close with a count, and offline uploads with the till key.
 */
describe("Shifts (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "ShiftPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let ownerId: string;
  const OWNER_PIN = "8642";
  let cashierToken: string;
  let cashierId: string;
  let storeId: string;
  let terminalId: string;
  let key: string;
  let productId: string;
  const shiftId = randomUUID();

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sell = (token: string, method: "CASH" | "CARD", extra: object = {}) =>
    http()
      .post("/sales")
      .set(auth(token))
      .send({
        storeId,
        terminalId,
        shiftClientId: shiftId,
        lineItems: [{ productId, quantity: 1 }],
        payments: [{ method, amount: 10 }],
        ...extra,
      })
      .expect(201);

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
        businessName: "E2E Shift Shop",
        storeName: "Shift Store",
        firstName: "Sam",
        lastName: "Owner",
        email: `shift-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    ownerId = reg.body.user.id;
    storeId = reg.body.stores[0].id;
    // The owner approves things for the cashier with this PIN (manager override).
    await http().put("/users/me/pin").set(auth(ownerToken)).send({ pin: OWNER_PIN, password: PASSWORD }).expect(200);

    productId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: "SHIFT-1", name: "Soap", costPrice: 4, sellPrice: 10, exemptionCode: "M10" })
        .expect(201)
    ).body.id;
    await http().put(`/stores/${storeId}/inventory/${productId}`).set(auth(ownerToken)).send({ quantity: 100 }).expect(200);

    const email = `shift-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Cleo", lastName: "Cash", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    const login = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    cashierToken = login.body.accessToken;
    cashierId = login.body.user.id;

    const terminal = await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Shift Till" }).expect(201);
    terminalId = terminal.body.id;
    key = terminal.body.key;
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

  it("shifts are always on: no sale before the till opens a shift", async () => {
    const res = await http()
      .post("/sales")
      .set(auth(cashierToken))
      .send({ storeId, terminalId, lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] })
      .expect(400);
    expect(res.body.message).toBe("Open a shift before selling");
    const settings = await http().get("/businesses/me").set(auth(ownerToken)).expect(200);
    expect(settings.body).not.toHaveProperty("shiftsEnabled");
  });

  it("a cashier opens the till with a float; a till has one open shift at a time", async () => {
    const res = await http()
      .post("/shifts/open")
      .set(auth(cashierToken))
      .send({ storeId, clientId: shiftId, terminalId, openingFloat: 100 })
      .expect(200);
    expect(res.body).toMatchObject({ status: "OPEN", openingFloat: "100", openedBy: { id: cashierId }, terminal: { id: terminalId } });
    expect(res.body.summary.expectedCash).toBe("100.00");

    // A retry of the same open is fine; a second shift on the same till isn't.
    await http().post("/shifts/open").set(auth(cashierToken)).send({ storeId, clientId: shiftId, terminalId, openingFloat: 100 }).expect(200);
    const again = await http()
      .post("/shifts/open")
      .set(auth(ownerToken))
      .send({ storeId, clientId: randomUUID(), terminalId, openingFloat: 50 })
      .expect(409);
    expect(again.body.message).toBe("This till already has an open shift");
  });

  it("works out the expected cash from sales, cancels, returns and cash in/out", async () => {
    const first = (await sell(cashierToken, "CASH")).body;
    await sell(cashierToken, "CASH");
    const cancelled = (await sell(cashierToken, "CASH")).body;
    // The cashier can't give discounts alone: the owner approves this one with their PIN.
    const discounted = { discount: { type: "AMOUNT", value: 2 }, payments: [{ method: "CASH", amount: 8 }] };
    await http()
      .post("/sales")
      .set(auth(cashierToken))
      .send({ storeId, terminalId, shiftClientId: shiftId, lineItems: [{ productId, quantity: 1 }], ...discounted })
      .expect(403);
    const approval = await http()
      .post("/overrides")
      .set(auth(cashierToken))
      .send({ approverId: ownerId, pin: OWNER_PIN, permission: "APPLY_DISCOUNT", action: "sale.discount", storeId })
      .expect(200);
    await sell(cashierToken, "CASH", { ...discounted, overrides: [{ permission: "APPLY_DISCOUNT", token: approval.body.token }] });
    await sell(cashierToken, "CARD");
    expect(first.shiftId).toBeTruthy();
    // Someone else can't sell in the cashier's shift.
    await http()
      .post("/sales")
      .set(auth(ownerToken))
      .send({ storeId, terminalId, shiftClientId: shiftId, lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] })
      .expect(403);

    await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: cancelled.id, reason: "ANNUL_N" }).expect(200);
    await http()
      .post("/returns")
      .set(auth(ownerToken))
      .send({ storeId, saleId: first.id, shiftClientId: shiftId, lineItems: [{ productId, quantity: 1 }] })
      .expect(201);

    // Cash in for anyone; cash out needs CASH_OUT (or a manager's approval).
    const movement = (type: "IN" | "OUT", amount: number, reason: string, token = ownerToken) =>
      http()
        .post("/shifts/cash-movements")
        .set(auth(token))
        .send({ storeId, shiftClientId: shiftId, clientId: randomUUID(), type, amount, reason });
    await movement("OUT", 5, "PETTY_CASH", cashierToken).expect(403);
    await movement("IN", 50, "CHANGE_TOPUP").expect(200);
    await movement("OUT", 30, "CASH_PICKUP").expect(200);

    const current = await http()
      .get(`/shifts/current?storeId=${storeId}&terminalId=${terminalId}`)
      .set(auth(cashierToken))
      .expect(200);
    // 100 float + (10 + 10 + 8) cash - 10 refunded + 50 in - 30 out
    expect(current.body.shift.summary).toMatchObject({
      expectedCash: "138.00",
      salesCount: 4,
      salesTotal: "38.00",
      byMethod: { CASH: "28.00", CARD: "10.00" },
      discounts: "2.00",
      voided: { count: 1, total: "10.00" },
      returns: { count: 1, total: "10.00", cash: "10.00" },
      cashIn: "50.00",
      cashOut: "30.00",
    });
    expect(current.body.shift.summary.byCashier.map((c: { name: string; count: number }) => [c.name, c.count])).toEqual([["Cleo Cash", 4]]);
  });

  it("closing records the count, the expected cash and the difference", async () => {
    const res = await http()
      .post("/shifts/close")
      .set(auth(cashierToken))
      .send({ storeId, shiftClientId: shiftId, countedCash: 135, tillExpectedCash: 138, note: "short 3" })
      .expect(200);
    expect(res.body).toMatchObject({
      status: "CLOSED",
      countedCash: "135",
      expectedCash: "138",
      tillExpectedCash: "138",
      difference: "-3",
      note: "short 3",
      closedBy: { id: cashierId },
    });
    // Closing again changes nothing.
    const again = await http().post("/shifts/close").set(auth(ownerToken)).send({ storeId, shiftClientId: shiftId, countedCash: 1 }).expect(200);
    expect(again.body.countedCash).toBe("135");

    const byClient = await http().get(`/shifts/client/${shiftId}?storeId=${storeId}`).set(auth(cashierToken)).expect(200);
    expect(byClient.body.difference).toBe("-3");
  });

  it("after the close: no more cash movements, and its sales are returned, not cancelled", async () => {
    await http()
      .post("/shifts/cash-movements")
      .set(auth(ownerToken))
      .send({ storeId, shiftClientId: shiftId, clientId: randomUUID(), type: "IN", amount: 1, reason: "OTHER" })
      .expect(400);
    const sale = await prisma.sale.findFirst({ where: { shift: { clientId: shiftId }, status: "COMPLETED" } });
    const res = await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: sale!.id, reason: "OTHER" }).expect(400);
    expect(res.body.message).toBe("This sale's shift is closed. Use Returns instead.");
  });

  it("a shift opened and closed offline uploads with the till's key", async () => {
    const offlineShift = randomUUID();
    const openedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const opened = await http()
      .post("/shifts/open")
      .set("X-Terminal-Key", key)
      .send({ storeId, clientId: offlineShift, terminalId, openingFloat: 20, openedAt, offline: true, actingUserId: cashierId })
      .expect(200);
    expect(opened.body).toMatchObject({ createdOffline: true, openedBy: { id: cashierId } });
    expect(new Date(opened.body.openedAt).toISOString()).toBe(openedAt);

    await http()
      .post("/shifts/close")
      .set("X-Terminal-Key", key)
      .send({ storeId, shiftClientId: offlineShift, countedCash: 20, offline: true, actingUserId: cashierId })
      .expect(200);
  });

  it("owners and managers see the list; cashiers don't", async () => {
    const list = await http().get(`/shifts?storeId=${storeId}`).set(auth(ownerToken)).expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].terminal.code).toMatch(/^POS-/);
    await http().get(`/shifts?storeId=${storeId}`).set(auth(cashierToken)).expect(403);
    const first = list.body.items.find((s: { clientId: string }) => s.clientId === shiftId);
    const one = await http().get(`/shifts/${first.id}`).set(auth(ownerToken)).expect(200);
    expect(one.body.summary.expectedCash).toBe("138.00");
  });
});
