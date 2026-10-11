import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

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
    storeId = reg.body.stores[0].id;

    productId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: "SHIFT-1", name: "Soap", costPrice: 4, sellPrice: 10, taxRate: 0 })
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
        const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
        const saleWhere = { storeId };
        await prisma.$transaction([
          prisma.returnLineItem.deleteMany({ where: { return: saleWhere } }),
          prisma.return.deleteMany({ where: saleWhere }),
          prisma.salePayment.deleteMany({ where: { sale: saleWhere } }),
          prisma.saleLineItem.deleteMany({ where: { sale: saleWhere } }),
          prisma.sale.deleteMany({ where: saleWhere }),
          prisma.cashMovement.deleteMany({ where: { shift: { businessId } } }),
          prisma.shift.deleteMany({ where: { businessId } }),
          prisma.terminal.deleteMany({ where: { businessId } }),
          prisma.inventoryItem.deleteMany({ where: { storeId } }),
          prisma.product.deleteMany({ where: { businessId } }),
          prisma.auditLog.deleteMany({ where: { businessId } }),
          prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.employee.deleteMany({ where: { businessId } }),
          prisma.storeUser.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.user.deleteMany({ where: { businessId } }),
          prisma.store.deleteMany({ where: { businessId } }),
          prisma.business.delete({ where: { id: businessId } }),
        ]);
      }
    } finally {
      await app.close();
    }
  });

  it("the owner turns shifts on in Settings", async () => {
    const res = await http().patch("/businesses/me").set(auth(ownerToken)).send({ shiftsEnabled: true }).expect(200);
    expect(res.body.shiftsEnabled).toBe(true);
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
    await sell(ownerToken, "CASH", { discount: { type: "AMOUNT", value: 2 }, payments: [{ method: "CASH", amount: 8 }] });
    await sell(cashierToken, "CARD");
    expect(first.shiftId).toBeTruthy();

    await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: cancelled.id, reason: "WRONG_ITEMS" }).expect(200);
    await http()
      .post("/returns")
      .set(auth(ownerToken))
      .send({ storeId, saleId: first.id, shiftClientId: shiftId, lineItems: [{ productId, quantity: 1 }] })
      .expect(201);

    // Cash in/out opens the drawer without a sale: OPEN_DRAWER.
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
    expect(current.body.shift.summary.byCashier.map((c: { name: string; count: number }) => [c.name, c.count]).sort()).toEqual([
      ["Cleo Cash", 3],
      ["Sam Owner", 1],
    ]);
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
