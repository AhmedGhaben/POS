import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { StockMovementType } from "@prisma/client";
import { randomUUID } from "crypto";
import request, { Response } from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { InventoryService } from "../src/inventory/inventory.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { recordMovement } from "../src/stock/stock";
import { deleteBusiness } from "./cleanup";

/** Real overlapping database transactions, not a mock or a timing-only Promise.all. */
describe("Absolute inventory adjustment concurrency (isolated e2e)", () => {
  let app: INestApplication, prisma: PrismaService;
  let businessId: string, storeId: string, userId: string, token: string;
  const shiftClientId = randomUUID();
  let sequence = 0;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const adjust = (productId: string, quantity: number, note = "Single count") =>
    http().put(`/stores/${storeId}/inventory/${productId}`).set(auth()).send({ quantity, note }).then((response) => response);
  const bulk = (productId: string, quantity: number, expectedQuantity?: number) =>
    http().post(`/stores/${storeId}/inventory/counts`).set(auth()).send({ note: "Bulk count", lines: [{ productId, quantity, expectedQuantity }] }).then((response) => response);
  const sale = (productId: string) => http().post("/sales").set(auth()).send({ storeId, shiftClientId, lineItems: [{ productId, quantity: 2 }], payments: [{ method: "CASH", amount: 10 }] }).then((response) => response);

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["127.0.0.1", "localhost"].includes(database.hostname) || (!/test|recovery|ci/.test(database.pathname) && process.env.CI !== "true")) throw new Error("Use an isolated local test database");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter()); await app.init(); prisma = app.get(PrismaService);
    const session = (await http().post("/auth/register").send({ businessName: "Concurrent counts", storeName: "Concurrent store", firstName: "Test", lastName: "Owner", email: `inventory-race-${Date.now()}@e2e.test`, password: "InventoryRace123!" }).expect(201)).body;
    token = session.accessToken; businessId = session.user.businessId; storeId = session.stores[0].id; userId = session.user.id;
    await http().post("/shifts/open").set(auth()).send({ storeId, clientId: shiftClientId, openingFloat: 0 }).expect(200);
  }, 30_000);
  afterAll(async () => { try { if (businessId) await deleteBusiness(prisma, businessId); } finally { await app?.close(); } });

  async function fixture(initial: number | null = 10) {
    const product = await prisma.product.create({ data: { businessId, sku: `RACE-${++sequence}`, name: `Race ${sequence}`, costPrice: 3, sellPrice: 5, taxRate: 0, exemptionCode: "M10" } });
    if (initial !== null) await app.get(InventoryService).adjust(storeId, product.id, { quantity: initial, note: "Fixture" }, userId);
    return product;
  }

  async function waitForStockWaiters(count: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::integer AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND (query LIKE '%inventory_items%' OR query LIKE '%pg_advisory_xact_lock%')`;
      if (row.waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Expected ${count} stock writers to be waiting on the held database lock`);
  }

  /** Queue the first writer before the second and verify both actually contend. */
  async function contended<A, B>(productId: string, first: () => Promise<A>, second: () => Promise<B>): Promise<[A, B]> {
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM inventory_items WHERE "storeId" = ${storeId} AND "productId" = ${productId} FOR UPDATE`;
      ready(); await gate;
    }, { timeout: 15_000 });
    await Promise.race([locked, blocker]);
    let a: Promise<A> | undefined, b: Promise<B> | undefined;
    try {
      a = first(); await waitForStockWaiters(1);
      b = second(); await waitForStockWaiters(2);
    } finally {
      release(); await blocker;
      // Settle both requests even when a contention assertion fails.
      if (a && b) await Promise.allSettled([a, b]);
      else if (a) await Promise.allSettled([a]);
    }
    return Promise.all([a!, b!]);
  }

  async function position(productId: string, quantity: number) {
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId } } });
    const movements = await prisma.stockMovement.findMany({ where: { storeId, productId } });
    expect(item.quantity.toNumber()).toBe(quantity);
    expect(item.averageCost.toNumber()).toBe(3);
    expect(movements.reduce((sum, movement) => sum + Number(movement.quantity), 0)).toBe(quantity);
    expect(movements.every((movement) => movement.userId === userId && movement.unitCost.equals(3))).toBe(true);
    return movements.filter((movement) => movement.note !== "Fixture");
  }
  function ok(response: Response, status: number) {
    expect({ status: response.status, error: response.status >= 400 ? response.body : undefined }).toEqual({ status, error: status >= 400 ? expect.anything() : undefined });
  }

  it("two simultaneous counts of 20 finish at 20, not 30; the second creates no extra movement", async () => {
    const product = await fixture();
    const results = await contended(product.id, () => adjust(product.id, 20), () => adjust(product.id, 20));
    results.forEach((result) => ok(result, 200));
    const movements = await position(product.id, 20);
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity.toNumber()).toBe(10);
  });
  it("different simultaneous counts preserve last serialized absolute quantity", async () => {
    const product = await fixture();
    const results = await contended(product.id, () => adjust(product.id, 20), () => adjust(product.id, 30));
    results.forEach((result) => ok(result, 200));
    const movements = await position(product.id, 30);
    expect(movements.map((m) => m.quantity.toNumber())).toEqual([10, 10]);
  });
  it("concurrent first counts safely create a missing inventory row", async () => {
    const product = await fixture(null);
    const results = await Promise.all([adjust(product.id, 20), adjust(product.id, 20)]);
    results.forEach((result) => ok(result, 200));
    expect(await position(product.id, 20)).toHaveLength(1);
    expect(await prisma.inventoryItem.count({ where: { storeId, productId: product.id } })).toBe(1);
  });
  it("an adjustment following a bulk count uses the bulk count's committed quantity", async () => {
    const product = await fixture();
    const [count, single] = await contended(product.id, () => bulk(product.id, 30, 10), () => adjust(product.id, 20));
    ok(count, 201); ok(single, 200);
    const movements = await position(product.id, 20);
    expect(movements.find((m) => m.stockCountId === count.body.id)?.balance.toNumber()).toBe(30);
    expect(movements.find((m) => m.note === "Single count")?.quantity.toNumber()).toBe(-10);
  });
  it("a stale bulk count following an adjustment rolls back its count and audit records", async () => {
    const product = await fixture();
    const countsBefore = await prisma.stockCount.count({ where: { storeId } });
    const auditsBefore = await prisma.auditLog.count({ where: { businessId, action: "inventory.count" } });
    const [single, count] = await contended(product.id, () => adjust(product.id, 20), () => bulk(product.id, 30, 10));
    ok(single, 200); ok(count, 409);
    expect(await position(product.id, 20)).toHaveLength(1);
    expect(await prisma.stockCount.count({ where: { storeId } })).toBe(countsBefore);
    expect(await prisma.auditLog.count({ where: { businessId, action: "inventory.count" } })).toBe(auditsBefore);
  });
  it("a bulk count without a baseline also serializes after an adjustment", async () => {
    const product = await fixture();
    const [single, count] = await contended(product.id, () => adjust(product.id, 20), () => bulk(product.id, 30));
    ok(single, 200); ok(count, 201);
    expect(await position(product.id, 30)).toHaveLength(2);
  });
  it("a count following a real sale subtracts the sold quantity before calculating its adjustment", async () => {
    const product = await fixture();
    const [sold, single] = await contended(product.id, () => sale(product.id), () => adjust(product.id, 20));
    ok(sold, 201); ok(single, 200);
    const movements = await position(product.id, 20);
    expect(movements.find((m) => m.type === "SALE")?.balance.toNumber()).toBe(8);
    expect(movements.find((m) => m.type === "ADJUSTMENT")?.quantity.toNumber()).toBe(12);
    expect(sold.body.fiscalDocuments[0].documentNo).toMatch(/^FR /);
  });
  it("a real sale following an adjustment leaves counted stock minus the sale", async () => {
    const product = await fixture();
    const [single, sold] = await contended(product.id, () => adjust(product.id, 20), () => sale(product.id));
    ok(single, 200); ok(sold, 201);
    expect(await position(product.id, 18)).toHaveLength(2);
  });
  it("an unchanged count does not add a movement or lose a queued sale", async () => {
    const product = await fixture();
    const [single, sold] = await contended(product.id, () => adjust(product.id, 10), () => sale(product.id));
    ok(single, 200); ok(sold, 201);
    const movements = await position(product.id, 8);
    expect(movements.map((m) => m.type)).toEqual(["SALE"]);
  });
  it("a queued online sale still refuses insufficient stock after a count", async () => {
    const product = await fixture();
    const [single, sold] = await contended(product.id, () => adjust(product.id, 0), () => sale(product.id));
    ok(single, 200); ok(sold, 400);
    const movements = await position(product.id, 0);
    expect(movements.map((m) => m.type)).toEqual(["ADJUSTMENT"]);
  });
  it("product-import stock counts also read their balance under the same lock", async () => {
    const product = await fixture();
    const imported = () => http().post("/products/import").set(auth()).send({ storeId, updateExisting: true, createCategories: false, rows: [{ line: 2, sku: product.sku, name: product.name, costPrice: 3, sellPrice: 5, exemptionCode: "M10", stock: 30 }] }).then((response) => response);
    const [single, result] = await contended(product.id, () => adjust(product.id, 20), imported);
    ok(single, 200); ok(result, 201);
    expect(result.body.updated).toBe(1);
    const movements = await position(product.id, 30);
    expect(movements.find((m) => m.note === "CSV import")?.quantity.toNumber()).toBe(10);
  });
  it.each([
    [StockMovementType.PURCHASE, 4], [StockMovementType.RETURN, 2], [StockMovementType.SALE_VOID, 2],
    [StockMovementType.TRANSFER_IN, 4], [StockMovementType.TRANSFER_OUT, -2],
  ])("serializes the shared %s movement writer with an absolute count", async (type, quantity) => {
    const product = await fixture();
    const move = () => prisma.$transaction((tx) => recordMovement(tx, { storeId, product, type, quantity, userId }));
    const [movement, single] = await contended(product.id, move, () => adjust(product.id, 20));
    ok(single, 200);
    expect(movement.balance.toNumber()).toBe(10 + quantity);
    const movements = await position(product.id, 20);
    expect(movements.find((m) => m.type === "ADJUSTMENT")?.quantity.toNumber()).toBe(10 - quantity);
  });
});
