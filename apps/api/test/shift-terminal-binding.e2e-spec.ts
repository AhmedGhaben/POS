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
 * Shift/till integrity. A till (authenticated by its X-Terminal-Key) works
 * only in its own shift: opening and looking up a shift are bound to it,
 * and online sales into someone else's (or a browser's) shift are refused.
 * Work that already happened offline is kept, exactly once, and flagged to
 * managers on the shift. Browsers and older apps keep working as before.
 */
describe("Shift and till binding (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "BindPass123!";
  let businessId: string | undefined;
  let token: string;
  let ownerId: string;
  let storeId: string;
  let productId: string;
  let till1: { id: string; key: string; code: string };
  let till2: { id: string; key: string; code: string };

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const key = (t = till1) => ({ "X-Terminal-Key": t.key });
  const sale = (shiftClientId: string | undefined, extra: Record<string, unknown> = {}) => ({
    storeId,
    shiftClientId,
    clientId: randomUUID(),
    lineItems: [{ productId, quantity: 1 }],
    payments: [{ method: "CASH", amount: 2 }],
    ...extra,
  });
  const offline = () => ({ offline: { createdAt: new Date(Date.now() - 60_000).toISOString() }, actingUserId: ownerId });
  const exceptions = (shiftId: string) => prisma.auditLog.findMany({ where: { action: SHIFT_TERMINAL_MISMATCH, entityId: shiftId } });
  const shiftByClient = (clientId: string) => prisma.shift.findUniqueOrThrow({ where: { storeId_clientId: { storeId, clientId } } });

  /** A shift opened in a browser (no till key): a browser shift, terminalId null. */
  async function browserShift() {
    const clientId = randomUUID();
    await http().post("/shifts/open").set(auth()).send({ storeId, clientId, openingFloat: 0 }).expect(200);
    return clientId;
  }
  async function closeShift(clientId: string, headers: Record<string, string> = {}) {
    await http().post("/shifts/close").set(auth()).set(headers).send({ storeId, shiftClientId: clientId, countedCash: 0 }).expect(200);
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
      .send({ businessName: "E2E Bind Shop", storeName: "Loja", firstName: "Olga", lastName: "Owner", email: `bind-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerId = reg.body.user.id;
    token = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    productId = (await http().post("/products").set(auth()).send({ sku: `BIND-${RUN}`, name: "Pão", costPrice: 1, sellPrice: 2, exemptionCode: "M10" }).expect(201)).body.id;
    await http().put(`/stores/${storeId}/inventory/${productId}`).set(auth()).send({ quantity: 100 }).expect(200);
    till1 = (await http().post("/terminals").set(auth()).send({ storeId, name: "Caixa 1" }).expect(201)).body;
    till2 = (await http().post("/terminals").set(auth()).send({ storeId, name: "Caixa 2" }).expect(201)).body;
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("shifts are bound to the till's key", () => {
    it("a till opening a shift without sending its id gets it on its own till", async () => {
      const clientId = randomUUID();
      await http().post("/shifts/open").set(auth()).set(key()).send({ storeId, clientId, openingFloat: 0 }).expect(200);
      expect((await shiftByClient(clientId)).terminalId).toBe(till1.id);
      await closeShift(clientId, key());
    });

    it("online, a till can't open a shift for another till", async () => {
      await http().post("/shifts/open").set(auth()).set(key()).send({ storeId, clientId: randomUUID(), terminalId: till2.id, openingFloat: 0 }).expect(400);
    });

    it("offline (already happened), it's recorded on the till that sent it, and flagged", async () => {
      const clientId = randomUUID();
      await http().post("/shifts/open").set(key()).send({ storeId, clientId, terminalId: till2.id, openingFloat: 0, offline: true, actingUserId: ownerId }).expect(200);
      const shift = await shiftByClient(clientId);
      expect(shift.terminalId).toBe(till1.id);
      expect((await exceptions(shift.id)).map((e) => (e.metadata as { operation: string }).operation)).toEqual(["shift-open"]);
      await closeShift(clientId, key());
    });

    it("a till looking up its current shift never gets a browser shift, even if it doesn't say which till it is", async () => {
      const browser = await browserShift();
      const res = await http().get(`/shifts/current?storeId=${storeId}`).set(auth()).set(key()).expect(200);
      expect(res.body.shift).toBeNull();
      // The browser itself still finds it.
      expect((await http().get(`/shifts/current?storeId=${storeId}`).set(auth()).expect(200)).body.shift.clientId).toBe(browser);
      await closeShift(browser);
    });
  });

  describe("sales", () => {
    it("online, a till can't sell into a browser shift (nothing is written)", async () => {
      const browser = await browserShift();
      const before = await prisma.sale.count({ where: { storeId } });
      const res = await http().post("/sales").set(auth()).set(key()).send(sale(browser, { terminalId: till1.id })).expect(400);
      expect(res.body.message).toMatch(/isn't open on this till/);
      expect(await prisma.sale.count({ where: { storeId } })).toBe(before);
      await closeShift(browser);
    });

    it("online, a till can't sell into another till's shift, nor name another till", async () => {
      const own = randomUUID();
      await http().post("/shifts/open").set(auth()).set(key()).send({ storeId, clientId: own, openingFloat: 0 }).expect(200);
      const other = randomUUID();
      await http().post("/shifts/open").set(auth()).set(key(till2)).send({ storeId, clientId: other, openingFloat: 0 }).expect(200);
      await http().post("/sales").set(auth()).set(key()).send(sale(other, { terminalId: till1.id })).expect(400);
      await http().post("/sales").set(auth()).set(key()).send(sale(own, { terminalId: till2.id })).expect(400);
      // Its own shift: fine.
      const ok = (await http().post("/sales").set(auth()).set(key()).send(sale(own, { terminalId: till1.id })).expect(201)).body;
      expect(ok.terminalId).toBe(till1.id);
      await closeShift(own, key());
      await closeShift(other, key(till2));
    });

    it("offline, a till's sale in a browser shift is kept exactly once and flagged once; a retry changes nothing", async () => {
      const browser = await browserShift();
      const body = sale(browser, { terminalId: till1.id, ...offline() });
      const first = (await http().post("/sales").set(key()).send(body).expect(201)).body;
      const again = (await http().post("/sales").set(key()).send(body).expect(201)).body;
      expect(again.id).toBe(first.id);
      expect(await prisma.sale.count({ where: { storeId, clientId: body.clientId } })).toBe(1);
      expect(await prisma.fiscalDocument.count({ where: { saleId: first.id } })).toBe(1);
      const shift = await shiftByClient(browser);
      const flagged = await exceptions(shift.id);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].metadata).toMatchObject({ operation: "sale", requestTerminalId: till1.id, shiftTerminalId: null, offline: true, clientId: body.clientId, saleId: first.id });
      // The sale is recorded as it happened: in that shift, on that till.
      expect(first.terminalId).toBe(till1.id);
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: first.id } })).shiftId).toBe(shift.id);
    });
  });

  describe("managers see the exceptions; nothing else changes", () => {
    it("the shift's report lists them and the Shifts list counts them", async () => {
      const flaggedShift = await prisma.shift.findFirstOrThrow({ where: { storeId, terminalId: null, status: "OPEN" } });
      const report = (await http().get(`/shifts/${flaggedShift.id}`).set(auth()).expect(200)).body;
      expect(report.terminalExceptions).toEqual([
        expect.objectContaining({ operation: "sale", tillCode: till1.code, shiftTillCode: null, offline: true }),
      ]);
      const list = (await http().get(`/shifts?storeId=${storeId}`).set(auth()).expect(200)).body.items as { id: string; terminalExceptionCount: number }[];
      expect(list.find((s) => s.id === flaggedShift.id)!.terminalExceptionCount).toBe(1);
      expect(list.filter((s) => s.terminalExceptionCount === 0).length).toBeGreaterThan(0);
      await closeShift(flaggedShift.clientId);
    });
  });

  describe("cash movements and closes", () => {
    it("cash movements and the close from a till in a browser shift go through (nothing lost) and are flagged", async () => {
      const browser = await browserShift();
      await http().post("/shifts/cash-movements").set(auth()).set(key())
        .send({ storeId, shiftClientId: browser, clientId: randomUUID(), type: "IN", amount: 5, reason: "CHANGE_TOPUP" }).expect(200);
      await closeShift(browser, key());
      const shift = await shiftByClient(browser);
      expect(shift.status).toBe("CLOSED");
      expect((await exceptions(shift.id)).map((e) => (e.metadata as { operation: string }).operation)).toEqual(["cash-movement", "shift-close"]);
    });
  });

  describe("browsers and older apps keep working", () => {
    it("a browser sells in its own browser shift, with no exception", async () => {
      const browser = await browserShift();
      await http().post("/sales").set(auth()).send(sale(browser)).expect(201);
      expect(await exceptions((await shiftByClient(browser)).id)).toHaveLength(0);
      await closeShift(browser);
    });

    it("an older app that names a till without a key is treated as before", async () => {
      const browser = await browserShift();
      await http().post("/sales").set(auth()).send(sale(browser, { terminalId: till1.id })).expect(201);
      await closeShift(browser);
    });

    it("an old offline sale with no shift is accepted; one whose shift hasn't arrived waits (409)", async () => {
      await http().post("/sales").set(key()).send(sale(undefined, { terminalId: till1.id, ...offline() })).expect(201);
      await http().post("/sales").set(key()).send(sale(randomUUID(), { terminalId: till1.id, ...offline() })).expect(409);
    });
  });

  describe("Lojas agora (store status) sees a till's shift", () => {
    it("a till that opened its shift without sending its id is offline (not just off) when it goes quiet", async () => {
      const clientId = randomUUID();
      await http().post("/shifts/open").set(auth()).set(key()).send({ storeId, clientId, openingFloat: 0 }).expect(200);
      await http().post("/terminals/me/heartbeat").set(key()).send({ pendingCount: 0, syncedOk: true, syncActive: true }).expect(204);
      await prisma.terminalStatus.update({ where: { terminalId: till1.id }, data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) } });
      await prisma.terminal.update({ where: { id: till1.id }, data: { lastSeenAt: null } });
      const store = ((await http().get("/stores/status").set(auth()).expect(200)).body as { storeId: string; devices: { terminalId: string; status: string; hasOpenShift: boolean }[] }[])
        .find((s) => s.storeId === storeId)!;
      expect(store.devices.find((d) => d.terminalId === till1.id)).toMatchObject({ hasOpenShift: true, status: "offline" });
      await closeShift(clientId, key());
    });
  });
});
