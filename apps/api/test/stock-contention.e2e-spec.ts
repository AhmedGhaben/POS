import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { IntegrationService } from "../src/accounting/integration.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { stockSqlState } from "../src/stock/stock-transaction";
import { deleteBusiness } from "./cleanup";

// Run on an isolated superuser test DB with deadlock_timeout=100ms. That
// exercises PostgreSQL's deadlock detector before the app's 750ms lock bound.
describe("Stock contention and checkout recovery (isolated PostgreSQL)", () => {
  let app: INestApplication, db: PrismaService, businessId: string, storeId: string, otherStore: string, token: string, userId: string;
  let products: { id: string; sku: string }[], shifts: string[], terminals: string[];
  let hook: Prisma.Middleware | undefined;
  const releases: (() => void)[] = [];
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const sell = (order = [0, 1], till = 0, clientId: string = randomUUID()) => http().post("/sales").set(auth()).send({ storeId, terminalId: terminals[till], shiftClientId: shifts[till], clientId, lineItems: order.map((i) => ({ productId: products[i].id, quantity: 1 })), payments: [{ method: "CASH", amount: order.length * 2 }] }).then((r) => r);
  const saleCount = () => db.sale.count({ where: { storeId } });
  const docs = () => db.fiscalDocument.findMany({ where: { storeId }, orderBy: { number: "asc" } });
  const balances = async () => (await db.inventoryItem.findMany({ where: { storeId, productId: { in: products.map((p) => p.id) } }, orderBy: { productId: "asc" } })).map((r) => r.quantity.toNumber());
  const saleMovements = () => db.stockMovement.count({ where: { storeId, type: "SALE" } });
  async function waitForLock(fragment: string) {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const [r] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND pid <> pg_backend_pid() AND wait_event_type='Lock' AND query LIKE ${`%${fragment}%`}`;
      if (r.n) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`No lock waiter: ${fragment}`);
  }
  function pauseFirstRow() {
    let ready!: () => void, release!: () => void, first = true;
    const entered = new Promise<void>((r) => { ready = r; }), gate = new Promise<void>((r) => { release = r; }); releases.push(release);
    hook = async (params, next) => { const result = await next(params); if (first && params.model === "InventoryItem" && params.action === "upsert" && params.args.where.storeId_productId.storeId === storeId) { first = false; ready(); await gate; } return result; };
    return { entered, release };
  }
  async function accountOnce(expected: number) {
    const integration = app.get(IntegrationService);
    await integration.run(businessId, userId); await integration.run(businessId, userId);
    expect(await db.accountingSourceLink.count({ where: { businessId, sourceType: "FISCAL_DOCUMENT", skipped: false } })).toBe(expected);
    const linked = await db.accountingSourceLink.findMany({ where: { businessId, sourceType: "FISCAL_DOCUMENT" } });
    expect(new Set(linked.map((l) => l.entryId)).size).toBe(expected);
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!); if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/test/.test(url.pathname)) throw new Error("Isolated local test DB required");
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); app.useGlobalFilters(new HttpExceptionFilter()); await app.init(); db = app.get(PrismaService);
    db.$use((p, n) => hook ? hook(p, n) : n(p));
  });
  beforeEach(async () => {
    const s = (await http().post("/auth/register").send({ businessName: "Contention test", storeName: "First test store", firstName: "Test", lastName: "Owner", email: `stock-contention-${randomUUID()}@e2e.test`, password: "Contention123!" }).expect(201)).body;
    token = s.accessToken; businessId = s.user.businessId; storeId = s.stores[0].id; userId = s.user.id;
    otherStore = (await http().post("/stores").set(auth()).send({ name: "Other test store" }).expect(201)).body.id;
    products = [];
    for (const sku of ["A", "B"]) {
      const p = (await http().post("/products").set(auth()).send({ sku, name: sku, costPrice: 1, sellPrice: 2, exemptionCode: "M10" }).expect(201)).body; products.push(p);
      for (const id of [storeId, otherStore]) await http().put(`/stores/${id}/inventory/${p.id}`).set(auth()).send({ quantity: 10 }).expect(200);
    }
    terminals = []; shifts = [];
    for (const name of ["One", "Two"]) {
      const terminal = (await http().post("/terminals").set(auth()).send({ storeId, name }).expect(201)).body;
      terminals.push(terminal.id); const clientId = randomUUID(); shifts.push(clientId);
      await http().post("/shifts/open").set(auth()).send({ storeId, terminalId: terminal.id, clientId, openingFloat: 0 }).expect(200);
    }
    await http().patch("/accounting/settings").set(auth()).send({ enabled: true, autoPost: false }).expect(200);
  }, 30_000);
  afterEach(async () => { for (const r of releases.splice(0)) r(); hook = undefined; if (businessId) await deleteBusiness(db, businessId); });
  afterAll(async () => { await app?.close(); });

  it.each([[0, 1], [1, 0]])("two tills serialize overlapping carts with order %j", async (...order: number[]) => {
    const pause = pauseFirstRow(); const a = sell(); await pause.entered; const b = sell(order, 1); await waitForLock("pg_advisory_xact_lock"); pause.release();
    const responses = await Promise.all([a, b]); expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(await balances()).toEqual([8, 8]); expect(await saleMovements()).toBe(4); expect(await saleCount()).toBe(2);
    const documents = await docs(); expect(documents).toHaveLength(2); expect(documents.every((d) => d.number === 1)).toBe(true); expect(new Set(documents.map((d) => d.documentNo)).size).toBe(2);
    await accountOnce(2);
  });

  it("sales, stale bulk counts and absolute adjustments serialize without partial counts", async () => {
    const pause = pauseFirstRow(); const sale = sell(); await pause.entered;
    const count = http().post(`/stores/${storeId}/inventory/counts`).set(auth()).send({ lines: [...products].reverse().map((p) => ({ productId: p.id, quantity: 12, expectedQuantity: 10 })) }).then((r) => r);
    const adjusted = http().put(`/stores/${storeId}/inventory/${products[0].id}`).set(auth()).send({ quantity: 3 }).then((r) => r);
    await waitForLock("pg_advisory_xact_lock"); pause.release();
    expect((await sale).status).toBe(201); expect((await count).status).toBe(409); expect((await adjusted).status).toBe(200);
    const a = await db.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: products[0].id } } }); expect(a.quantity.toNumber()).toBe(3);
    expect(await db.stockCount.count({ where: { businessId } })).toBe(0); expect(await saleCount()).toBe(1); await accountOnce(1);
  });

  it("simultaneous retries of one idempotency key return one committed sale", async () => {
    const pause = pauseFirstRow(), key = randomUUID();
    const first = sell([0, 1], 0, key); await pause.entered;
    const duplicate = sell([0, 1], 0, key); await waitForLock("pg_advisory_xact_lock"); pause.release();
    const [a, b] = await Promise.all([first, duplicate]);
    expect([a.status, b.status]).toEqual([201, 201]); expect(a.body.id).toBe(b.body.id);
    expect(await saleCount()).toBe(1); expect(await saleMovements()).toBe(2);
    expect(await balances()).toEqual([9, 9]); expect((await docs()).map((d) => d.number)).toEqual([1]);
    await accountOnce(1);
  });

  it("opposite transfers take both stores in the same order", async () => {
    const transfer = (fromStoreId: string, toStoreId: string, reverse = false) => http().post("/transfers").set(auth()).send({ fromStoreId, toStoreId, lineItems: (reverse ? [...products].reverse() : products).map((p) => ({ productId: p.id, quantity: 1 })) }).then((r) => r);
    const result = await Promise.all([transfer(storeId, otherStore), transfer(otherStore, storeId, true)]);
    expect(result.map((r) => r.status)).toEqual([201, 201]); expect(await balances()).toEqual([10, 10]);
    expect(await db.stockMovement.count({ where: { storeId: { in: [storeId, otherStore] }, type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] } } })).toBe(8);
  });

  it("long row waits exhaust safely before the till timeout; same key retry/replay issues one document", async () => {
    let ready!: () => void, release!: () => void;
    const locked = new Promise<void>((r) => { ready = r; }), gate = new Promise<void>((r) => { release = r; }); releases.push(release);
    const holding = db.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM inventory_items WHERE "storeId"=${storeId} AND "productId"=${products[0].id} FOR UPDATE`; ready(); await gate; }, { timeout: 15000 });
    await locked; const clientId = randomUUID(), started = Date.now(); let result;
    try { result = await sell([0, 1], 0, clientId); } finally { release(); await holding; }
    expect(result.status).toBe(409); expect(result.body).toMatchObject({ code: "STOCK_BUSY", message: "Stock is busy. Please try again." }); expect(Date.now() - started).toBeLessThan(7000);
    expect(await balances()).toEqual([10, 10]); expect(await saleCount()).toBe(0); expect(await docs()).toHaveLength(0); expect(await saleMovements()).toBe(0);
    const accepted = await sell([0, 1], 0, clientId), replay = await sell([0, 1], 0, clientId);
    expect(accepted.status).toBe(201); expect(replay.body.id).toBe(accepted.body.id); expect(await saleCount()).toBe(1); expect(await saleMovements()).toBe(2); expect((await docs()).map((d) => d.number)).toEqual([1]); await accountOnce(1);
  });

  it("retries after real PostgreSQL deadlock rollback, including the same sale key", async () => {
    const pause = pauseFirstRow(); const prior = hook!; const errors: string[] = [];
    hook = async (p, next) => { try { return await prior(p, next); } catch (e) { const code = stockSqlState(e); if (code) errors.push(code); throw e; } };
    let ready!: () => void, waitForA!: () => void;
    const hasB = new Promise<void>((r) => { ready = r; }), go = new Promise<void>((r) => { waitForA = r; }); releases.push(waitForA);
    // Session-local test setting: the outside writer must not win victim selection.
    const external = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('deadlock_timeout', '5s', true)`;
      await tx.$queryRaw`SELECT id FROM inventory_items WHERE "storeId"=${storeId} AND "productId"=${products[1].id} FOR UPDATE`; ready(); await go;
      await tx.$queryRaw`SELECT id FROM inventory_items WHERE "storeId"=${storeId} AND "productId"=${products[0].id} FOR UPDATE`;
    }, { timeout: 15000 });
    await hasB; const key = randomUUID(), request = sell([0, 1], 0, key); await pause.entered; waitForA(); await waitForLock("inventory_items"); pause.release();
    const result = await request; await external;
    expect(result.status).toBe(201); expect(errors).toContain("40P01"); expect(await balances()).toEqual([9, 9]); expect(await saleMovements()).toBe(2); expect((await docs()).map((d) => d.number)).toEqual([1]);
    expect((await sell([0, 1], 0, key)).body.id).toBe(result.body.id); await accountOnce(1);
  });

  it.each(["FR", "FT"])("%s rollback after fiscal writes and exhausted retries leaves no counters, documents or duplicate accounting", async (kind) => {
    const customer = kind === "FT" ? (await http().post("/customers").set(auth()).send({ name: "Credit test buyer", taxId: "5417000555", creditLimit: 100 }).expect(201)).body : null;
    const checkout = (clientId: string) => customer ? http().post("/sales").set(auth()).send({ storeId, terminalId: terminals[0], shiftClientId: shifts[0], clientId, customerId: customer.id, creditAmount: 4, payments: [], lineItems: products.map((p) => ({ productId: p.id, quantity: 1 })) }).then((r) => r) : sell([0, 1], 0, clientId);
    let failures = 0; const attemptedNumbers: number[] = [];
    hook = async (params, next) => { const result = await next(params); if (params.model === "FiscalDocument" && params.action === "create" && params.args.data.businessId === businessId) { failures++; attemptedNumbers.push(result.number); throw new Prisma.PrismaClientKnownRequestError("aborted transaction", { code: "P2034", clientVersion: "test" }); } return result; };
    const key = randomUUID(), rejected = await checkout(key); expect(rejected.status).toBe(409); expect(rejected.body.code).toBe("STOCK_BUSY"); expect(failures).toBe(3); expect(attemptedNumbers).toEqual([1, 1, 1]);
    expect(await saleCount()).toBe(0); expect(await docs()).toHaveLength(0); expect(await saleMovements()).toBe(0); expect(await balances()).toEqual([10, 10]); expect(await db.invoice.count({ where: { businessId } })).toBe(0);
    hook = undefined; const accepted = await checkout(key); expect(accepted.status).toBe(201); expect((await docs()).map((d) => [d.documentType, d.number])).toEqual([[kind, 1]]);
    expect((await checkout(key)).body.id).toBe(accepted.body.id); expect(await saleCount()).toBe(1); expect(await saleMovements()).toBe(2); await accountOnce(1);
  });
});
