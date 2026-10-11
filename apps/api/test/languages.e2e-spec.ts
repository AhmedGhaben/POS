import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Languages (docs/plans/I18N.md): the sign-up language becomes the owner's
 * and the business's; each person sets their own; the owner sets the
 * business's (used for receipts and invoices).
 */
describe("Languages (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const EMAIL = `lang-owner-${RUN}@e2e.test`;
  const PASSWORD = "LangPass123!";
  let businessId: string | undefined;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      if (businessId) {
        // The audit log is written just after each response; let the last
        // request's entry land before deleting, or it blocks the business delete.
        await new Promise((r) => setTimeout(r, 500));
        const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
        await prisma.$transaction([
          prisma.auditLog.deleteMany({ where: { businessId } }),
          prisma.storeUser.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.user.deleteMany({ where: { businessId } }),
          prisma.store.deleteMany({ where: { businessId } }),
          prisma.business.delete({ where: { id: businessId } }),
        ]);
      }
    } finally {
      // Always, so a failed clean-up can't leave Jest hanging.
      await app.close();
    }
  });

  it("signing up in Brazilian Portuguese sets the owner's and the business's language", async () => {
    const res = await http()
      .post("/auth/register")
      .send({
        businessName: "Loja Teste",
        storeName: "Centro",
        firstName: "Ana",
        lastName: "Lima",
        email: EMAIL,
        password: PASSWORD,
        language: "pt-BR",
      })
      .expect(201);
    businessId = res.body.user.businessId;
    token = res.body.accessToken;
    expect(res.body.user.language).toBe("pt-BR");
    expect(res.body.business.language).toBe("pt-BR");
  });

  it("an unsupported sign-up language is refused", async () => {
    await http()
      .post("/auth/register")
      .send({ businessName: "X", storeName: "Y", firstName: "A", lastName: "B", email: `x-${RUN}@e2e.test`, password: PASSWORD, language: "fr" })
      .expect(400);
  });

  it("a person changes their own language, and it comes back at the next sign-in", async () => {
    await http().patch("/users/me/language").set(auth()).send({ language: "pt-PT" }).expect(200, { language: "pt-PT" });
    await http().patch("/users/me/language").set(auth()).send({ language: "de" }).expect(400);
    const login = await http().post("/auth/login").send({ email: EMAIL, password: PASSWORD }).expect(200);
    expect(login.body.user.language).toBe("pt-PT");
    // The business language is separate.
    expect(login.body.business.language).toBe("pt-BR");
  });

  it("error messages come back in the language the app sends", async () => {
    const wrong = { email: EMAIL, password: "not-the-password" };
    const pt = await http().post("/auth/login").set("X-Language", "pt-PT").send(wrong).expect(401);
    expect(pt.body.message).toBe("Email ou palavra-passe incorretos");
    const br = await http().post("/auth/login").set("X-Language", "pt-BR").send(wrong).expect(401);
    expect(br.body.message).toBe("E-mail ou senha incorretos");
    const en = await http().post("/auth/login").send(wrong).expect(401);
    expect(en.body.message).toBe("Invalid credentials");
  });

  it("the owner sets the business language", async () => {
    const res = await http().patch("/businesses/me").set(auth()).send({ language: "en" }).expect(200);
    expect(res.body.language).toBe("en");
    await http().patch("/businesses/me").set(auth()).send({ language: "xx" }).expect(400);
  });
});
