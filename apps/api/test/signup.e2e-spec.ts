import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { MailService } from "../src/common/mail/mail.service";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). Covers
 * self-serve sign-up: register → use the API as the new owner → tenant
 * isolation from the seed business → email verification. Deletes everything
 * it creates in afterAll so runs don't pile up rows in the dev DB.
 */
describe("Sign-up & email verification (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MailService;
  const EMAIL = `signup-${Date.now()}@e2e.test`;
  const SEED_BUSINESS_ID = "seed-business";
  let businessId: string | undefined;

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
  });

  afterAll(async () => {
    if (businessId) {
      const userIds = (
        await prisma.user.findMany({ where: { businessId }, select: { id: true } })
      ).map((u) => u.id);
      await prisma.$transaction([
        prisma.auditLog.deleteMany({ where: { businessId } }),
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

  /** The raw token only exists in the email, so capture it from the mail call. */
  function captureVerificationToken(): () => string {
    const spy = jest.spyOn(mail, "sendEmailVerificationEmail");
    return () => {
      const token = spy.mock.calls.at(-1)?.[2];
      spy.mockRestore();
      if (!token) throw new Error("no verification email was sent");
      return token;
    };
  }

  let accessToken: string;
  let verificationToken: string;

  it("registers a new business, store and owner and returns a session", async () => {
    const getToken = captureVerificationToken();
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        businessName: "E2E Signup Cafe",
        storeName: "E2E Main Street",
        firstName: "Sam",
        lastName: "Signup",
        email: EMAIL.toUpperCase(),
        password: "SignupPass123!",
        timezone: "Europe/Paris",
      })
      .expect(201);

    businessId = res.body.user.businessId;
    accessToken = res.body.accessToken;
    verificationToken = getToken();

    expect(res.body.user).toMatchObject({ email: EMAIL, role: "OWNER", emailVerified: false });
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0]).toMatchObject({ name: "E2E Main Street", timezone: "Europe/Paris" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^refresh_token=/);
  });

  it("rejects a second sign-up with the same email in different casing (409)", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        businessName: "Dupe",
        storeName: "Dupe",
        firstName: "D",
        lastName: "D",
        email: ` ${EMAIL.replace("signup", "SignUp")} `,
        password: "SignupPass123!",
      })
      .expect(409);
  });

  it("rejects an invalid timezone (400)", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        businessName: "Bad TZ",
        storeName: "Bad TZ",
        firstName: "B",
        lastName: "T",
        email: `badtz-${Date.now()}@e2e.test`,
        password: "SignupPass123!",
        timezone: "Mars/Olympus",
      })
      .expect(400);
  });

  it("lets the new owner use the API, scoped to their own business only", async () => {
    const business = await request(app.getHttpServer())
      .get("/businesses/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(business.body).toMatchObject({ id: businessId, name: "E2E Signup Cafe", plan: "SIMPLE" });

    const stores = await request(app.getHttpServer())
      .get("/stores")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(stores.body).toHaveLength(1);
    expect(stores.body.every((s: { businessId: string }) => s.businessId === businessId)).toBe(true);
    expect(stores.body.some((s: { businessId: string }) => s.businessId === SEED_BUSINESS_ID)).toBe(false);
  });

  it("can log in with the new credentials, email in any casing", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: EMAIL.toUpperCase(), password: "SignupPass123!" })
      .expect(200);
  });

  it("verifies the email from the link token, and rejects reusing it", async () => {
    await request(app.getHttpServer())
      .post("/auth/verify-email")
      .send({ token: verificationToken })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: EMAIL, password: "SignupPass123!" })
      .expect(200);
    expect(login.body.user.emailVerified).toBe(true);

    await request(app.getHttpServer())
      .post("/auth/verify-email")
      .send({ token: verificationToken })
      .expect(400);
  });

  it("does not resend a verification email once verified", async () => {
    const spy = jest.spyOn(mail, "sendEmailVerificationEmail");
    await request(app.getHttpServer())
      .post("/auth/resend-verification")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("requires authentication to resend verification", async () => {
    await request(app.getHttpServer()).post("/auth/resend-verification").expect(401);
  });
});
