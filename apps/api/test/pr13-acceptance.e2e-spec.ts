import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { SHIFT_TERMINAL_MISMATCH } from "../src/shifts/terminal-exceptions";
import { deleteBusiness } from "./cleanup";

/**
 * PR #13 acceptance checks that can't be done safely on a live till:
 * "waiting" with nobody signed in, closed shifts never raising a false
 * offline, the syncing transitions at the edges of the 2-3 minute window,
 * replaying the same offline sale (one after another and at the same time),
 * and a refused close leaving no till exception behind.
 */
describe("PR #13 acceptance (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "AcceptPass123!";
  let businessId: string | undefined;
  let token: string;
  let cashierToken: string;
  let ownerId: string;
  let storeId: string;
  let productId: string;
  let till1: { id: string; key: string; code: string };
  let till2: { id: string; key: string; code: string };

  const http = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const key = (t = till1) => ({ "X-Terminal-Key": t.key });
  const beat = (body: Record<string, unknown>, t = till1) => http().post("/terminals/me/heartbeat").set(key(t)).send(body).expect(204);
  const store = async () =>
    ((await http().get("/stores/status").set(auth()).expect(200)).body as { storeId: string; status: string; devices: { terminalId: string; status: string }[] }[]).find(
      (s) => s.storeId === storeId,
    )!;
  const tillState = async (t = till1) => (await store()).devices.find((d) => d.terminalId === t.id)!.status;
  /** As if the till was last heard from `ms` ago (its heartbeat and its uploads). */
  const age = async (ms: number, t = till1) => {
    const at = new Date(Date.now() - ms);
    await prisma.terminalStatus.update({ where: { terminalId: t.id }, data: { lastSeenAt: at } });
    await prisma.terminal.update({ where: { id: t.id }, data: { lastSeenAt: at } });
  };
  const exceptions = (shiftId: string) => prisma.auditLog.count({ where: { action: SHIFT_TERMINAL_MISMATCH, entityId: shiftId } });
  const shiftByClient = (clientId: string) => prisma.shift.findUniqueOrThrow({ where: { storeId_clientId: { storeId, clientId } } });
  const closeShift = (clientId: string, headers: Record<string, string>) =>
    http().post("/shifts/close").set(auth()).set(headers).send({ storeId, shiftClientId: clientId, countedCash: 0 }).expect(200);
  async function openOnTill(t = till1) {
    const clientId = randomUUID();
    await http().post("/shifts/open").set(auth()).set(key(t)).send({ storeId, clientId, openingFloat: 0 }).expect(200);
    return clientId;
  }
  async function openBrowserShift() {
    const clientId = randomUUID();
    await http().post("/shifts/open").set(auth()).send({ storeId, clientId, openingFloat: 0 }).expect(200);
    return clientId;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Accept Shop", storeName: "Loja", firstName: "Olga", lastName: "Owner", email: `accept-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerId = reg.body.user.id;
    token = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    productId = (await http().post("/products").set(auth()).send({ sku: `ACC-${RUN}`, name: "Pão", costPrice: 1, sellPrice: 2, exemptionCode: "M10" }).expect(201)).body.id;
    await http().put(`/stores/${storeId}/inventory/${productId}`).set(auth()).send({ quantity: 100 }).expect(200);
    till1 = (await http().post("/terminals").set(auth()).send({ storeId, name: "Caixa 1" }).expect(201)).body;
    till2 = (await http().post("/terminals").set(auth()).send({ storeId, name: "Caixa 2" }).expect(201)).body;
    const email = `accept-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth())
      .send({ firstName: "Cid", lastName: "Cashier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("1. waiting: sales saved, nobody signed in", () => {
    let shift: string;
    beforeAll(async () => {
      shift = await openOnTill();
    });

    it("is 'waiting' (not offline, not syncing) and the store shows it", async () => {
      await beat({ pendingCount: 2, syncedOk: false, syncActive: false });
      expect(await tillState()).toBe("waiting");
      expect((await store()).status).toBe("waiting");
    });

    it("stays 'waiting' through the 2-3 minute window, and while heartbeats continue", async () => {
      await age(150_000);
      expect(await tillState()).toBe("waiting");
      await beat({ pendingCount: 2, syncedOk: false, syncActive: false });
      await age(179_000);
      expect(await tillState()).toBe("waiting");
    });

    it("outranks a syncing till in the same store", async () => {
      await beat({ pendingCount: 1, syncedOk: false, syncActive: true }, till2);
      expect(await tillState(till2)).toBe("syncing");
      expect((await store()).status).toBe("waiting");
    });

    it("only a till that goes quiet with its shift open becomes offline; signing in uploads and it's online again", async () => {
      await age(181_000);
      expect(await tillState()).toBe("offline");
      expect((await store()).status).toBe("offline");
      await beat({ pendingCount: 2, syncedOk: false, syncActive: true });
      expect(await tillState()).toBe("syncing");
      await beat({ pendingCount: 0, syncedOk: true, syncActive: true });
      expect(await tillState()).toBe("online");
      await closeShift(shift, key());
      await beat({ pendingCount: 0, syncedOk: true }, till2);
    });
  });

  describe("2. closed shift: inactive, never a false offline", () => {
    it("a till that closed its shift and went quiet is inactive", async () => {
      const shift = await openOnTill();
      await beat({ pendingCount: 0, syncedOk: true });
      await closeShift(shift, key());
      await age(10 * 60_000);
      await age(10 * 60_000, till2);
      expect(await tillState()).toBe("inactive");
      expect((await store()).status).toBe("inactive");
    });

    it("even if it last reported saved sales, with no shift open it is inactive, not offline", async () => {
      await beat({ pendingCount: 3, syncedOk: false, syncActive: false });
      await age(60 * 60_000);
      expect(await tillState()).toBe("inactive");
      expect((await store()).status).not.toBe("offline");
    });

    it("a browser shift in a store whose tills are off doesn't make the store offline", async () => {
      const browser = await openBrowserShift();
      expect((await store()).status).toBe("inactive");
      await closeShift(browser, {});
    });
  });

  describe("3. syncing transitions", () => {
    let shift: string;
    const lastGood = async () => (await prisma.terminalStatus.findUniqueOrThrow({ where: { terminalId: till1.id } })).lastSyncSuccessAt;
    beforeAll(async () => {
      shift = await openOnTill();
    });
    afterAll(async () => {
      await closeShift(shift, key());
    });

    it("online -> syncing -> online; the last good sync only moves on a clean pass", async () => {
      await beat({ pendingCount: 0, syncedOk: true, syncActive: true });
      expect(await tillState()).toBe("online");
      const good = await lastGood();
      await beat({ pendingCount: 4, syncedOk: false, syncActive: true });
      expect(await tillState()).toBe("syncing");
      expect(await lastGood()).toEqual(good);
      await beat({ pendingCount: 1, syncedOk: false, syncActive: true });
      expect(await tillState()).toBe("syncing");
      await beat({ pendingCount: 0, syncedOk: true, syncActive: true });
      expect(await tillState()).toBe("online");
    });

    it("syncing holds through the 2-3 minute window, then offline with the shift open", async () => {
      await beat({ pendingCount: 2, syncedOk: false, syncActive: true });
      await age(2 * 60_000 + 30_000);
      expect(await tillState()).toBe("syncing");
      await age(3 * 60_000 + 1_000);
      expect(await tillState()).toBe("offline");
    });

    it("syncing -> waiting when the cashier signs out with sales still saved", async () => {
      await beat({ pendingCount: 2, syncedOk: false, syncActive: true });
      await beat({ pendingCount: 2, syncedOk: false, syncActive: false });
      expect(await tillState()).toBe("waiting");
    });

    it("nothing pending but a failed entry left: online, last good sync not moved", async () => {
      const before = await lastGood();
      await beat({ pendingCount: 0, syncedOk: false, syncActive: true });
      expect(await tillState()).toBe("online");
      expect(await lastGood()).toEqual(before);
    });
  });

  describe("4. replaying the same offline sale", () => {
    const stock = async () => Number((await prisma.inventoryItem.findFirstOrThrow({ where: { storeId, productId } })).quantity);
    const offlineSale = (shiftClientId: string) => ({
      storeId,
      shiftClientId,
      clientId: randomUUID(),
      terminalId: till1.id,
      lineItems: [{ productId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 2 }],
      offline: { createdAt: new Date(Date.now() - 60_000).toISOString() },
      actingUserId: ownerId,
    });
    let tillShift: string;
    beforeAll(async () => {
      tillShift = await openOnTill();
    });
    afterAll(async () => {
      await closeShift(tillShift, key());
    });

    it("one after another: one sale, one fiscal document, stock moved once, no exception", async () => {
      const before = await stock();
      const body = offlineSale(tillShift);
      const first = (await http().post("/sales").set(key()).send(body).expect(201)).body;
      for (let i = 0; i < 3; i++) {
        const again = (await http().post("/sales").set(key()).send(body).expect(201)).body;
        expect(again.id).toBe(first.id);
        expect(again.receiptNumber).toBe(first.receiptNumber);
      }
      expect(await prisma.sale.count({ where: { storeId, clientId: body.clientId } })).toBe(1);
      expect(await prisma.fiscalDocument.count({ where: { saleId: first.id } })).toBe(1);
      expect(await stock()).toBe(before - 1);
      expect(await exceptions((await shiftByClient(tillShift)).id)).toBe(0);
    });

    it("at the same time (5 copies): one sale, one fiscal document, stock moved once", async () => {
      const before = await stock();
      const body = offlineSale(tillShift);
      const results = await Promise.all(Array.from({ length: 5 }, () => http().post("/sales").set(key()).send(body)));
      const ok = results.filter((r) => r.status === 201);
      expect(ok.length).toBeGreaterThan(0);
      for (const r of results) expect([201, 409]).toContain(r.status);
      expect(new Set(ok.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.sale.count({ where: { storeId, clientId: body.clientId } })).toBe(1);
      expect(await prisma.fiscalDocument.count({ where: { sale: { storeId, clientId: body.clientId } } })).toBe(1);
      expect(await stock()).toBe(before - 1);
    });

    it("a flagged offline sale replayed at the same time is kept once and flagged once", async () => {
      const browser = await openBrowserShift();
      const body = offlineSale(browser);
      await Promise.all(Array.from({ length: 5 }, () => http().post("/sales").set(key()).send(body)));
      expect(await prisma.sale.count({ where: { storeId, clientId: body.clientId } })).toBe(1);
      expect(await exceptions((await shiftByClient(browser)).id)).toBe(1);
      await closeShift(browser, {});
    });
  });

  describe("4b. replaying the same flagged cash movement at the same time", () => {
    it("is kept once and flagged once", async () => {
      const browser = await openBrowserShift();
      const body = { storeId, shiftClientId: browser, clientId: randomUUID(), type: "IN", amount: 5, reason: "CHANGE_TOPUP" };
      const results = await Promise.all(Array.from({ length: 5 }, () => http().post("/shifts/cash-movements").set(auth()).set(key()).send(body)));
      const id = (await shiftByClient(browser)).id;
      expect(await prisma.cashMovement.count({ where: { shiftId: id, clientId: body.clientId } })).toBe(1);
      expect(await exceptions(id)).toBe(1);
      expect(results.filter((r) => r.status === 200).length).toBeGreaterThan(0);
      await closeShift(browser, {});
    });
  });

  describe("5. a refused close leaves no till exception", () => {
    it("an invalid count (400) on a mismatched close records nothing; the real close is flagged once", async () => {
      const shift = await openOnTill(till2);
      const id = (await shiftByClient(shift)).id;
      try {
        for (let i = 0; i < 2; i++) {
          await http()
            .post("/shifts/close")
            .set(auth())
            .set(key(till1))
            .send({ storeId, shiftClientId: shift, countedCash: 5, countedDenominations: { "5": -1 } })
            .expect(400);
        }
        expect(await exceptions(id)).toBe(0);
        expect((await shiftByClient(shift)).status).toBe("OPEN");
      } finally {
        await closeShift(shift, key(till1));
      }
      expect(await exceptions(id)).toBe(1);
      // A retry of the close that went through changes nothing.
      await closeShift(shift, key(till1));
      expect(await exceptions(id)).toBe(1);
    });

    it("a cashier refused (403) closing someone else's shift on another till records nothing", async () => {
      const shift = await openOnTill(till2);
      const id = (await shiftByClient(shift)).id;
      try {
        for (let i = 0; i < 2; i++) {
          await http().post("/shifts/close").set(auth(cashierToken)).set(key(till1)).send({ storeId, shiftClientId: shift, countedCash: 0 }).expect(403);
        }
        expect(await exceptions(id)).toBe(0);
        expect((await shiftByClient(shift)).status).toBe("OPEN");
      } finally {
        await closeShift(shift, key(till2));
      }
      expect(await exceptions(id)).toBe(0);
    });
  });
});
