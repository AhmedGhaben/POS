import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TILL_OF_ANOTHER_BUSINESS } from "../src/auth/auth.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";

/**
 * PR #15: a registered till belongs to its business. With its key on the
 * request (the Windows app sends it with every request), no session of
 * another business is handed out there: not by email and password (the
 * lock screen's "Sign in with email instead"), sign-up, an accountant's
 * company switch, or refreshing a session kept from before. Browsers, and
 * tills whose key no longer counts, are unchanged.
 */
describe("A registered till only signs in its own business (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "TillOwnPass123!";
  const businesses: string[] = [];
  let ownerA: { email: string; token: string };
  let ownerB: { email: string; token: string };
  let tillKeyA: string;
  let tillIdA: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const till = (key = tillKeyA) => ({ "X-Terminal-Key": key });
  const refreshCookie = (res: request.Response) =>
    ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith("refresh_token="))?.split(";")[0];

  async function register(prefix: string) {
    const email = `${prefix}-${RUN}@e2e.test`;
    const res = await http()
      .post("/auth/register")
      .send({ businessName: `${prefix} Lda`, storeName: `Loja ${prefix}`, firstName: "Olga", lastName: prefix, email, password: PASSWORD })
      .expect(201);
    businesses.push(res.body.user.businessId);
    return { email, token: res.body.accessToken as string, storeId: res.body.stores[0].id as string, businessId: res.body.user.businessId as string };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const a = await register("till-own-a");
    ownerA = a;
    ownerB = await register("till-own-b");
    const t = (await http().post("/terminals").set(auth(a.token)).send({ storeId: a.storeId, name: "Caixa A" }).expect(201)).body;
    tillKeyA = t.key;
    tillIdA = t.id;
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.accountantAccess.deleteMany({ where: { businessId: { in: businesses } } });
      await prisma.refreshToken.deleteMany({ where: { user: { email: `till-own-acc-${RUN}@e2e.test` } } });
      await prisma.user.deleteMany({ where: { email: `till-own-acc-${RUN}@e2e.test` } });
      for (const id of businesses) await deleteBusiness(prisma, id);
    } finally {
      await app.close();
    }
  });

  describe("email and password", () => {
    it("someone of another business can't sign in on the till: refused, no session, no refresh cookie", async () => {
      const res = await http().post("/auth/login").set(till()).send({ email: ownerB.email, password: PASSWORD }).expect(403);
      expect(res.body.message).toBe(TILL_OF_ANOTHER_BUSINESS);
      expect(res.body.accessToken).toBeUndefined();
      expect(refreshCookie(res)).toBeUndefined();
    });

    it("the refusal is translated for Angola", async () => {
      const res = await http().post("/auth/login").set(till()).set("X-Language", "pt-AO").send({ email: ownerB.email, password: PASSWORD }).expect(403);
      expect(res.body.message).toBe("Esta caixa pertence a outra empresa. Inicie sessão com uma conta dessa empresa.");
    });

    it("the wrong password is still just wrong credentials (nothing about the till is given away)", async () => {
      const res = await http().post("/auth/login").set(till()).send({ email: ownerB.email, password: "nope-nope-nope" }).expect(401);
      expect(res.body.message).toBe("Invalid credentials");
    });

    it("the till's own business signs in as before", async () => {
      const res = await http().post("/auth/login").set(till()).send({ email: ownerA.email, password: PASSWORD }).expect(200);
      expect(res.body.user.businessId).toBe(businesses[0]);
      expect(refreshCookie(res)).toBeDefined();
    });

    it("a browser (no key) and a key that doesn't count are unchanged", async () => {
      await http().post("/auth/login").send({ email: ownerB.email, password: PASSWORD }).expect(200);
      await http().post("/auth/login").set(till("x".repeat(64))).send({ email: ownerB.email, password: PASSWORD }).expect(200);
    });
  });

  it("nobody can create a new business from a registered till", async () => {
    const email = `till-own-new-${RUN}@e2e.test`;
    const res = await http()
      .post("/auth/register")
      .set(till())
      .send({ businessName: "Intruso Lda", storeName: "Loja", firstName: "I", lastName: "N", email, password: PASSWORD })
      .expect(403);
    expect(res.body.message).toBe(TILL_OF_ANOTHER_BUSINESS);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("a session of another business kept from before ends on this till: refresh refused (401), the till signs in again", async () => {
    const login = await http().post("/auth/login").send({ email: ownerB.email, password: PASSWORD }).expect(200);
    const cookie = refreshCookie(login)!;
    const refused = await http().post("/auth/refresh").set("Cookie", cookie).set(till()).expect(401);
    expect(refused.body.message).toBe(TILL_OF_ANOTHER_BUSINESS);
    // Elsewhere (a browser) that session is still good.
    await http().post("/auth/refresh").set("Cookie", cookie).expect(200);

    const own = await http().post("/auth/login").set(till()).send({ email: ownerA.email, password: PASSWORD }).expect(200);
    await http().post("/auth/refresh").set("Cookie", refreshCookie(own)!).set(till()).expect(200);
  });

  it("an accountant can't switch the till into another client company; into the till's own, yes", async () => {
    const email = `till-own-acc-${RUN}@e2e.test`;
    const accountant = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: "Carla", lastName: "Contabilista", role: "ACCOUNTANT", businessId: businesses[1] },
    });
    for (const businessId of businesses) {
      await prisma.accountantAccess.create({ data: { userId: accountant.id, businessId, invitedById: accountant.id, acceptedAt: new Date() } });
    }
    const login = await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200);
    const token = login.body.accessToken as string;
    const res = await http().post("/auth/switch-business").set(auth(token)).set(till()).send({ businessId: businesses[1] }).expect(403);
    expect(res.body.message).toBe(TILL_OF_ANOTHER_BUSINESS);
    await http().post("/auth/switch-business").set(auth(token)).set(till()).send({ businessId: businesses[0] }).expect(200);
  });

  it("once the till is withdrawn (its key no longer counts), sign-in is as in a browser", async () => {
    await http().patch(`/terminals/${tillIdA}`).set(auth(ownerA.token)).send({ isActive: false }).expect(200);
    await http().post("/auth/login").set(till()).send({ email: ownerB.email, password: PASSWORD }).expect(200);
  });
});
