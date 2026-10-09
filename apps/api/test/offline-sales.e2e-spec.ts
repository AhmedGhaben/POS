import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { offlineReceiptNumber } from "../src/sales/sales.service";

/**
 * Desktop part A: sales sent with a clientId are created once however often
 * they're retried, offline sales are recorded as rung up (price, time, stock
 * going negative), and tills register as terminals. Runs against the seeded
 * dev database with its own business, deleted in afterAll.
 */
describe("Offline sales and terminals (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const OWNER_EMAIL = `offline-owner-${RUN}@e2e.test`;
  const CASHIER_EMAIL = `offline-cashier-${RUN}@e2e.test`;
  const PASSWORD = "OfflinePass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const stock = async () =>
    (await prisma.inventoryItem.findUnique({ where: { storeId_productId: { storeId, productId } } }))!.quantity;

  /** 2 × 10.00 at 19% tax = 23.80, paid by card. */
  function saleBody(extra: Record<string, unknown> = {}, quantity = 2, amount = 23.8) {
    return {
      storeId,
      lineItems: [{ productId, quantity }],
      payments: [{ method: "CARD", amount }],
      ...extra,
    };
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
        businessName: "E2E Offline Co",
        storeName: "E2E Offline Store",
        firstName: "Otto",
        lastName: "Fline",
        email: OWNER_EMAIL,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    const product = await http()
      .post("/products")
      .set(auth(ownerToken))
      .send({ sku: `OFF-${RUN}`, name: "Offline Widget", costPrice: 5, sellPrice: 10, taxRate: 19 })
      .expect(201);
    productId = product.body.id;
    await http()
      .put(`/stores/${storeId}/inventory/${productId}`)
      .set(auth(ownerToken))
      .send({ quantity: 20 })
      .expect(200);

    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cass",
        lastName: "Ier",
        login: { email: CASHIER_EMAIL, role: "CASHIER", storeIds: [storeId], password: PASSWORD },
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
        prisma.salePayment.deleteMany({ where: { sale: saleWhere } }),
        prisma.saleLineItem.deleteMany({ where: { sale: saleWhere } }),
        prisma.sale.deleteMany({ where: saleWhere }),
        prisma.terminal.deleteMany({ where: { businessId } }),
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

  describe("idempotency", () => {
    it("a retried sale with the same clientId is created once", async () => {
      const before = await stock();
      const clientId = randomUUID();
      const first = await http().post("/sales").set(auth(cashierToken)).send(saleBody({ clientId })).expect(201);
      const again = await http().post("/sales").set(auth(cashierToken)).send(saleBody({ clientId })).expect(201);

      expect(again.body.id).toBe(first.body.id);
      expect(await prisma.sale.count({ where: { storeId, clientId } })).toBe(1);
      expect(await stock()).toBe(before - 2);
    });

    it("concurrent copies of one sale still make one sale", async () => {
      const before = await stock();
      const clientId = randomUUID();
      const results = await Promise.all(
        [1, 2, 3].map(() => http().post("/sales").set(auth(cashierToken)).send(saleBody({ clientId }))),
      );

      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.sale.count({ where: { storeId, clientId } })).toBe(1);
      expect(await stock()).toBe(before - 2);
    });

    it("rejects a malformed clientId", async () => {
      await http().post("/sales").set(auth(cashierToken)).send(saleBody({ clientId: "abc" })).expect(400);
    });
  });

  describe("offline sales", () => {
    it("keeps the till's price, tax, time and receipt number after a price change", async () => {
      await http().patch(`/products/${productId}`).set(auth(ownerToken)).send({ sellPrice: 12 }).expect(200);
      const clientId = randomUUID();
      const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

      const res = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({
          storeId,
          clientId,
          offline: { createdAt },
          lineItems: [{ productId, quantity: 2, unitPrice: 10, taxRate: 19 }],
          payments: [{ method: "CASH", amount: 23.8, tendered: 30 }],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        total: "23.8",
        createdOffline: true,
        receiptNumber: offlineReceiptNumber(storeId, clientId),
        createdAt,
        changeDue: "6.2",
      });
      expect(res.body.lineItems[0].unitPrice).toBe("10");
    });

    it("is recorded even when it takes stock below zero", async () => {
      const before = await stock();
      await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({
          storeId,
          clientId: randomUUID(),
          offline: { createdAt: new Date().toISOString() },
          lineItems: [{ productId, quantity: before + 3, unitPrice: 10, taxRate: 0 }],
          payments: [{ method: "CASH", amount: (before + 3) * 10 }],
        })
        .expect(201);
      expect(await stock()).toBe(-3);
    });

    it("an online sale still can't oversell, and ignores client prices", async () => {
      await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send(saleBody({ clientId: randomUUID() }, 1, 14.28))
        .expect(400); // stock is -3

      await http()
        .put(`/stores/${storeId}/inventory/${productId}`)
        .set(auth(ownerToken))
        .send({ quantity: 10 })
        .expect(200);
      // Client claims 1.00; the server charges the real 12.00 + 19% = 14.28.
      await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({ storeId, lineItems: [{ productId, quantity: 1, unitPrice: 1, taxRate: 0 }], payments: [{ method: "CARD", amount: 1 }] })
        .expect(400);
      const ok = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({ storeId, lineItems: [{ productId, quantity: 1, unitPrice: 1, taxRate: 0 }], payments: [{ method: "CARD", amount: 14.28 }] })
        .expect(201);
      expect(ok.body.lineItems[0].unitPrice).toBe("12");
      expect(ok.body.createdOffline).toBe(false);
    });

    it("needs a clientId, and a clock far in the future is clamped to now", async () => {
      await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send(saleBody({ offline: { createdAt: new Date().toISOString() } }))
        .expect(400);

      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send({
          storeId,
          clientId: randomUUID(),
          offline: { createdAt: future },
          lineItems: [{ productId, quantity: 1, unitPrice: 12, taxRate: 19 }],
          payments: [{ method: "CARD", amount: 14.28 }],
        })
        .expect(201);
      expect(new Date(res.body.createdAt).getTime()).toBeLessThan(Date.now() + 60_000);
    });
  });

  describe("terminals", () => {
    let terminalId: string;

    it("owners register tills with running codes; cashiers can't", async () => {
      const a = await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: " Front Till " }).expect(201);
      const b = await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Back Till" }).expect(201);
      expect(a.body).toMatchObject({ name: "Front Till", code: "POS-001", storeId });
      expect(b.body.code).toBe("POS-002");
      terminalId = a.body.id;

      await http().post("/terminals").set(auth(cashierToken)).send({ storeId, name: "Sneaky" }).expect(403);
      const list = await http().get(`/terminals?storeId=${storeId}`).set(auth(ownerToken)).expect(200);
      expect(list.body.map((t: { code: string }) => t.code)).toEqual(["POS-001", "POS-002"]);
    });

    it("a cashier's till can read its own name", async () => {
      const res = await http().get(`/terminals/${terminalId}`).set(auth(cashierToken)).expect(200);
      expect(res.body.name).toBe("Front Till");
    });

    it("sales carry the terminal, and an unknown terminal is ignored", async () => {
      const res = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send(saleBody({ clientId: randomUUID(), terminalId }, 1, 14.28))
        .expect(201);
      expect(res.body.terminalId).toBe(terminalId);
      const terminal = await prisma.terminal.findUnique({ where: { id: terminalId } });
      expect(terminal?.lastSeenAt).not.toBeNull();

      const unknown = await http()
        .post("/sales")
        .set(auth(cashierToken))
        .send(saleBody({ clientId: randomUUID(), terminalId: "does-not-exist" }, 1, 14.28))
        .expect(201);
      expect(unknown.body.terminalId).toBeNull();
    });

    it("owners can rename a till", async () => {
      const res = await http()
        .patch(`/terminals/${terminalId}`)
        .set(auth(ownerToken))
        .send({ name: "Till 1" })
        .expect(200);
      expect(res.body.name).toBe("Till 1");
      await http().patch(`/terminals/${terminalId}`).set(auth(cashierToken)).send({ name: "x" }).expect(403);
    });
  });
});
