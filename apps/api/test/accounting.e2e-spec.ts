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
  type Account = { id: string; code: string; name: string; category: string; parentId: string | null; linkType: string | null; linkId: string | null; isActive: boolean; hasMovements: boolean };
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

  describe("A2: fiscal years and periods", () => {
    type Year = { year: number; status: string; periods: { number: number; status: string; startDate: string; endDate: string; closedBy: string | null }[] };
    const years = async () => (await http().get("/accounting/years").set(auth(managerToken)).expect(200)).body as Year[];

    it("switching on opened the years from the start date: 16 periods each (0 opening, 1-12, 13-15 year-end)", async () => {
      const y = (await years()).find((x) => x.year === 2026)!;
      expect(y.status).toBe("OPEN");
      expect(y.periods.map((p) => p.number)).toEqual([...Array(16).keys()]);
      expect(y.periods[2]).toMatchObject({ startDate: "2026-02-01", endDate: "2026-02-28" });
      expect(y.periods[14]).toMatchObject({ startDate: "2026-12-31", endDate: "2026-12-31" });
    });

    it("a year is added on request (once)", async () => {
      await http().post("/accounting/years").set(auth(ownerToken)).send({ year: 2027 }).expect(201);
      await http().post("/accounting/years").set(auth(ownerToken)).send({ year: 2027 }).expect(201);
      expect((await years()).filter((y) => y.year === 2027)).toHaveLength(1);
      await http().post("/accounting/years").set(auth(managerToken)).send({ year: 2028 }).expect(403);
    });

    it("closing a period records who; reopening needs a reason and is in the audit log", async () => {
      await http().post("/accounting/periods/2026/3/close").set(auth(managerToken)).expect(403);
      await http().post("/accounting/periods/2026/3/close").set(auth(ownerToken)).expect(200);
      expect((await years()).find((y) => y.year === 2026)!.periods[3]).toMatchObject({ status: "CLOSED", closedBy: "Ana Owner" });
      await http().post("/accounting/periods/2026/3/reopen").set(auth(ownerToken)).send({}).expect(400);
      await http().post("/accounting/periods/2026/3/reopen").set(auth(ownerToken)).send({ reason: "Factura de fornecedor esquecida" }).expect(200);
      expect((await years()).find((y) => y.year === 2026)!.periods[3].status).toBe("OPEN");
      const log = await prisma.auditLog.findFirstOrThrow({ where: { businessId, action: "ACCOUNTING_PERIOD_REOPENED" } });
      expect(log.metadata).toMatchObject({ year: 2026, period: 3, reason: "Factura de fornecedor esquecida" });
      await http().post("/accounting/periods/2026/16/close").set(auth(ownerToken)).expect(404);
    });
  });
  describe("A3: journals and entries", () => {
    type Line = { account: { code: string }; debit: string; credit: string; description: string; sourceDocumentId: string | null };
    type Entry = { id: string; transactionId: string; docArchivalNumber: string; number: number; period: number; lines: Line[]; reverses: { id: string } | null; totalDebit: string };
    let journalId: string;
    let first: Entry;
    const accountIdOf: Record<string, string> = {};
    const entry = (over: Record<string, unknown> = {}, token = ownerToken) =>
      http()
        .post("/accounting/entries")
        .set(auth(token))
        .send({
          journalId,
          transactionDate: "2026-04-10",
          description: "Renda de Abril",
          lines: [
            { accountId: accountIdOf["75.2.1"], debit: 150000 },
            { accountId: accountIdOf["45.1.1"], credit: 150000 },
          ],
          ...over,
        });

    beforeAll(async () => {
      for (const a of await accounts()) accountIdOf[a.code] = a.id;
      const journals = (await http().get("/accounting/journals").set(auth(managerToken)).expect(200)).body as { id: string; code: string; kind: string }[];
      expect(journals.map((j) => j.code).sort()).toEqual(["ABE", "APU", "BCO", "COM", "CXA", "OPD", "SAL", "VEN"]);
      journalId = journals.find((j) => j.code === "OPD")!.id;
    });

    it("a balanced entry is numbered in its journal and year, with its SAF-T TransactionID", async () => {
      first = (await entry().expect(201)).body;
      expect(first).toMatchObject({ number: 1, docArchivalNumber: "2026/1", transactionId: "2026-04-10 OPD 2026/1", period: 4, totalDebit: "150000.00" });
      expect(first.lines.map((l) => [l.account.code, l.debit, l.credit])).toEqual([["75.2.1", "150000.00", "0.00"], ["45.1.1", "0.00", "150000.00"]]);
      const second = (await entry({ transactionDate: "2026-04-20" }).expect(201)).body;
      expect(second.transactionId).toBe("2026-04-20 OPD 2026/2");
    });

    it("refuses what doesn't balance, one-sided entries, aggregating or inactive accounts, and managers", async () => {
      await entry({ lines: [{ accountId: accountIdOf["75.2.1"], debit: 100 }, { accountId: accountIdOf["45.1.1"], credit: 99.99 }] }).expect(400);
      await entry({ lines: [{ accountId: accountIdOf["75.2.1"], debit: 100 }, { accountId: accountIdOf["45.1.1"], debit: 100 }] }).expect(400);
      const ga = (await entry({ lines: [{ accountId: accountIdOf["75.2"], debit: 100 }, { accountId: accountIdOf["45.1.1"], credit: 100 }] }).expect(400)).body;
      expect(ga.message).toContain("75.2 is not a movement account");
      await http().patch(`/accounting/accounts/${accountIdOf["75.2.7"]}`).set(auth(ownerToken)).send({ isActive: false }).expect(200);
      await entry({ lines: [{ accountId: accountIdOf["75.2.7"], debit: 100 }, { accountId: accountIdOf["45.1.1"], credit: 100 }] }).expect(400);
      await entry({}, managerToken).expect(403);
      await entry({ period: 14 }).expect(400); // 13-15 only on 31 December
      await entry({ transactionDate: "2026-12-31", postingDate: "2026-12-31", period: 13 }).expect(201);
    });

    it("nothing goes into a closed period, through the API or straight into the database", async () => {
      await http().post("/accounting/periods/2026/5/close").set(auth(ownerToken)).expect(200);
      const res = (await entry({ transactionDate: "2026-05-02" }).expect(400)).body;
      expect(res.message).toContain("Period 5/2026 is closed");
      await expect(
        prisma.journalEntry.create({
          data: { businessId: businessId!, journalId, year: 2026, period: 5, number: 999, docArchivalNumber: "2026/999", transactionId: "2026-05-02 OPD 2026/999", transactionDate: new Date("2026-05-02"), postingDate: new Date("2026-05-02"), description: "x", sourceUserId: "x", origin: "MANUAL", totalDebit: 1, totalCredit: 1 },
        }),
      ).rejects.toThrow("Period 5/2026 is closed");
      await http().post("/accounting/periods/2026/5/reopen").set(auth(ownerToken)).send({ reason: "Teste" }).expect(200);
    });

    it("the database refuses an unbalanced entry at commit, and changing or deleting a posted one", async () => {
      const unbalanced = (check: boolean) =>
        prisma.$transaction(async (tx) => {
          const e = await tx.journalEntry.create({
            data: { businessId: businessId!, journalId, year: 2026, period: 6, number: 998, docArchivalNumber: "2026/998", transactionId: "2026-06-02 OPD 2026/998", transactionDate: new Date("2026-06-02"), postingDate: new Date("2026-06-02"), description: "x", sourceUserId: "x", origin: "MANUAL", totalDebit: 10, totalCredit: 10 },
          });
          await tx.journalEntryLine.createMany({
            data: [
              { entryId: e.id, lineNumber: 1, accountId: accountIdOf["75.2.1"], debit: 10, description: "x" },
              { entryId: e.id, lineNumber: 2, accountId: accountIdOf["45.1.1"], credit: 9, description: "x" },
            ],
          });
          if (check) await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        });
      await expect(unbalanced(true)).rejects.toThrow("does not balance");
      // Left to the commit, it's rolled back (Prisma doesn't report a failed COMMIT, hence the check in EntriesService.post).
      await unbalanced(false).catch(() => undefined);
      expect(await prisma.journalEntry.count({ where: { businessId, number: 998 } })).toBe(0);
      await expect(prisma.journalEntry.update({ where: { id: first.id }, data: { description: "mudado" } })).rejects.toThrow("cannot be changed");
      await expect(prisma.journalEntryLine.deleteMany({ where: { entryId: first.id } })).rejects.toThrow("cannot be changed");
      await expect(
        prisma.journalEntryLine.create({ data: { entryId: first.id, lineNumber: 9, accountId: accountIdOf["75.2"], debit: 1, description: "x" } }),
      ).rejects.toThrow("not a movement account");
    });

    it("an estorno swaps the lines and points at what it reverses; an entry is reversed once", async () => {
      const reversal = (await http().post(`/accounting/entries/${first.id}/reverse`).set(auth(ownerToken)).send({ date: "2026-04-30" }).expect(201)).body as Entry;
      expect(reversal.reverses!.id).toBe(first.id);
      expect(reversal.transactionId).toBe("2026-04-30 OPD 2026/4");
      expect(reversal.lines.map((l) => [l.account.code, l.debit, l.credit])).toEqual([["75.2.1", "0.00", "150000.00"], ["45.1.1", "150000.00", "0.00"]]);
      await http().post(`/accounting/entries/${first.id}/reverse`).set(auth(ownerToken)).send({}).expect(409);
      const got = (await http().get(`/accounting/entries/${first.id}`).set(auth(managerToken)).expect(200)).body;
      expect(got.reversedBy.id).toBe(reversal.id);
    });

    it("lists by period, journal, account and text", async () => {
      const april = (await http().get("/accounting/entries?year=2026&period=4").set(auth(managerToken)).expect(200)).body;
      expect(april.total).toBe(3);
      const byAccount = (await http().get(`/accounting/entries?accountId=${accountIdOf["75.2.1"]}`).set(auth(managerToken)).expect(200)).body;
      expect(byAccount.total).toBe(4);
      const found = (await http().get("/accounting/entries?search=Estorno").set(auth(managerToken)).expect(200)).body;
      expect(found.total).toBe(1);
    });

    it("an account with movements can't be removed, can't get sub-accounts and stays a movement account", async () => {
      await http().delete(`/accounting/accounts/${accountIdOf["75.2.1"]}`).set(auth(ownerToken)).expect(400);
      await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "75.2.1.1", name: "Loja" }).expect(400);
      await expect(prisma.ledgerAccount.update({ where: { id: accountIdOf["75.2.1"] }, data: { category: "GA" } })).rejects.toThrow("stays a movement account");
      expect((await accounts()).find((a) => a.code === "75.2.1")).toMatchObject({ hasMovements: true });
    });
  });
});
