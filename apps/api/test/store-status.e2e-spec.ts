import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * "Lojas agora" (docs/brand/SYNC_STATUS_SPEC.md): tills send a heartbeat
 * with their key; GET /stores/status shows each store's tills to owners
 * (every store) and managers (their stores only), never to cashiers or to
 * another business.
 */
describe("Store sync status (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "StatusPass123!";
  const businessIds: string[] = [];
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let otherOwnerToken: string;
  let storeA: string;
  let storeB: string;
  let storeC: string;
  let terminalId: string;
  let key: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const till = (k = key) => ({ "X-Terminal-Key": k });
  const status = (token: string) => http().get("/stores/status").set(auth(token));

  async function register(prefix: string, storeName: string) {
    const res = await http()
      .post("/auth/register")
      .send({ businessName: `${prefix} Shop`, storeName, firstName: "Olga", lastName: "Owner", email: `${prefix}-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessIds.push(res.body.user.businessId);
    return { token: res.body.accessToken as string, storeId: res.body.stores[0].id as string };
  }

  async function addLogin(name: string, role: "MANAGER" | "CASHIER", stores: string[]) {
    const email = `status-${name}-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: name, lastName: "Status", login: { email, role, storeIds: stores, password: PASSWORD } })
      .expect(201);
    const res = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    ({ token: ownerToken, storeId: storeA } = await register("status-owner", "Loja Central"));
    storeB = (await http().post("/stores").set(auth(ownerToken)).send({ name: "Loja 2" }).expect(201)).body.id;
    storeC = (await http().post("/stores").set(auth(ownerToken)).send({ name: "Loja 3" }).expect(201)).body.id;
    managerToken = await addLogin("Mara", "MANAGER", [storeA]);
    cashierToken = await addLogin("Cid", "CASHIER", [storeA]);
    ({ token: otherOwnerToken } = await register("status-other", "Elsewhere"));

    const res = await http().post("/terminals").set(auth(ownerToken)).send({ storeId: storeA, name: "Caixa 1" }).expect(201);
    terminalId = res.body.id;
    key = res.body.key;
  }, 60_000);

  afterAll(async () => {
    try {
      for (const id of businessIds) await deleteBusiness(prisma, id);
    } finally {
      await app.close();
    }
  });

  const storeIn = (body: { storeId: string }[], id: string) => body.find((s) => s.storeId === id) as any;

  it("a till that was never heard from is 'never'; stores without a Windows till are 'noTill'", async () => {
    const res = await status(ownerToken).expect(200);
    expect(res.body.map((s: { storeId: string }) => s.storeId)).toEqual([storeA, storeB, storeC]);
    const a = storeIn(res.body, storeA);
    expect(a.status).toBe("never");
    expect(a.devices).toEqual([
      expect.objectContaining({ terminalId, name: "Caixa 1", status: "never", lastSeenAt: null, lastSyncSuccessAt: null, pendingCountReported: 0 }),
    ]);
    expect(storeIn(res.body, storeB)).toMatchObject({ status: "noTill", devices: [] });
  });

  it("heartbeat: needs a valid till key and a well-formed body", async () => {
    await http().post("/terminals/me/heartbeat").send({ pendingCount: 0, syncedOk: true }).expect(401);
    await http().post("/terminals/me/heartbeat").set(till("x".repeat(40))).send({ pendingCount: 0, syncedOk: true }).expect(401);
    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: -1, syncedOk: true }).expect(400);
    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: 0 }).expect(400);
  });

  it("online after a heartbeat with nothing pending: last seen and last sync are the server's time", async () => {
    const before = Date.now();
    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: 0, syncedOk: true, appVersion: "0.3.0" }).expect(204);
    const a = storeIn((await status(ownerToken).expect(200)).body, storeA);
    expect(a.status).toBe("online");
    expect(a.devices[0]).toMatchObject({ status: "online", appVersion: "0.3.0", pendingCountReported: 0 });
    expect(new Date(a.devices[0].lastSeenAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(a.lastSyncSuccessAt).toBe(a.devices[0].lastSyncSuccessAt);
  });

  it("syncing while it reports sales to upload; the last good sync time stays", async () => {
    const lastGood = storeIn((await status(ownerToken)).body, storeA).devices[0].lastSyncSuccessAt;
    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: 3, syncedOk: false }).expect(204);
    const a = storeIn((await status(ownerToken).expect(200)).body, storeA);
    expect(a.status).toBe("syncing");
    expect(a.devices[0]).toMatchObject({ pendingCountReported: 3, lastSyncSuccessAt: lastGood });
  });

  it("not heard from for over 3 min: offline with its shift open, inactive without", async () => {
    await prisma.terminalStatus.update({ where: { terminalId }, data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) } });
    await prisma.terminal.update({ where: { id: terminalId }, data: { lastSeenAt: null } });
    expect(storeIn((await status(ownerToken)).body, storeA).status).toBe("inactive");

    await ensureShift(app, ownerToken, storeA, { terminalId, headers: till() });
    const a = storeIn((await status(ownerToken).expect(200)).body, storeA);
    expect(a.status).toBe("offline");
    expect(a.devices[0]).toMatchObject({ status: "offline", hasOpenShift: true });
    // "Sem ligação desde": when it was last heard from.
    expect(a.lastSeenAt).toBe(a.devices[0].lastSeenAt);
  });

  it("shift open, nobody signed in, till online: the till's key alone keeps it online", async () => {
    // Between cashiers the till sits on the PIN screen: no session, shift still open.
    // Its last upload was long ago; only the heartbeat (till key, no Authorization) says it's there.
    await prisma.terminal.update({ where: { id: terminalId }, data: { lastSeenAt: new Date(Date.now() - 30 * 60_000) } });
    expect(storeIn((await status(ownerToken)).body, storeA).status).toBe("offline");

    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: 0, syncedOk: true }).expect(204);
    let a = storeIn((await status(ownerToken).expect(200)).body, storeA);
    expect(a.status).toBe("online");
    expect(a.devices[0]).toMatchObject({ status: "online", hasOpenShift: true });

    // Still online two and a half minutes later (inside the 3-minute window), then
    // another heartbeat keeps it there.
    await prisma.terminalStatus.update({ where: { terminalId }, data: { lastSeenAt: new Date(Date.now() - 150_000) } });
    a = storeIn((await status(ownerToken)).body, storeA);
    expect(a.status).toBe("online");
    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: 0, syncedOk: true }).expect(204);
    expect(storeIn((await status(ownerToken)).body, storeA).status).toBe("online");
  });

  it("a browser shift in a store without a Windows till shows 'browser', never offline", async () => {
    await ensureShift(app, ownerToken, storeB);
    const res = (await status(ownerToken)).body;
    expect(storeIn(res, storeB)).toMatchObject({ status: "browser", devices: [] });
    expect(storeIn(res, storeC).status).toBe("noTill");
  });

  it("a manager sees only their stores", async () => {
    const res = await status(managerToken).expect(200);
    expect(res.body.map((s: { storeId: string }) => s.storeId)).toEqual([storeA]);
  });

  it("cashiers can't read it, and nobody sees another business's stores", async () => {
    await status(cashierToken).expect(403);
    await http().get("/stores/status").expect(401);
    const other = (await status(otherOwnerToken).expect(200)).body as { storeId: string }[];
    expect(other).toHaveLength(1);
    expect(other.map((s) => s.storeId)).not.toEqual(expect.arrayContaining([storeA]));
  });

  it("a till's heartbeat only ever updates its own status", async () => {
    await http().post("/terminals/me/heartbeat").set(till()).send({ pendingCount: 0, syncedOk: true }).expect(204);
    expect(await prisma.terminalStatus.count({ where: { terminal: { businessId: { in: businessIds } } } })).toBe(1);
  });
});
