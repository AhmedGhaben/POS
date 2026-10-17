import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";

/**
 * Contabilidade (docs/ACCOUNTING-DECISIONS.md): the chart of accounts,
 * periods, entries, the automatic posting from the POS, reports, year-end
 * and the SAF-T (AO) accounting file.
 */
describe("Accounting (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "AccountingPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let storeId: string;
  let customerId: string;
  let supplierId: string;
  let terminalId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  type Account = { id: string; code: string; name: string; category: string; parentId: string | null; linkType: string | null; linkId: string | null; isActive: boolean };
  const accounts = async () => (await http().get("/accounting/accounts").set(auth(ownerToken)).expect(200)).body as Account[];
  const byCode = async (code: string) => (await accounts()).find((a) => a.code === code)!;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "Contas E2E Lda", storeName: "Loja Mutamba", firstName: "Ana", lastName: "Owner", email: `acc-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    for (const role of ["MANAGER", "CASHIER"] as const) {
      const email = `acc-${role.toLowerCase()}-${RUN}@e2e.test`;
      await http()
        .post("/employees")
        .set(auth(ownerToken))
        .send({ firstName: role, lastName: "E2E", login: { email, role, storeIds: [storeId], password: PASSWORD } })
        .expect(201);
      const token = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (role === "MANAGER") managerToken = token;
      else cashierToken = token;
    }
    customerId = (await http().post("/customers").set(auth(ownerToken)).send({ name: "Kianda Comércio", taxId: "5000123456" }).expect(201)).body.id;
    supplierId = (await http().post("/suppliers").set(auth(ownerToken)).send({ name: "Grossista do Kikolo", taxId: "5401234567" }).expect(201)).body.id;
    terminalId = (await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Caixa 1" }).expect(201)).body.id;
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("A1: chart of accounts", () => {
    it("is off until the owner switches it on; managers can look, cashiers can't, only the owner changes it", async () => {
      const status = (await http().get("/accounting/status").set(auth(managerToken)).expect(200)).body;
      expect(status.enabled).toBe(false);
      await http().get("/accounting/status").set(auth(cashierToken)).expect(403);
      await http().patch("/accounting/settings").set(auth(managerToken)).send({ enabled: true }).expect(403);
    });

    it("switching it on installs the PGC chart and opens accounts for customers, suppliers and tills", async () => {
      const status = (await http().patch("/accounting/settings").set(auth(ownerToken)).send({ enabled: true, startDate: "2026-01-01" }).expect(200)).body;
      expect(status.enabled).toBe(true);
      expect(status.settings.startDate).toBe("2026-01-01");
      const list = await accounts();
      const codes = list.map((a) => a.code);
      expect(codes.slice(0, 3)).toEqual(["11", "11.1", "11.2"]);
      expect(list.find((a) => a.code === "31")!.category).toBe("GR");
      expect(list.find((a) => a.code === "31.1")!.category).toBe("GA");
      expect(list.find((a) => a.code === "26.1")!.category).toBe("GM");
      // No classes as accounts.
      expect(codes.some((c) => c.length === 1)).toBe(false);

      const customer = list.find((a) => a.linkType === "CUSTOMER" && a.linkId === customerId)!;
      expect(customer).toMatchObject({ code: "31.1.2.1.0001", name: "Kianda Comércio", category: "GM" });
      expect(list.find((a) => a.code === "31.1.2.1")!.category).toBe("GA");
      expect(list.find((a) => a.linkType === "SUPPLIER" && a.linkId === supplierId)!.code).toBe("32.1.2.1.0001");
      const till = list.find((a) => a.linkType === "TILL" && a.linkId === terminalId)!;
      expect(till.code).toBe("45.1.2");
      expect(till.name).toMatch(/^Caixa POS-001 – Caixa 1 \(Loja Mutamba\)$/);
      // Consumidor Final sells for cash: no account.
      const finalConsumer = await prisma.customer.findFirstOrThrow({ where: { businessId, isFinalConsumer: true } });
      expect(list.some((a) => a.linkId === finalConsumer.id)).toBe(false);
    });

    it("new customers and suppliers get their account at the next sync; names follow renames", async () => {
      const other = (await http().post("/customers").set(auth(ownerToken)).send({ name: "Bar Ilha", country: "PT" }).expect(201)).body.id;
      await http().patch(`/customers/${customerId}`).set(auth(ownerToken)).send({ name: "Kianda Comércio, SA" }).expect(200);
      expect((await http().post("/accounting/accounts/sync").set(auth(ownerToken)).expect(200)).body.created).toBe(1);
      const list = await accounts();
      expect(list.find((a) => a.linkId === other)!.code).toBe("31.1.2.2.0001"); // a foreign customer
      expect(list.find((a) => a.linkId === customerId)!.name).toBe("Kianda Comércio, SA");
      expect((await http().post("/accounting/accounts/sync").set(auth(ownerToken)).expect(200)).body.created).toBe(0);
    });

    it("the accountant adds sub-accounts under a parent that exists; a movement account becomes aggregating", async () => {
      await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "75.2.9.1", name: "Limpeza" }).expect(201);
      expect((await byCode("75.2.9")).category).toBe("GA");
      expect((await byCode("75.2.9.1")).category).toBe("GM");
      await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "75.2.9.1", name: "Outra" }).expect(409);
      await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "75.7.1", name: "Sem pai" }).expect(400);
      await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "7", name: "Uma classe" }).expect(400);
      await http().post("/accounting/accounts").set(auth(managerToken)).send({ code: "75.2.9.2", name: "Gerente" }).expect(403);
      // The app's own accounts don't take sub-accounts.
      await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "31.1.2.1.0001.1", name: "Sub" }).expect(400);
    });

    it("renames, deactivates and removes; the parent goes back to a movement account", async () => {
      const limpeza = await byCode("75.2.9.1");
      await http().patch(`/accounting/accounts/${limpeza.id}`).set(auth(ownerToken)).send({ name: "Limpeza e higiene", isActive: false }).expect(200);
      expect(await byCode("75.2.9.1")).toMatchObject({ name: "Limpeza e higiene", isActive: false });
      const parent = await byCode("75.2.9");
      await http().delete(`/accounting/accounts/${parent.id}`).set(auth(ownerToken)).expect(400); // has a sub-account
      await http().delete(`/accounting/accounts/${limpeza.id}`).set(auth(ownerToken)).expect(200);
      expect((await byCode("75.2.9")).category).toBe("GM");
      const customer = (await accounts()).find((a) => a.linkId === customerId)!;
      await http().delete(`/accounting/accounts/${customer.id}`).set(auth(ownerToken)).expect(400); // kept by the app
    });

    it("the database refuses codes SAF-T can't carry", async () => {
      await expect(
        prisma.ledgerAccount.create({ data: { businessId: businessId!, code: "31 1", name: "x", category: "GM", classNo: 3 } }),
      ).rejects.toThrow(/ledger_accounts_code_format/);
    });
  });
});
