import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/** 1x1 transparent PNG. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). A fresh
 * owner edits business settings, store details and the logo; a cashier of
 * the same business can read but not change them. Deletes the business it
 * creates in afterAll.
 */
describe("Business settings (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const OWNER_EMAIL = `settings-owner-${RUN}@e2e.test`;
  const CASHIER_EMAIL = `settings-cashier-${RUN}@e2e.test`;
  const PASSWORD = "SettingsPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
        businessName: "E2E Settings Shop",
        storeName: "E2E Settings Store",
        firstName: "Sam",
        lastName: "Settings",
        email: OWNER_EMAIL,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    expect(reg.body.business).toMatchObject({ name: "E2E Settings Shop", currency: "USD", logoUrl: null });

    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cal",
        lastName: "Cashier",
        login: { email: CASHIER_EMAIL, role: "CASHIER", storeIds: [storeId], password: PASSWORD },
      })
      .expect(201);
    const cashier = await http().post("/auth/login").send({ email: CASHIER_EMAIL, password: PASSWORD }).expect(200);
    cashierToken = cashier.body.accessToken;
  });

  afterAll(async () => {
    if (businessId) {
      const userIds = (
        await prisma.user.findMany({ where: { businessId }, select: { id: true } })
      ).map((u) => u.id);
      await prisma.$transaction([
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

  it("the owner updates business details, currency and default tax", async () => {
    const res = await http()
      .patch("/businesses/me")
      .set(auth(ownerToken))
      .send({
        legalName: "E2E Settings Shop LLC",
        taxId: " VAT-123 ",
        address: "1 Test Street",
        currency: "EUR",
        defaultTaxRate: 19,
        receiptFooter: "Merci !",
        website: "",
      })
      .expect(200);

    expect(res.body).toMatchObject({
      legalName: "E2E Settings Shop LLC",
      taxId: "VAT-123",
      currency: "EUR",
      defaultTaxRate: "19",
      receiptFooter: "Merci !",
      website: null,
    });
    expect(res.body).not.toHaveProperty("logo");
  });

  it("rejects a 3-decimal currency and unknown codes", async () => {
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ currency: "TND" }).expect(400);
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ currency: "XYZ" }).expect(400);
  });

  it("sends the settings with the session, to cashiers too", async () => {
    const login = await http().post("/auth/login").send({ email: CASHIER_EMAIL, password: PASSWORD }).expect(200);
    expect(login.body.business).toMatchObject({ currency: "EUR", receiptFooter: "Merci !" });

    const me = await http().get("/businesses/me").set(auth(cashierToken)).expect(200);
    expect(me.body.currency).toBe("EUR");
  });

  it("only the owner can change settings", async () => {
    await http().patch("/businesses/me").set(auth(cashierToken)).send({ currency: "GBP" }).expect(403);
    await http().patch(`/stores/${storeId}`).set(auth(cashierToken)).send({ name: "Hacked" }).expect(403);
    await http()
      .put("/businesses/me/logo")
      .set(auth(cashierToken))
      .send({ dataUrl: `data:image/png;base64,${PNG_1PX.toString("base64")}` })
      .expect(403);
  });

  it("uploads, serves and removes the logo", async () => {
    const res = await http()
      .put("/businesses/me/logo")
      .set(auth(ownerToken))
      .send({ dataUrl: `data:image/png;base64,${PNG_1PX.toString("base64")}` })
      .expect(200);
    expect(res.body.logoUrl).toMatch(new RegExp(`^/businesses/${businessId}/logo\\?v=\\d+$`));

    // Public: loaded by <img> tags without an Authorization header.
    const logo = await http().get(res.body.logoUrl).expect(200);
    expect(logo.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(logo.body, PNG_1PX)).toBe(0);

    await http().delete("/businesses/me/logo").set(auth(ownerToken)).expect(200);
    await http().get(`/businesses/${businessId}/logo`).expect(404);
  });

  it("rejects a logo whose bytes aren't the declared image type", async () => {
    await http()
      .put("/businesses/me/logo")
      .set(auth(ownerToken))
      .send({ dataUrl: `data:image/png;base64,${Buffer.from("<svg></svg>").toString("base64")}` })
      .expect(400);
  });

  it("edits a store, but not another business's store", async () => {
    const res = await http()
      .patch(`/stores/${storeId}`)
      .set(auth(ownerToken))
      .send({ name: "E2E Renamed Store", phone: "+1 555 0100", timezone: "Europe/Berlin", address: "" })
      .expect(200);
    expect(res.body).toMatchObject({
      name: "E2E Renamed Store",
      phone: "+1 555 0100",
      timezone: "Europe/Berlin",
      address: null,
    });

    await http().patch("/stores/seed-store-main").set(auth(ownerToken)).send({ name: "Nope" }).expect(404);
  });
});
