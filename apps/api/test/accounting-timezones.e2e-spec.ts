import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { IntegrationService } from "../src/accounting/integration.service";
import { AccountingReportsService } from "../src/accounting/accounting-reports.service";
import { businessToday, dateValue, isoDate, sqlDate, sqlUtcTimestamp } from "../src/accounting/accounting-dates";
import { addDays, startOfLocalDay } from "../src/fiscal/saft/period";
import { deleteBusiness } from "./cleanup";

/** Run unchanged against each database timezone, using only fresh local test databases. */
describe("Accounting calendar boundaries (isolated e2e)", () => {
  let app: INestApplication, prisma: PrismaService, integration: IntegrationService, reports: AccountingReportsService;
  let businessId: string | undefined, token: string, storeId: string, userId: string, productId: string, supplierId: string, terminalId: string;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const settings = (body: object) => http().patch("/accounting/settings").set(auth()).send(body).expect(200);
  const run = (at: string | Date) => integration.run(businessId!, userId, new Date(at));
  const links = () => prisma.accountingSourceLink.findMany({ where: { businessId } });
  const sale = async (at: Date) => {
    const result = await http().post("/sales").set(auth()).send({ storeId, clientId: randomUUID(),
      lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 114 }], offline: { createdAt: at.toISOString() },
    }).expect(201);
    return prisma.fiscalDocument.findFirstOrThrow({ where: { saleId: result.body.id } });
  };
  const purchase = (at: Date, supplierDay?: string, tax = false) => prisma.purchase.create({ data: {
    storeId, supplierId, createdById: userId, purchaseNumber: `TZ-${randomUUID()}`, createdAt: at,
    subtotal: tax ? 100 : 10, taxTotal: tax ? 14 : 0, total: tax ? 114 : 10,
    supplierDocDate: supplierDay ? dateValue(supplierDay) : null, withholdingAmount: tax ? 7 : 0,
    lineItems: { create: { productId, quantity: 1, unitCost: tax ? 100 : 10, lineTotal: tax ? 100 : 10 } },
    ...(tax ? { taxLines: { create: { taxRate: 14, base: 100, taxAmount: 14, deductibleAmount: 14, typology: "INV" } } } : {}),
  } });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/test|recovery|ci/.test(url.pathname)) throw new Error("Use an isolated local test database");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init(); prisma = app.get(PrismaService); integration = app.get(IntegrationService); reports = app.get(AccountingReportsService);
    if (process.env.POS_ACCOUNTING_TEST_TIMEZONE) {
      const [row] = await prisma.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`;
      expect(row.zone).toBe(process.env.POS_ACCOUNTING_TEST_TIMEZONE);
    }
  });
  beforeEach(async () => {
    const session = (await http().post("/auth/register").send({ businessName: "Timezone test", storeName: "Luanda test", firstName: "Calendar", lastName: "Owner", email: `tz-${randomUUID()}@e2e.test`, password: "CalendarTest123!" }).expect(201)).body;
    businessId = session.user.businessId; token = session.accessToken; userId = session.user.id; storeId = session.stores[0].id;
    productId = (await http().post("/products").set(auth()).send({ sku: "TZ", name: "Timezone goods", costPrice: 1, sellPrice: 114, taxRate: 14, trackStock: false, productType: "P" }).expect(201)).body.id;
    supplierId = (await http().post("/suppliers").set(auth()).send({ name: "Test supplier" }).expect(201)).body.id;
    terminalId = (await http().post("/terminals").set(auth()).send({ storeId, name: "Test till" }).expect(201)).body.id;
    await settings({ enabled: true, startDate: "2023-01-01", grouping: "DAILY_SUMMARY", autoPost: false });
  }, 30_000);
  afterEach(async () => { if (businessId) await deleteBusiness(prisma, businessId); businessId = undefined; });
  afterAll(async () => { await app?.close(); });

  it("binds validated dates and UTC-naive timestamps independently of the session timezone", async () => {
    const [row] = await prisma.$queryRaw<{ dayType: string; instantType: string; matches: boolean }[]>`
      SELECT pg_typeof(${sqlDate("2024-02-29")})::text AS "dayType",
        pg_typeof(${sqlUtcTimestamp(new Date("2024-02-29T23:00:00Z"))})::text AS "instantType",
        ${sqlUtcTimestamp(new Date("2024-02-29T23:00:00Z"))} = timestamp '2024-02-29 23:00:00' AS matches`;
    expect(row).toEqual({ dayType: "date", instantType: "timestamp without time zone", matches: true });
    expect(() => sqlDate("2024-02-30")).toThrow();
    expect(() => sqlDate("2024-01-01T00:00:00Z")).toThrow();
  });

  it.each(["2024-01-01", "2024-02-01", "2024-03-01", "2025-01-01"])("summarizes only completed business days at %s midnight, including delayed offline arrivals", async (day) => {
    const midnight = startOfLocalDay(day, "Africa/Luanda");
    const yesterday = new Date(midnight.getTime() - 1);
    const previous = await sale(yesterday);
    const today = await sale(midnight);
    expect(isoDate(previous.invoiceDate)).toBe(addDays(day, -1));
    expect(isoDate(today.invoiceDate)).toBe(day);
    expect(businessToday({ country: "AO" }, yesterday)).toBe(addDays(day, -1));
    expect(await run(yesterday)).toEqual({ posted: 0, skipped: 0, failed: 0 });
    expect(await run(midnight)).toEqual({ posted: 1, skipped: 0, failed: 0 });
    expect(await run(midnight)).toEqual({ posted: 0, skipped: 0, failed: 0 });
    expect((await links()).map((l) => l.sourceId)).toEqual([previous.id]);
    const delayed = await sale(yesterday);
    expect(await run(midnight)).toEqual({ posted: 1, skipped: 0, failed: 0 });
    expect(await run(midnight)).toEqual({ posted: 0, skipped: 0, failed: 0 });
    expect(await run(startOfLocalDay(addDays(day, 1), "Africa/Luanda"))).toEqual({ posted: 1, skipped: 0, failed: 0 });
    const all = await links(); expect(all).toHaveLength(3);
    for (const doc of [previous, today, delayed]) {
      // Integration must never rewrite an issued document or its signature/number.
      expect(await prisma.fiscalDocument.findUniqueOrThrow({ where: { id: doc.id } })).toEqual(doc);
      const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: all.find((l) => l.sourceId === doc.id)!.entryId! } });
      expect(isoDate(entry.postingDate)).toBe(isoDate(doc.invoiceDate));
      expect(isoDate(entry.transactionDate)).toBe(isoDate(doc.invoiceDate));
      expect(entry.year).toBe(Number(isoDate(doc.invoiceDate).slice(0, 4)));
      expect(entry.period).toBe(Number(isoDate(doc.invoiceDate).slice(5, 7)));
    }
  });

  it("includes the start date and both edges in document/payment pending counts", async () => {
    await settings({ startDate: "2024-01-01", grouping: "PER_DOCUMENT" });
    const docs = [], payments = [];
    for (const day of ["2023-12-31", "2024-01-01", "2024-01-31", "2024-02-01"]) {
      docs.push(await sale(new Date(`${day}T12:00:00Z`)));
      payments.push(await prisma.supplierPayment.create({ data: { businessId: businessId!, supplierId, createdById: userId, amount: 10, method: "CASH", paidOn: dateValue(day) } }));
    }
    const pending = await integration.pending(businessId!, { from: "2024-01-01", to: "2024-01-31" });
    expect(pending.counts.FISCAL_DOCUMENT).toBe(2); expect(pending.counts.SUPPLIER_PAYMENT).toBe(2);
    expect(await run("2024-03-01T12:00:00Z")).toEqual({ posted: 6, skipped: 0, failed: 0 });
    const ids = (await links()).map((l) => l.sourceId);
    expect(ids).not.toContain(docs[0].id); expect(ids).not.toContain(payments[0].id);
    for (const doc of docs.slice(1)) expect(ids).toContain(doc.id);
    for (const payment of payments.slice(1)) expect(ids).toContain(payment.id);
    expect(await run("2024-03-01T12:00:00Z")).toEqual({ posted: 0, skipped: 0, failed: 0 });
  });

  it("uses inclusive/exclusive UTC timestamp boundaries for purchases, expenses, shifts, cash and stock", async () => {
    await settings({ startDate: "2024-01-01" });
    const start = startOfLocalDay("2024-01-01", "Africa/Luanda"), end = startOfLocalDay("2024-02-01", "Africa/Luanda");
    const groups: string[][] = [];
    for (const at of [new Date(start.getTime() - 1), start, new Date(end.getTime() - 1), end]) {
      const p = await purchase(at);
      const e = await prisma.expense.create({ data: { storeId, createdById: userId, category: "OTHER", amount: 10, incurredAt: at } });
      const s = await prisma.shift.create({ data: { businessId: businessId!, storeId, terminalId, openedById: userId, openedAt: new Date(at.getTime() - 3600000), openingFloat: 0, closedById: userId, closedAt: at, difference: 1, status: "CLOSED", clientId: randomUUID() } });
      const c = await prisma.cashMovement.create({ data: { shiftId: s.id, userId, type: "OUT", amount: 1, reason: "PETTY_CASH", occurredAt: at, clientId: randomUUID() } });
      const m = await prisma.stockMovement.create({ data: { storeId, productId, userId, type: "ADJUSTMENT", quantity: 1, unitCost: 2, balance: 1, averageCost: 2, occurredAt: at } });
      groups.push([p.id, e.id, s.id, c.id, m.id]);
    }
    const pending = await integration.pending(businessId!, { from: "2024-01-01", to: "2024-01-31" });
    for (const type of ["PURCHASE", "EXPENSE", "SHIFT_DIFFERENCE", "CASH_MOVEMENT", "STOCK_ADJUSTMENT"] as const) expect(pending.counts[type]).toBe(2);
    expect(await run("2024-03-01T12:00:00Z")).toEqual({ posted: 15, skipped: 0, failed: 0 });
    const ids = (await links()).map((l) => l.sourceId);
    for (const id of groups[0]) expect(ids).not.toContain(id);
    for (const id of groups.slice(1).flat()) expect(ids).toContain(id);
    expect(await run("2024-03-01T12:00:00Z")).toEqual({ posted: 0, skipped: 0, failed: 0 });
  });

  it("includes first/last-day IVA and uses business-local purchase fallback even with a store override", async () => {
    for (const day of ["2023-12-31", "2024-01-01", "2024-01-31", "2024-02-01"]) await sale(new Date(`${day}T12:00:00Z`));
    await prisma.store.update({ where: { id: storeId }, data: { timezone: "America/New_York" } });
    for (const day of ["2023-12-31", "2024-01-01", "2024-01-31", "2024-02-01"]) await purchase(new Date("2024-01-15T12:00:00Z"), day, true);
    await purchase(new Date("2023-12-31T23:00:00Z"), undefined, true); // 1 January Luanda, 31 December New York.
    await purchase(new Date("2024-01-31T23:00:00Z"), undefined, true); // 1 February Luanda: excluded.
    const { tables } = await reports.build(businessId!, "vat", { year: 2024, fromPeriod: 1, toPeriod: 1 });
    expect(tables.find((t) => t.title === "vatCharged")!.totals!.tax).toBe("28.00");
    expect(tables.find((t) => t.title === "vatDeductible")!.totals!.tax).toBe("42.00");
    expect(tables.find((t) => t.title === "vatSummary")!.rows.find((r) => r.line === "vatCativo")!.amount).toBe("21.00");
  });

  it.each(["2024-01-01", "2024-01-31"])("refuses closing a period with an unpostable record on %s", async (day) => {
    await settings({ grouping: "PER_DOCUMENT", startDate: "2024-01-01" });
    const doc = await sale(new Date(`${day}T12:00:00Z`));
    const account = await prisma.ledgerAccount.findUniqueOrThrow({ where: { businessId_code: { businessId: businessId!, code: "61.3.1" } } });
    await prisma.ledgerAccount.update({ where: { id: account.id }, data: { isActive: false } });
    expect((await integration.pending(businessId!, { from: "2024-01-01", to: "2024-01-31" })).counts.FISCAL_DOCUMENT).toBe(1);
    await http().post("/accounting/periods/2024/1/close").set(auth()).expect(400);
    expect((await prisma.accountingPeriod.findUniqueOrThrow({ where: { businessId_year_number: { businessId: businessId!, year: 2024, number: 1 } } })).status).toBe("OPEN");
    expect((await links()).map((l) => l.sourceId)).not.toContain(doc.id);
    await prisma.ledgerAccount.update({ where: { id: account.id }, data: { isActive: true } });
    await http().post("/accounting/periods/2024/1/close").set(auth()).expect(200);
    expect((await links()).map((l) => l.sourceId)).toContain(doc.id);
  });

  it("preserves store-local document dates and the existing business-clock summary cutoff", async () => {
    await prisma.store.update({ where: { id: storeId }, data: { timezone: "America/New_York" } });
    const doc = await sale(new Date("2024-01-01T00:30:00Z"));
    expect(isoDate(doc.invoiceDate)).toBe("2023-12-31");
    expect(businessToday({ country: "AO" }, new Date("2024-01-01T00:30:00Z"))).toBe("2024-01-01");
    expect(await run("2024-01-01T00:30:00Z")).toEqual({ posted: 1, skipped: 0, failed: 0 });
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: (await links())[0].entryId! } });
    expect(isoDate(entry.postingDate)).toBe("2023-12-31"); expect(entry.year).toBe(2023); expect(entry.period).toBe(12);
    expect(await prisma.fiscalDocument.findUniqueOrThrow({ where: { id: doc.id } })).toEqual(doc);
  });
});
