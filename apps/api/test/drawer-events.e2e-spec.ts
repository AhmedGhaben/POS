import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Desktop part C: cash drawer openings recorded by tills (idempotent, kept
 * even when the user lacked OPEN_DRAWER, linked to the cash sale and the
 * terminal), the list for owners/managers, and /users/me/permissions.
 */
describe("Drawer events (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const OWNER_EMAIL = `drawer-owner-${RUN}@e2e.test`;
  const CASHIER_EMAIL = `drawer-cashier-${RUN}@e2e.test`;
  const PASSWORD = "DrawerPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let cashierUserId: string;
  let storeId: string;
  let terminalId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const event = (extra: Record<string, unknown> = {}) => ({
    storeId,
    clientId: randomUUID(),
    terminalId,
    reason: "MANUAL_OPEN",
    subReason: "CASH_PICKUP",
    succeeded: true,
    offline: false,
    occurredAt: new Date().toISOString(),
    ...extra,
  });

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
        businessName: "E2E Drawer Co",
        storeName: "E2E Drawer Store",
        firstName: "Dora",
        lastName: "Wer",
        email: OWNER_EMAIL,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    terminalId = (await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Front Till" }).expect(201))
      .body.id;

    productId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: `DRW-${RUN}`, name: "Drawer Widget", costPrice: 1, sellPrice: 10, taxRate: 0 })
        .expect(201)
    ).body.id;
    await http().put(`/stores/${storeId}/inventory/${productId}`).set(auth(ownerToken)).send({ quantity: 10 }).expect(200);

    const employee = await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cass",
        lastName: "Ier",
        login: { email: CASHIER_EMAIL, role: "CASHIER", storeIds: [storeId], password: PASSWORD },
      })
      .expect(201);
    cashierUserId = employee.body.user.id;
    cashierToken = (await http().post("/auth/login").send({ email: CASHIER_EMAIL, password: PASSWORD }).expect(200))
      .body.accessToken;
  });

  afterAll(async () => {
    if (businessId) {
      const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
      const storeIds = (await prisma.store.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
      const saleWhere = { storeId: { in: storeIds } };
      await prisma.$transaction([
        prisma.drawerEvent.deleteMany({ where: { businessId } }),
        prisma.salePayment.deleteMany({ where: { sale: saleWhere } }),
        prisma.saleLineItem.deleteMany({ where: { sale: saleWhere } }),
        prisma.sale.deleteMany({ where: saleWhere }),
        prisma.terminal.deleteMany({ where: { businessId } }),
        prisma.inventoryItem.deleteMany({ where: { storeId: { in: storeIds } } }),
        prisma.product.deleteMany({ where: { businessId } }),
        prisma.auditLog.deleteMany({ where: { businessId } }),
        prisma.employee.deleteMany({ where: { businessId } }),
        prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } }),
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

  it("each user can read their own permissions; only owners/managers may open the drawer by default", async () => {
    const owner = await http().get("/users/me/permissions").set(auth(ownerToken)).expect(200);
    const cashier = await http().get("/users/me/permissions").set(auth(cashierToken)).expect(200);
    expect(owner.body.OPEN_DRAWER).toBe(true);
    expect(cashier.body.OPEN_DRAWER).toBe(false);
  });

  it("a cash sale's drawer opening links to the sale and the terminal", async () => {
    const saleClientId = randomUUID();
    const sale = await http()
      .post("/sales")
      .set(auth(cashierToken))
      .send({
        storeId,
        clientId: saleClientId,
        lineItems: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 10, tendered: 20 }],
      })
      .expect(201);

    const res = await http()
      .post("/drawer-events")
      .set(auth(cashierToken))
      .send(event({ reason: "SALE_CASH_PAYMENT", subReason: undefined, saleClientId }))
      .expect(201);
    expect(res.body).toMatchObject({
      reason: "SALE_CASH_PAYMENT",
      subReason: null,
      saleId: sale.body.id,
      permitted: true,
      terminal: { code: "POS-001", name: "Front Till" },
    });
  });

  it("is idempotent by clientId", async () => {
    const body = event();
    const first = await http().post("/drawer-events").set(auth(ownerToken)).send(body).expect(201);
    const again = await http().post("/drawer-events").set(auth(ownerToken)).send(body).expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(await prisma.drawerEvent.count({ where: { storeId, clientId: body.clientId } })).toBe(1);
  });

  it("a manual opening without permission is kept and flagged, not refused", async () => {
    const res = await http()
      .post("/drawer-events")
      .set(auth(cashierToken))
      .send(event({ offline: true, note: "  float  " }))
      .expect(201);
    expect(res.body).toMatchObject({ permitted: false, createdOffline: true, note: "float", subReason: "CASH_PICKUP" });
  });

  it("once granted OPEN_DRAWER, the cashier's openings are permitted", async () => {
    await http()
      .patch(`/users/${cashierUserId}/permissions`)
      .set(auth(ownerToken))
      .send({ permission: "OPEN_DRAWER", granted: true })
      .expect(200);
    expect((await http().get("/users/me/permissions").set(auth(cashierToken)).expect(200)).body.OPEN_DRAWER).toBe(true);
    const res = await http().post("/drawer-events").set(auth(cashierToken)).send(event()).expect(201);
    expect(res.body.permitted).toBe(true);
  });

  it("records a failed drawer command with its error", async () => {
    const res = await http()
      .post("/drawer-events")
      .set(auth(ownerToken))
      .send(event({ subReason: "TEST", succeeded: false, error: "Printer not found" }))
      .expect(201);
    expect(res.body).toMatchObject({ succeeded: false, error: "Printer not found", subReason: "TEST" });
  });

  it("validates reason and sub-reason", async () => {
    await http().post("/drawer-events").set(auth(ownerToken)).send(event({ reason: "BORED" })).expect(400);
    await http().post("/drawer-events").set(auth(ownerToken)).send(event({ subReason: "LUNCH" })).expect(400);
    await http().post("/drawer-events").set(auth(ownerToken)).send(event({ clientId: "x" })).expect(400);
  });

  it("owners list and filter events; cashiers can't list", async () => {
    const all = await http().get("/drawer-events").set(auth(ownerToken)).expect(200);
    expect(all.body.total).toBe(5);
    const manual = await http().get("/drawer-events?reason=MANUAL_OPEN").set(auth(ownerToken)).expect(200);
    expect(manual.body.total).toBe(4);
    expect(manual.body.items[0].user.email).toBeDefined();
    await http().get("/drawer-events").set(auth(cashierToken)).expect(403);
  });
});
