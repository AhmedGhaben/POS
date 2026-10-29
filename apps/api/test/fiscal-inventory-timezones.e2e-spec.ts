import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { addDays, startOfLocalDay } from "../src/fiscal/saft/period";
import { SaftExportService } from "../src/fiscal/saft-export.service";
import { deleteBusiness } from "./cleanup";

/** Run on fresh databases with each POS_FISCAL_TEST_TIMEZONE as the DB default. */
describe("Fiscal inventory export calendar cutoffs (isolated PostgreSQL)", () => {
  let app: INestApplication, db: PrismaService, businessId: string, userId: string, storeId: string, productId: string, token: string;
  const http = () => request(app.getHttpServer());
  const csv = (date: string, selectedStore = storeId) => http().get(`/fiscal-documents/saft/inventario?date=${date}&storeId=${selectedStore}`).set({ Authorization: `Bearer ${token}` });
  const fields = (text: string) => text.trim().split("\r\n")[1]?.split(";");
  const movements = (times: Date[], selectedStore = storeId) => db.stockMovement.createMany({ data: times.map((occurredAt, i) => ({
    storeId: selectedStore, productId, type: "PURCHASE" as const, quantity: i ? 5 : 10,
    unitCost: i ? 8 : 5, balance: 10 + i * 5, averageCost: 5 + i, occurredAt,
  })) });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/test/.test(url.pathname)) throw new Error("Fresh isolated local database required");
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); app.useGlobalFilters(new HttpExceptionFilter()); await app.init(); db = app.get(PrismaService);
    if (process.env.POS_FISCAL_TEST_TIMEZONE) {
      const [row] = await db.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`;
      expect(row.zone).toBe(process.env.POS_FISCAL_TEST_TIMEZONE);
    }
    const s = (await http().post("/auth/register").send({ businessName: "Export boundary test", storeName: "Luanda test", firstName: "Test", lastName: "Owner", email: `export-${randomUUID()}@e2e.test`, password: "ExportTest123!" }).expect(201)).body;
    businessId = s.user.businessId; userId = s.user.id; storeId = s.stores[0].id; token = s.accessToken;
    await db.business.update({ where: { id: businessId }, data: { taxId: "5417000555" } });
    productId = (await http().post("/products").set({ Authorization: `Bearer ${token}` }).send({ name: "Boundary goods", sku: "BOUNDARY", costPrice: 5, sellPrice: 10, exemptionCode: "M10", inventoryType: "M" }).expect(201)).body.id;
  }, 30000);
  beforeEach(async () => { await db.stockMovement.deleteMany({ where: { storeId } }); await db.store.update({ where: { id: storeId }, data: { timezone: "UTC" } }); });
  afterAll(async () => { try { if (businessId) await deleteBusiness(db, businessId); } finally { await app?.close(); } });

  it("exports 10 rather than 15 units across the Luanda year boundary regardless of session timezone", async () => {
    // UTC is the existing store default: AO's Africa/Luanda fallback applies.
    await movements([new Date("2025-12-31T22:30:00Z"), new Date("2025-12-31T23:30:00Z")]);
    const result = await csv("2025-12-31").expect(200);
    expect(fields(result.text)?.slice(4, 7)).toEqual(["10", "un", "50.00"]);
    expect(fields((await csv("2026-01-01").expect(200)).text)?.slice(4, 7)).toEqual(["15", "un", "90.00"]);
  });

  for (const zone of ["Africa/Luanda", "America/New_York", "Asia/Tokyo"]) {
    it.each(["2024-02-29", "2025-01-31", "2025-12-31", "2026-03-08", "2026-11-01"])(`${zone}: excludes exact midnight and later movements at %s`, async (date) => {
      await db.store.update({ where: { id: storeId }, data: { timezone: zone } });
      const until = startOfLocalDay(addDays(date, 1), zone);
      await movements([new Date(until.getTime() - 1), until, new Date(until.getTime() + 1)]);
      const before = await db.stockMovement.findMany({ where: { storeId }, orderBy: { occurredAt: "asc" } });
      const result = await csv(date).expect(200);
      expect(fields(result.text)?.slice(4, 7)).toEqual(["10", "un", "50.00"]);
      expect(fields((await csv(addDays(date, 1)).expect(200)).text)?.slice(4, 7)).toEqual(["20", "un", "140.00"]);
      expect(await db.stockMovement.findMany({ where: { storeId }, orderBy: { occurredAt: "asc" } })).toEqual(before);
    });
  }

  it("sums stores using each store's calendar cutoff, without changing stock, documents or accounting", async () => {
    const other = await db.store.create({ data: { businessId, name: "New York test", country: "AO", timezone: "America/New_York" } });
    try {
      const instants = [new Date("2025-12-31T22:30:00Z"), new Date("2025-12-31T23:30:00Z")];
      await movements(instants); await movements(instants, other.id);
      const counts = () => Promise.all([db.fiscalDocument.count({ where: { businessId } }), db.documentSeries.findMany({ where: { store: { businessId } } }), db.journalEntry.count({ where: { businessId } }), db.inventoryItem.findMany({ where: { productId } })]);
      const before = await counts();
      const combined = await http().get("/fiscal-documents/saft/inventario?date=2025-12-31").set({ Authorization: `Bearer ${token}` }).expect(200);
      expect(fields(combined.text)?.slice(4, 7)).toEqual(["25", "un", "140.00"]);
      expect(fields((await csv("2025-12-31", other.id).expect(200)).text)?.[4]).toBe("15");
      expect(await counts()).toEqual(before);
    } finally { await db.stockMovement.deleteMany({ where: { storeId: other.id } }); await db.store.delete({ where: { id: other.id } }); }
  });

  it("keeps default prior-year selection on the business clock and validates calendar dates", async () => {
    await movements([new Date("2025-12-31T22:30:00Z"), new Date("2025-12-31T23:30:00Z")]);
    const result = await app.get(SaftExportService).inventario(businessId, userId, {}, new Date("2025-12-31T23:30:00Z"));
    expect(result.fileName).toContain("2025-12-31"); expect(fields(result.body.toString())?.[4]).toBe("10");
    await csv("2025-02-29").expect(400); await csv("2025-12-31T00:00:00Z").expect(400);
    expect(fields((await csv("2024-01-01").expect(200)).text)).toBeUndefined();
  });
});
