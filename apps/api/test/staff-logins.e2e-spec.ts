import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { MailService } from "../src/common/mail/mail.service";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). A fresh
 * owner signs up, adds a cashier login, then moves, promotes, deactivates
 * and reactivates them — each change must apply to the cashier's existing
 * access token immediately. Deletes the business it creates in afterAll.
 */
describe("Staff logins (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MailService;
  const RUN = Date.now();
  const OWNER_EMAIL = `staff-owner-${RUN}@e2e.test`;
  const CASHIER_EMAIL = `staff-cashier-${RUN}@e2e.test`;
  const INVITED_EMAIL = `staff-invited-${RUN}@e2e.test`;
  const PASSWORD = "StaffPass123!";
  let businessId: string | undefined;

  let ownerToken: string;
  let storeA: string;
  let storeB: string;
  let cashierUserId: string;
  let cashierToken: string;

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
    mail = app.get(MailService);

    const reg = await http()
      .post("/auth/register")
      .send({
        businessName: "E2E Staff Shop",
        storeName: "E2E Store A",
        firstName: "Olive",
        lastName: "Owner",
        email: OWNER_EMAIL,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeA = reg.body.stores[0].id;

    const storeRes = await http().post("/stores").set(auth(ownerToken)).send({ name: "E2E Store B" }).expect(201);
    storeB = storeRes.body.id;
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

  function login(email: string, password = PASSWORD) {
    return http().post("/auth/login").send({ email, password });
  }

  it("creates an employee with a cashier login for store A in one request", async () => {
    const res = await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cara",
        lastName: "Cashier",
        storeId: storeA,
        login: { email: CASHIER_EMAIL, role: "CASHIER", storeIds: [storeA], password: PASSWORD },
      })
      .expect(201);

    expect(res.body.user).toMatchObject({
      email: CASHIER_EMAIL,
      role: "CASHIER",
      isActive: true,
      storeIds: [storeA],
    });
    cashierUserId = res.body.user.id;
  });

  it("the cashier can sign in and only sees store A", async () => {
    const res = await login(CASHIER_EMAIL).expect(200);
    cashierToken = res.body.accessToken;
    expect(res.body.stores.map((s: { id: string }) => s.id)).toEqual([storeA]);

    await http().get(`/stores/${storeA}/inventory`).set(auth(cashierToken)).expect(200);
    await http().get(`/stores/${storeB}/inventory`).set(auth(cashierToken)).expect(403);
  });

  it("moving the cashier to store B applies to their existing token", async () => {
    const res = await http()
      .patch(`/users/${cashierUserId}/access`)
      .set(auth(ownerToken))
      .send({ storeIds: [storeB] })
      .expect(200);
    expect(res.body.storeIds).toEqual([storeB]);

    await http().get(`/stores/${storeA}/inventory`).set(auth(cashierToken)).expect(403);
    await http().get(`/stores/${storeB}/inventory`).set(auth(cashierToken)).expect(200);
  });

  it("promoting to manager applies to their existing token", async () => {
    await http().get("/employees").set(auth(cashierToken)).expect(403);
    await http()
      .patch(`/users/${cashierUserId}/access`)
      .set(auth(ownerToken))
      .send({ role: "MANAGER" })
      .expect(200);
    await http().get("/employees").set(auth(cashierToken)).expect(200);
  });

  it("a manager can add employees but not logins", async () => {
    await http()
      .post("/employees")
      .set(auth(cashierToken))
      .send({ firstName: "No", lastName: "Login" })
      .expect(201);
    await http()
      .post("/employees")
      .set(auth(cashierToken))
      .send({
        firstName: "Sneaky",
        lastName: "Login",
        login: { email: `sneaky-${RUN}@e2e.test`, role: "CASHIER", storeIds: [storeB], password: PASSWORD },
      })
      .expect(403);
  });

  it("deactivating locks the user out immediately; reactivating restores access", async () => {
    await http()
      .patch(`/users/${cashierUserId}/access`)
      .set(auth(ownerToken))
      .send({ isActive: false })
      .expect(200);

    await http().get(`/stores/${storeB}/inventory`).set(auth(cashierToken)).expect(401);
    await login(CASHIER_EMAIL).expect(401);

    await http()
      .patch(`/users/${cashierUserId}/access`)
      .set(auth(ownerToken))
      .send({ isActive: true })
      .expect(200);
    await login(CASHIER_EMAIL).expect(200);
  });

  it("an invited employee sets their password from the emailed link", async () => {
    const employee = await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Ivy", lastName: "Invited" })
      .expect(201);
    expect(employee.body.user).toBeNull();

    const spy = jest.spyOn(mail, "sendStaffInviteEmail");
    const res = await http()
      .post(`/employees/${employee.body.id}/login`)
      .set(auth(ownerToken))
      .send({ email: INVITED_EMAIL, role: "CASHIER", storeIds: [storeA], sendInvite: true })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: INVITED_EMAIL, storeIds: [storeA] });

    const [to, params] = spy.mock.calls.at(-1)!;
    spy.mockRestore();
    expect(to).toBe(INVITED_EMAIL);
    expect(params.businessName).toBe("E2E Staff Shop");

    await http()
      .post("/auth/reset-password")
      .send({ token: params.token, newPassword: "InvitedPass123!" })
      .expect(200);
    await login(INVITED_EMAIL, "InvitedPass123!").expect(200);

    // A second login for the same employee is refused.
    await http()
      .post(`/employees/${employee.body.id}/login`)
      .set(auth(ownerToken))
      .send({ email: `again-${RUN}@e2e.test`, role: "CASHIER", storeIds: [storeA], password: PASSWORD })
      .expect(409);
  });

  it("rejects a store from another business when creating a login", async () => {
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cross",
        lastName: "Tenant",
        login: { email: `cross-${RUN}@e2e.test`, role: "CASHIER", storeIds: ["seed-store-main"], password: PASSWORD },
      })
      .expect(404);
  });

  it("the owner can't change the seed business's cashier, their own access, or create an owner", async () => {
    const seedCashier = await login("cashier@demo-store.test", "CashierPass123!").expect(200);
    await http()
      .patch(`/users/${seedCashier.body.user.id}/access`)
      .set(auth(ownerToken))
      .send({ isActive: false })
      .expect(404);

    const me = await login(OWNER_EMAIL).expect(200);
    await http()
      .patch(`/users/${me.body.user.id}/access`)
      .set(auth(ownerToken))
      .send({ isActive: false })
      .expect(403);

    await http()
      .post("/users")
      .set(auth(ownerToken))
      .send({ email: `owner2-${RUN}@e2e.test`, password: PASSWORD, firstName: "Two", lastName: "Owners", role: "OWNER" })
      .expect(400);
  });
});
