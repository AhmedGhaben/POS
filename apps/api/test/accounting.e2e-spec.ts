import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

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
  describe("A4: automatic posting from the POS", () => {
    type Line = { account: { code: string }; debit: string; credit: string; sourceDocumentId: string | null };
    type Entry = { id: string; description: string; origin: string; journal: { code: string }; transactionDate: string; postingDate: string; customerId: string | null; supplierId: string | null; lines: Line[]; reverses: { id: string } | null };
    let goodsId: string;
    let serviceId: string;
    let exemptId: string;
    let shiftClientId: string;
    let tillShift: string;
    let today: string;
    const run = async () => (await http().post("/accounting/integration/run").set(auth(ownerToken)).expect(200)).body as { posted: number; skipped: number; failed: number };
    const monitor = async () => (await http().get("/accounting/integration").set(auth(managerToken)).expect(200)).body;
    /** The automatic entry whose lines point at a document (by its SourceDocumentID). */
    const entryFor = async (documentNo: string) => {
      const list = (await http().get(`/accounting/entries?search=${encodeURIComponent(documentNo)}&take=50`).set(auth(ownerToken)).expect(200)).body.items as Entry[];
      return list.filter((e) => e.origin === "AUTO" || e.origin === "REVERSAL");
    };
    const amounts = (e: Entry) => e.lines.map((l) => [l.account.code, Number(l.debit) ? `D ${l.debit}` : `C ${l.credit}`]).sort();
    const sale = (body: Record<string, unknown>) =>
      http()
        .post("/sales")
        .set(auth(ownerToken))
        .send({ storeId, shiftClientId, clientId: randomUUID(), ...body })
        .then((r) => {
          if (r.status !== 201) throw new Error(`sale: ${r.status} ${JSON.stringify(r.body)}`);
          return r.body as { id: string; fiscalDocuments: { documentNo: string }[] };
        });

    beforeAll(async () => {
      const rates = (await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body as { id: string; key: string }[];
      const nor = rates.find((r) => r.key === "IVA-NOR-14")!.id;
      goodsId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `ACC-G-${RUN}`, name: "Óleo 1L", costPrice: 60, sellPrice: 114, taxRateId: nor }).expect(201)).body.id;
      serviceId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `ACC-S-${RUN}`, name: "Entrega", costPrice: 0, sellPrice: 57, taxRateId: nor, productType: "S", trackStock: false }).expect(201)).body.id;
      exemptId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `ACC-E-${RUN}`, name: "Fuba", costPrice: 20, sellPrice: 50, exemptionCode: "M10", productType: "P", trackStock: false }).expect(201)).body.id;
      await http().put(`/stores/${storeId}/inventory/${goodsId}`).set(auth(ownerToken)).send({ quantity: 100 }).expect(200);
      await http().patch(`/customers/${customerId}`).set(auth(ownerToken)).send({ creditLimit: 100000 }).expect(200);
      shiftClientId = await ensureShift(app, ownerToken, storeId);
      tillShift = await ensureShift(app, ownerToken, storeId, { terminalId });
    });

    it("a cash sale (FR): cash in, sales by type and rate before discount, the discount, IVA, and the cost of what left the stock", async () => {
      const s = await sale({ lineItems: [{ productId: goodsId, quantity: 2, discount: { type: "AMOUNT", value: 22.8 } }, { productId: serviceId, quantity: 1 }, { productId: exemptId, quantity: 1 }], payments: [{ method: "CASH", amount: 312.2 }] });
      const fr = s.fiscalDocuments[0].documentNo;
      today = (await prisma.fiscalDocument.findFirstOrThrow({ where: { businessId, documentNo: fr } })).invoiceDate.toISOString().slice(0, 10);
      const r = await run();
      expect(r.failed).toBe(0);
      const [e] = await entryFor(fr);
      expect(e.journal.code).toBe("VEN");
      expect(e.postingDate).toBe(today);
      // 2 x 100 + IVA, less 20 (22.80 with IVA); 50 + 7 IVA; 50 exempt. Browser sale: Caixa principal.
      expect(amounts(e)).toEqual(
        [
          ["45.1.1", "D 312.20"],
          ["61.3.1", "C 200.00"],
          ["61.8.1", "D 20.00"],
          ["62.1.1", "C 50.00"],
          ["61.3.5", "C 50.00"],
          ["34.5.3.1", "C 32.20"],
          ["71.2", "D 120.00"],
          ["26.1", "C 120.00"],
        ].sort(),
      );
      expect(e.lines.every((l) => l.sourceDocumentId === fr)).toBe(true);
    });

    it("a sale at a till goes into that till's cash account; card payments to the bank", async () => {
      const s = (
        await http()
          .post("/sales")
          .set(auth(ownerToken))
          .send({ storeId, terminalId, shiftClientId: tillShift, clientId: randomUUID(), lineItems: [{ productId: goodsId, quantity: 1 }], payments: [{ method: "CASH", amount: 100 }, { method: "CARD", amount: 14 }] })
          .expect(201)
      ).body;
      await run();
      const [e] = await entryFor(s.fiscalDocuments[0].documentNo);
      expect(amounts(e)).toEqual([["26.1", "C 60.00"], ["34.5.3.1", "C 14.00"], ["43.1.1", "D 14.00"], ["45.1.2", "D 100.00"], ["61.3.1", "C 100.00"], ["71.2", "D 60.00"]].sort());
    });

    it("a sale on credit (FT) goes to the customer's account; the receipt (RC) settles it", async () => {
      const s = await sale({ customerId, lineItems: [{ productId: goodsId, quantity: 5 }], payments: [], creditAmount: 570 });
      const ft = s.fiscalDocuments[0].documentNo;
      expect(ft).toMatch(/^FT /);
      await http().post("/customer-payments").set(auth(ownerToken)).send({ storeId, customerId, amount: 200, method: "BANK_TRANSFER", reference: "TRF-1" }).expect(201);
      await run();
      const [invoice] = await entryFor(ft);
      expect(invoice.customerId).toBe(customerId);
      expect(amounts(invoice)).toEqual([["26.1", "C 300.00"], ["31.1.2.1.0001", "D 570.00"], ["34.5.3.1", "C 70.00"], ["61.3.1", "C 500.00"], ["71.2", "D 300.00"]].sort());
      const rcNo = (await prisma.customerPayment.findFirstOrThrow({ where: { businessId, customerId }, orderBy: { createdAt: "desc" }, include: { document: true } })).document.documentNo;
      const [receipt] = await entryFor(rcNo);
      expect(receipt.journal.code).toBe("BCO");
      expect(amounts(receipt)).toEqual([["31.1.2.1.0001", "C 200.00"], ["43.1.1", "D 200.00"]].sort());
    });

    it("a return (NC): Devoluções and IVA debited, the money back credited, the goods back in stock at their cost", async () => {
      const s = await sale({ lineItems: [{ productId: goodsId, quantity: 3 }], payments: [{ method: "CASH", amount: 342 }] });
      await http().post("/returns").set(auth(ownerToken)).send({ storeId, saleId: s.id, shiftClientId, reason: "Avariado", lineItems: [{ productId: goodsId, quantity: 1 }] }).expect(201);
      await run();
      const nc = await prisma.fiscalDocument.findFirstOrThrow({ where: { saleId: s.id, documentType: "NC" } });
      const [e] = await entryFor(nc.documentNo);
      expect(amounts(e)).toEqual([["26.1", "D 60.00"], ["34.5.3.1", "D 14.00"], ["45.1.1", "C 114.00"], ["61.7.1", "D 100.00"], ["71.2", "C 60.00"]].sort());
    });

    it("a sale cancelled after it was posted is reversed on the day it was annulled; one cancelled before is never posted", async () => {
      const s = await sale({ lineItems: [{ productId: goodsId, quantity: 1 }], payments: [{ method: "CASH", amount: 114 }] });
      const fr = s.fiscalDocuments[0].documentNo;
      await run();
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: s.id, reason: "ANNUL_N" }).expect(200);
      await run();
      const entries = await entryFor(fr);
      expect(entries).toHaveLength(2);
      const reversal = entries.find((e) => e.reverses)!;
      const original = entries.find((e) => !e.reverses)!;
      expect(reversal.reverses!.id).toBe(original.id);
      expect(amounts(reversal)).toEqual(amounts(original).map(([a, v]) => [a, v.startsWith("D") ? v.replace("D", "C") : v.replace("C", "D")]).sort());

      const quick = await sale({ lineItems: [{ productId: goodsId, quantity: 1 }], payments: [{ method: "CASH", amount: 114 }] });
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: quick.id, reason: "ANNUL_N" }).expect(200);
      const r = await run();
      expect(r.skipped).toBeGreaterThanOrEqual(1);
      expect(await entryFor(quick.fiscalDocuments[0].documentNo)).toHaveLength(0);
    });

    it("a purchase: stock and deductible IVA against the supplier, IVA cativo to the State; what was paid on arrival from the bank", async () => {
      const p = (
        await http()
          .post("/purchases")
          .set(auth(ownerToken))
          .send({
            storeId,
            supplierId,
            lineItems: [{ productId: goodsId, quantity: 10, unitCost: 100 }],
            supplierDocument: { type: "FT", number: "FT GK2026/12", date: today, hash: "Ab3x" },
            taxLines: [{ taxRate: 14, base: 1000, typology: "INV" }],
            withholdingPercent: 50,
            payment: { amount: 500, method: "BANK_TRANSFER", reference: "TRF-PAY-9" },
          })
          .expect(201)
      ).body;
      await run();
      const [purchase] = await entryFor("FT GK2026/12");
      expect(purchase.journal.code).toBe("COM");
      expect(purchase.supplierId).toBe(supplierId);
      expect(amounts(purchase)).toEqual([["26.1", "D 1000.00"], ["32.1.2.1.0001", "C 1070.00"], ["34.5.2.1", "D 140.00"], ["34.5.6.2", "C 70.00"]].sort());
      const [paid] = await entryFor("TRF-PAY-9");
      expect(amounts(paid)).toEqual([["32.1.2.1.0001", "D 500.00"], ["43.1.1", "C 500.00"]].sort());
      expect(p.paidAmount).toBe("500");
    });

    it("expenses, cash taken out of a till, the shift's shortfall and a stock count each get their entry", async () => {
      await http().post("/expenses").set(auth(ownerToken)).send({ storeId, category: "RENT", description: "Renda da loja", amount: 5000 }).expect(201);
      await http().post("/shifts/cash-movements").set(auth(ownerToken)).send({ storeId, shiftClientId: tillShift, clientId: randomUUID(), type: "OUT", amount: 50, reason: "CASH_PICKUP" }).expect(200);
      await http().post("/shifts/close").set(auth(ownerToken)).send({ storeId, shiftClientId: tillShift, countedCash: 47 }).expect(200);
      await http().put(`/stores/${storeId}/inventory/${goodsId}`).set(auth(ownerToken)).send({ quantity: 70 }).expect(200);
      expect((await run()).failed).toBe(0);
      const all = (await http().get("/accounting/entries?origin=AUTO&take=100").set(auth(ownerToken)).expect(200)).body.items as Entry[];
      const find = (text: string) => all.find((e) => e.description.includes(text))!;
      expect(amounts(find("Despesa: Rendas"))).toEqual([["45.1.1", "C 5000.00"], ["75.2.1", "D 5000.00"]].sort());
      expect(amounts(find("Saída de caixa (CASH_PICKUP)"))).toEqual([["45.1.1", "D 50.00"], ["45.1.2", "C 50.00"]].sort());
      expect(amounts(find("Quebra de caixa"))).toEqual([["45.1.2", "C 3.00"], ["78.8.1", "D 3.00"]].sort());
      // 100 counted in, then sold 2+1+5+3-1+1 = 11 (and 1 cancelled back), 10 bought: 100; counted 70 → 30 missing at 60 (the average after buying at 100: 64.29).
      const count = find("Acerto de inventário");
      expect(count.lines.find((l) => l.account.code === "78.3.1")).toBeTruthy();
    });

    it("nothing is posted twice: running again posts nothing, and the database refuses a second link", async () => {
      expect(await run()).toEqual({ posted: 0, skipped: 0, failed: 0 });
      const link = await prisma.accountingSourceLink.findFirstOrThrow({ where: { businessId, sourceType: "FISCAL_DOCUMENT", skipped: false } });
      await expect(prisma.accountingSourceLink.create({ data: { businessId: businessId!, sourceType: link.sourceType, sourceId: link.sourceId, entryId: link.entryId, documentDate: link.documentDate } })).rejects.toThrow();
      await expect(prisma.accountingSourceLink.delete({ where: { id: link.id } })).rejects.toThrow("cannot be changed");
      expect((await monitor()).pendingTotal).toBe(0);
    });

    it("a missing account: the document waits in the monitor with why; fixed in the mapping, it posts", async () => {
      const goodsAccount = (await accounts()).find((a) => a.code === "61.3.1")!;
      await http().patch(`/accounting/accounts/${goodsAccount.id}`).set(auth(ownerToken)).send({ isActive: false }).expect(200);
      const s = await sale({ lineItems: [{ productId: goodsId, quantity: 1 }], payments: [{ method: "CASH", amount: 114 }] });
      expect((await run()).failed).toBe(1);
      const m = await monitor();
      expect(m.pendingTotal).toBe(1);
      expect(m.errors).toEqual([expect.objectContaining({ sourceType: "FISCAL_DOCUMENT", documentNo: s.fiscalDocuments[0].documentNo, message: expect.stringContaining("61.3.1, is inactive") })]);
      // Closing the month is refused while something in it isn't posted.
      const month = Number(today.slice(5, 7));
      const refused = (await http().post(`/accounting/periods/${today.slice(0, 4)}/${month}/close`).set(auth(ownerToken)).expect(400)).body;
      expect(refused.message).toMatch(/aren't posted yet/);
      // Point the key at another account.
      const other = (await http().post("/accounting/accounts").set(auth(ownerToken)).send({ code: "61.3.6", name: "Mercadorias – IVA 14% (loja)" }).expect(201)).body;
      await http().put("/accounting/mapping/sales.goods.14").set(auth(ownerToken)).send({ accountId: other.id }).expect(200);
      expect((await run()).posted).toBe(1);
      const [e] = await entryFor(s.fiscalDocuments[0].documentNo);
      expect(amounts(e)).toContainEqual(["61.3.6", "C 100.00"]);
      expect((await monitor()).errors).toEqual([]);
      const mapping = (await http().get("/accounting/mapping").set(auth(managerToken)).expect(200)).body as { key: string; custom: boolean; account: { code: string } }[];
      expect(mapping.find((k) => k.key === "sales.goods.14")).toMatchObject({ custom: true, account: { code: "61.3.6" } });
      expect(mapping.find((k) => k.key === "cogs")).toMatchObject({ custom: false, account: { code: "71.2" } });
      await http().put("/accounting/mapping/sales.goods.14").set(auth(managerToken)).send({ accountId: other.id }).expect(403);
      await http().put("/accounting/mapping/sales.goods.14").set(auth(ownerToken)).send({ accountId: (await accounts()).find((a) => a.code === "61.3")!.id }).expect(400);
      await http().patch(`/accounting/accounts/${goodsAccount.id}`).set(auth(ownerToken)).send({ isActive: true }).expect(200);
    });

    it("the books balance: every automatic entry's debits equal its credits", async () => {
      const rows = await prisma.$queryRaw<{ d: string; c: string }[]>`
        SELECT SUM(l.debit)::text AS d, SUM(l.credit)::text AS c FROM journal_entry_lines l JOIN journal_entries e ON e.id = l."entryId" WHERE e."businessId" = ${businessId}`;
      expect(rows[0].d).toBe(rows[0].c);
    });
  });
  describe("A4: daily summary per till", () => {
    type Line = { account: { code: string }; debit: string; credit: string };
    type Entry = { id: string; description: string; postingDate: string; lines: Line[] };
    let productId: string;

    beforeAll(async () => {
      const rates = (await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body as { id: string; key: string }[];
      productId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `ACC-D-${RUN}`, name: "Água 1.5L", costPrice: 0, sellPrice: 114, taxRateId: rates.find((r) => r.key === "IVA-NOR-14")!.id, trackStock: false, productType: "P" }).expect(201)).body.id;
      await http().patch("/accounting/settings").set(auth(ownerToken)).send({ grouping: "DAILY_SUMMARY" }).expect(200);
    });

    afterAll(async () => {
      await http().patch("/accounting/settings").set(auth(ownerToken)).send({ grouping: "PER_DOCUMENT" }).expect(200);
    });

    it("a till's day (rung up offline yesterday) is one entry summed per account; today's documents wait for tomorrow", async () => {
      const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
      const offlineSale = async (amount: number, quantity: number) =>
        (
          await http()
            .post("/sales")
            .set(auth(ownerToken))
            .send({ storeId, terminalId, clientId: randomUUID(), lineItems: [{ productId, quantity }], payments: [{ method: "CASH", amount }], offline: { createdAt: yesterday } })
            .expect(201)
        ).body as { id: string; fiscalDocuments: { documentNo: string }[] };
      const a = await offlineSale(114, 1);
      const b = await offlineSale(228, 2);
      const todays = (await http().post("/sales").set(auth(ownerToken)).send({ storeId, shiftClientId: await ensureShift(app, ownerToken, storeId), clientId: randomUUID(), lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 114 }] }).expect(201)).body;

      await http().post("/accounting/integration/run").set(auth(ownerToken)).expect(200);
      const links = await prisma.accountingSourceLink.findMany({ where: { businessId, sourceType: "FISCAL_DOCUMENT", documentNo: { in: [a.fiscalDocuments[0].documentNo, b.fiscalDocuments[0].documentNo] } } });
      expect(links).toHaveLength(2);
      expect(links[0].entryId).toBe(links[1].entryId);
      const entry = (await http().get(`/accounting/entries/${links[0].entryId}`).set(auth(ownerToken)).expect(200)).body as Entry;
      expect(entry.description).toMatch(/^Resumo diário POS-001 Caixa 1 \d{4}-\d{2}-\d{2}: 2 documentos \(FR\)$/);
      expect(entry.lines.map((l) => [l.account.code, l.debit, l.credit]).sort()).toEqual([["34.5.3.1", "0.00", "42.00"], ["45.1.2", "342.00", "0.00"], ["61.3.6", "0.00", "300.00"]]);
      expect(await prisma.accountingSourceLink.count({ where: { businessId, sourceId: todays.fiscalDocuments?.[0] ? (await prisma.fiscalDocument.findFirstOrThrow({ where: { saleId: todays.id } })).id : "" } })).toBe(0);
    });

    it("a document annulled after its day was summed is reversed on its own", async () => {
      const yesterdays = await prisma.fiscalDocument.findMany({ where: { businessId, documentType: "FR", status: "N", grossTotal: 114, terminalId }, orderBy: { createdAt: "desc" }, take: 1 });
      // Annulled as cancelling its sale would (the API only cancels sales of an open shift; the database allows this one change).
      await prisma.fiscalDocument.update({ where: { id: yesterdays[0].id }, data: { status: "A", statusDate: new Date(), statusReason: "Anulada por não envio do documento ao adquirente", statusReasonCode: "N", statusById: yesterdays[0].sourceId } });
      await http().post("/accounting/integration/run").set(auth(ownerToken)).expect(200);
      const link = await prisma.accountingSourceLink.findFirstOrThrow({ where: { businessId, sourceType: "FISCAL_DOCUMENT_ANNULMENT", sourceId: yesterdays[0].id } });
      const entry = (await http().get(`/accounting/entries/${link.entryId}`).set(auth(ownerToken)).expect(200)).body as Entry;
      expect(entry.description).toMatch(/^Anulação de Factura-Recibo/);
      expect(entry.lines.map((l) => [l.account.code, l.debit, l.credit]).sort()).toEqual([["34.5.3.1", "14.00", "0.00"], ["45.1.2", "0.00", "114.00"], ["61.3.6", "100.00", "0.00"]]);
    });
  });
  describe("A5: templates and opening balances", () => {
    const idOf = async (code: string) => (await accounts()).find((a) => a.code === code)!.id;

    it("a lançamento pré-definido keeps the accounts and sides (and fixed amounts) of a recurring entry", async () => {
      const journalId = ((await http().get("/accounting/journals").set(auth(ownerToken)).expect(200)).body as { id: string; code: string }[]).find((j) => j.code === "BCO")!.id;
      const body = {
        name: "Comissões bancárias",
        journalId,
        description: "Comissão de manutenção de conta",
        lines: [
          { accountId: await idOf("76.8"), side: "D", amount: 2500 },
          { accountId: await idOf("43.1.1"), side: "C", amount: 2500 },
        ],
      };
      await http().post("/accounting/templates").set(auth(managerToken)).send(body).expect(403);
      const t = (await http().post("/accounting/templates").set(auth(ownerToken)).send(body).expect(201)).body;
      await http().post("/accounting/templates").set(auth(ownerToken)).send({ ...body, lines: [body.lines[0], { ...body.lines[1], side: "D" }] }).expect(400);
      await http().put(`/accounting/templates/${t.id}`).set(auth(ownerToken)).send({ ...body, name: "Comissões BAI" }).expect(200);
      const list = (await http().get("/accounting/templates").set(auth(managerToken)).expect(200)).body;
      expect(list).toEqual([expect.objectContaining({ name: "Comissões BAI", lines: [expect.objectContaining({ side: "D", amount: 2500 }), expect.objectContaining({ side: "C" })] })]);
      await http().delete(`/accounting/templates/${t.id}`).set(auth(ownerToken)).expect(200);
    });

    it("opening balances: one balanced entry in Abertura, period 0, 1 January; unbalanced ones are refused", async () => {
      const lines = [
        { accountId: await idOf("11.5"), debit: 800000 },
        { accountId: await idOf("45.1.1"), debit: 200000 },
        { accountId: await idOf("51.1"), credit: 1000000 },
      ];
      await http().post("/accounting/opening").set(auth(ownerToken)).send({ year: 2027, lines: [lines[0], lines[2]] }).expect(400);
      const e = (await http().post("/accounting/opening").set(auth(ownerToken)).send({ year: 2027, lines }).expect(201)).body;
      expect(e).toMatchObject({ period: 0, postingDate: "2027-01-01", journal: { code: "ABE" }, transactionId: "2027-01-01 ABE 2027/1", totalDebit: "1000000.00" });
      // Period 0 is for openings only.
      const opd = ((await http().get("/accounting/journals").set(auth(ownerToken)).expect(200)).body as { id: string; code: string }[]).find((j) => j.code === "OPD")!.id;
      await http().post("/accounting/entries").set(auth(ownerToken)).send({ journalId: opd, transactionDate: "2027-01-01", period: 0, description: "x", lines }).expect(400);
    });
  });
});
