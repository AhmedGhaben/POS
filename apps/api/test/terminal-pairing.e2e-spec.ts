import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Till codes (docs/plans/TILL_ESSENTIALS.md, part 5): an owner or manager
 * creates a 6-digit code; the new till swaps it, once, within 10 minutes,
 * for its registration and key. No password is typed on the till.
 */
describe("Till codes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "PairPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newCode = (name = "Back Till") =>
    http().post("/terminals/pairing-codes").set(auth(ownerToken)).send({ storeId, name });

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
        businessName: "E2E Pair Shop",
        storeName: "Pair Store",
        firstName: "Paula",
        lastName: "Pair",
        email: `pair-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    const email = `pair-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Cy", lastName: "Cash", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;
  }, 30_000);

  afterAll(async () => {
    try {
      if (businessId) {
        const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
        await prisma.$transaction([
          prisma.terminalPairingCode.deleteMany({ where: { businessId } }),
          prisma.terminal.deleteMany({ where: { businessId } }),
          prisma.auditLog.deleteMany({ where: { businessId } }),
          prisma.employee.deleteMany({ where: { businessId } }),
          prisma.storeUser.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.user.deleteMany({ where: { businessId } }),
          prisma.store.deleteMany({ where: { businessId } }),
          prisma.business.delete({ where: { id: businessId } }),
        ]);
      }
    } finally {
      await app.close();
    }
  });

  it("owners and managers create codes; cashiers can't", async () => {
    const res = await newCode().expect(201);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    await http().post("/terminals/pairing-codes").set(auth(cashierToken)).send({ storeId, name: "Nope" }).expect(403);
    // Only the hash is stored.
    const stored = await prisma.terminalPairingCode.findMany({ where: { businessId } });
    expect(stored.every((c) => c.codeHash !== res.body.code)).toBe(true);
  });

  it("the new till swaps a code, once, for its registration and key", async () => {
    const { code } = (await newCode("Front Till")).body;
    const res = await http().post("/terminals/pair").send({ code }).expect(201);
    expect(res.body).toMatchObject({ name: "Front Till", storeId, code: expect.stringMatching(/^POS-\d{3}$/) });
    expect(res.body.key).toMatch(/^[0-9a-f]{64}$/);
    await http().get("/terminals/me/staff").set("X-Terminal-Key", res.body.key).expect(200);

    const again = await http().post("/terminals/pair").send({ code }).expect(400);
    expect(again.body.message).toBe("That till code isn't valid or has expired");
  });

  it("wrong, malformed and expired codes are refused", async () => {
    await http().post("/terminals/pair").send({ code: "12345" }).expect(400);
    await http().post("/terminals/pair").send({ code: "abcdef" }).expect(400);
    const { code } = (await newCode()).body;
    const wrong = code === "000000" ? "000001" : "000000";
    await http().post("/terminals/pair").send({ code: wrong }).expect(400);

    await prisma.terminalPairingCode.updateMany({ where: { businessId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await http().post("/terminals/pair").set("X-Language", "pt-BR").send({ code }).expect(400);
    expect(expired.body.message).toBe("Esse código do caixa não é válido ou expirou");
  });
});
