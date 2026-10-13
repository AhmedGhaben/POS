import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";

/**
 * Till keys and PIN sign-in (docs/plans/TILL_ESSENTIALS.md, part 3): a till
 * gets a key when registered; the owner sets PINs; the till lists its staff
 * and signs them in with a PIN (locked after 5 wrong tries); a session can
 * be picked up after an offline PIN check; queued work uploads with the key
 * under the person who did it.
 */
describe("Till key and PIN sign-in (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "TillPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let storeId: string;
  let otherStoreId: string;
  let cashierId: string;
  let farCashierId: string;
  let terminalId: string;
  let key: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const till = (k = key) => ({ "X-Terminal-Key": k });

  async function addCashier(name: string, stores: string[]) {
    const email = `till-${name}-${RUN}@e2e.test`;
    const res = await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: name, lastName: "Till", login: { email, role: "CASHIER", storeIds: stores, password: PASSWORD } })
      .expect(201);
    return { id: res.body.user.id as string, email };
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
      .send({
        businessName: "E2E Till Shop",
        storeName: "Front",
        firstName: "Olga",
        lastName: "Owner",
        email: `till-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    otherStoreId = (await http().post("/stores").set(auth(ownerToken)).send({ name: "Back" }).expect(201)).body.id;

    cashierId = (await addCashier("Cass", [storeId])).id;
    farCashierId = (await addCashier("Faye", [otherStoreId])).id;

    productId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: "TILL-1", name: "Gum", costPrice: 0.5, sellPrice: 1, taxRate: 0 })
        .expect(201)
    ).body.id;
    await http().put(`/stores/${storeId}/inventory/${productId}`).set(auth(ownerToken)).send({ quantity: 50 }).expect(200);
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

  it("registering a till returns its key once; only the hash is stored", async () => {
    const res = await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Front Till" }).expect(201);
    terminalId = res.body.id;
    key = res.body.key;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const stored = await prisma.terminal.findUnique({ where: { id: terminalId } });
    expect(stored!.keyHash).not.toBe(key);
    // Listing tills never shows a key.
    const list = await http().get("/terminals").set(auth(ownerToken)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(key);
  });

  it("the owner sets PINs; they're checked for shape and never shown", async () => {
    await http().put(`/users/${cashierId}/pin`).set(auth(ownerToken)).send({ pin: "12a4" }).expect(400);
    await http().put(`/users/${cashierId}/pin`).set(auth(ownerToken)).send({ pin: "2468" }).expect(200, { hasPin: true });
    await http().put(`/users/${farCashierId}/pin`).set(auth(ownerToken)).send({ pin: "1357" }).expect(200);

    const employees = await http().get("/employees").set(auth(ownerToken)).expect(200);
    const cass = employees.body.find((e: { user: { id: string } | null }) => e.user?.id === cashierId);
    expect(cass.user.hasPin).toBe(true);
    expect(JSON.stringify(employees.body)).not.toContain("pbkdf2");
    const users = await http().get("/users").set(auth(ownerToken)).expect(200);
    expect(JSON.stringify(users.body)).not.toContain("pbkdf2");
  });

  it("the till lists who can sign in there with a PIN, with what it needs offline", async () => {
    await http().get("/terminals/me/staff").expect(401);
    await http().get("/terminals/me/staff").set(till("f".repeat(64))).expect(401);
    const res = await http().get("/terminals/me/staff").set(till()).expect(200);
    // Faye works in the other store; the owner has no PIN yet.
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: cashierId, firstName: "Cass", role: "CASHIER" });
    expect(res.body[0].pin).toMatch(/^pbkdf2-sha256\$/);
    expect(res.body[0].permissions).toMatchObject({ OPEN_DRAWER: false, VOID_SALE: false });
  });

  it("PIN sign-in needs the till's key and the right PIN, and gives a normal session", async () => {
    await http().post("/auth/pin").send({ userId: cashierId, pin: "2468" }).expect(401);
    await http().post("/auth/pin").set(till()).send({ userId: cashierId, pin: "0000" }).expect(401);
    const res = await http().post("/auth/pin").set(till()).send({ userId: cashierId, pin: "2468" }).expect(200);
    expect(res.body.user).toMatchObject({ id: cashierId, role: "CASHIER" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^refresh_token=/);
    await http().get("/users/me/permissions").set(auth(res.body.accessToken)).expect(200);

    const far = await http().post("/auth/pin").set(till()).send({ userId: farCashierId, pin: "1357" }).expect(403);
    expect(far.body.message).toBe("You don't have access to this till's store");
  });

  it("five wrong PINs lock it; the owner setting a new PIN unlocks it", async () => {
    for (let i = 0; i < 5; i++) {
      await http().post("/auth/pin").set(till()).send({ userId: cashierId, pin: "9999" }).expect(401);
    }
    const locked = await http().post("/auth/pin").set(till()).set("X-Language", "pt-PT").send({ userId: cashierId, pin: "2468" }).expect(403);
    expect(locked.body.message).toBe("Demasiados PIN errados. Tente novamente daqui a alguns minutos.");

    await http().put(`/users/${cashierId}/pin`).set(auth(ownerToken)).send({ pin: "2468" }).expect(200);
    await http().post("/auth/pin").set(till()).send({ userId: cashierId, pin: "2468" }).expect(200);
  });

  it("after an offline PIN check, the till can pick up a session for a while", async () => {
    await http()
      .post("/auth/pin/resume")
      .set(till())
      .send({ userId: cashierId, verifiedAt: new Date().toISOString() })
      .expect(200);
    const old = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    await http().post("/auth/pin/resume").set(till()).send({ userId: cashierId, verifiedAt: old }).expect(401);
    await http().post("/auth/pin/resume").send({ userId: cashierId, verifiedAt: new Date().toISOString() }).expect(401);
  });

  it("anyone can set their own PIN with their password", async () => {
    const login = await http().post("/auth/login").send({ email: `till-owner-${RUN}@e2e.test`, password: PASSWORD }).expect(200);
    const token = login.body.accessToken;
    await http().put("/users/me/pin").set(auth(token)).send({ pin: "8642", password: "nope-nope" }).expect(400);
    await http().put("/users/me/pin").set(auth(token)).send({ pin: "8642", password: PASSWORD }).expect(200);
    const staff = await http().get("/terminals/me/staff").set(till()).expect(200);
    expect(staff.body.map((s: { firstName: string }) => s.firstName).sort()).toEqual(["Cass", "Olga"]);
  });

  it("queued work uploads with the till's key, recorded under whoever was on the till", async () => {
    const body = (extra: object = {}) => ({
      storeId,
      clientId: randomUUID(),
      terminalId,
      offline: { createdAt: new Date().toISOString() },
      lineItems: [{ productId, quantity: 1, unitPrice: 1, taxRate: 0 }],
      payments: [{ method: "CASH", amount: 1 }],
      ...extra,
    });
    // No session at all: the key and actingUserId are enough.
    const sale = await http().post("/sales").set(till()).send(body({ actingUserId: cashierId })).expect(201);
    expect(sale.body.cashierId).toBe(cashierId);

    // Even with someone else signed in, the sale is the cashier's.
    const other = await http()
      .post("/sales")
      .set(till())
      .set(auth(ownerToken))
      .send(body({ actingUserId: cashierId }))
      .expect(201);
    expect(other.body.cashierId).toBe(cashierId);

    // Without the key, actingUserId means nothing.
    await http().post("/sales").send(body({ actingUserId: cashierId })).expect(401);
    const asOwner = await http().post("/sales").set(auth(ownerToken)).send(body({ actingUserId: cashierId })).expect(201);
    expect(asOwner.body.cashierId).not.toBe(cashierId);

    // Permissions are the acting person's: a cashier can't cancel.
    await http()
      .post("/sales/void")
      .set(till())
      .send({ storeId, saleId: sale.body.id, reason: "OTHER", actingUserId: cashierId })
      .expect(403);

    // Drawer openings too.
    const drawer = await http()
      .post("/drawer-events")
      .set(till())
      .send({
        storeId,
        clientId: randomUUID(),
        terminalId,
        reason: "SALE_CASH_PAYMENT",
        succeeded: true,
        offline: true,
        occurredAt: new Date().toISOString(),
        actingUserId: cashierId,
      })
      .expect(201);
    expect(drawer.body.user.id).toBe(cashierId);
  });

  it("a deactivated person or till can't upload or sign in", async () => {
    await http().patch(`/users/${cashierId}/access`).set(auth(ownerToken)).send({ isActive: false }).expect(200);
    await http()
      .post("/sales")
      .set(till())
      .send({ storeId, lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 1 }], actingUserId: cashierId })
      .expect(401);
    await http().patch(`/users/${cashierId}/access`).set(auth(ownerToken)).send({ isActive: true }).expect(200);

    await http().patch(`/terminals/${terminalId}`).set(auth(ownerToken)).send({ isActive: false }).expect(200);
    await http().post("/auth/pin").set(till()).send({ userId: cashierId, pin: "2468" }).expect(401);
    await http().patch(`/terminals/${terminalId}`).set(auth(ownerToken)).send({ isActive: true }).expect(200);
  });

  it("a new key replaces the old one", async () => {
    const res = await http().post(`/terminals/${terminalId}/key`).set(auth(ownerToken)).expect(201);
    expect(res.body.key).not.toBe(key);
    await http().get("/terminals/me/staff").set(till()).expect(401);
    key = res.body.key;
    await http().get("/terminals/me/staff").set(till()).expect(200);
  });
});
