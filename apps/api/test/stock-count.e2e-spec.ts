import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { buildXlsx } from "../src/common/xlsx";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { InventoryService } from "../src/inventory/inventory.service";

/** Must be explicitly aimed at the isolated recovery/test database; never the demo. */
describe("Bulk stock counts (isolated e2e)", () => {
  let app: INestApplication, prisma: PrismaService;
  let token: string, cashier: string, storeId: string, businessId: string, userId: string;
  let otherStore: string, otherBusiness: string, foreignProduct: string;
  let a: string, b: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());
  const path = (suffix = "") => `/stores/${storeId}/inventory/counts${suffix}`;
  const file = (text: string) => ({ fileName: "count.csv", dataUrl: `data:text/csv;base64,${Buffer.from(text).toString("base64")}` });
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["localhost", "127.0.0.1"].includes(database.hostname) || (!/test|recovery|ci/.test(database.pathname) && process.env.CI !== "true")) throw new Error("Use an isolated local test database");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init(); prisma = app.get(PrismaService);
    const register = async (name: string) => (await http().post("/auth/register").send({ businessName: name, storeName: name, firstName: "Test", lastName: "Count", email: `${name}-${Date.now()}@e2e.test`, password: "RecoveryTest123!" }).expect(201)).body;
    const first = await register("count"); token = first.accessToken; storeId = first.stores[0].id; businessId = first.user.businessId; userId = first.user.id;
    const second = await register("other-count"); otherStore = second.stores[0].id; otherBusiness = second.user.businessId;
    const product = async (sku: string, business: string, unit = "un") => (await prisma.product.create({ data: { businessId: business, sku, name: sku, costPrice: 2, sellPrice: 4, unit, barcode: sku === "A" ? "00123" : null } })).id;
    a = await product("A", businessId); b = await product("B", businessId, "kg"); foreignProduct = await product("OTHER", otherBusiness);
    const employee = await prisma.user.create({ data: { businessId, email: `cashier-${Date.now()}@e2e.test`, firstName: "Cash", lastName: "Test", passwordHash: "unused", role: "CASHIER", storeUsers: { create: { storeId } } } });
    const { JwtService } = await import("@nestjs/jwt");
    cashier = app.get(JwtService).sign({ sub: employee.id, businessId, role: "CASHIER" }, { secret: process.env.JWT_ACCESS_SECRET });
  }, 30_000);
  afterAll(async () => {
    if (businessId) await deleteBusiness(prisma, businessId);
    if (otherBusiness) await deleteBusiness(prisma, otherBusiness);
    await app?.close();
  });

  it("saves one count with actor, store, note, costs and only changed movements; repeating is a no-op", async () => {
    const result = await http().post(path()).set(auth()).send({ note: "Shelf count", lines: [{ productId: a, quantity: 8, expectedQuantity: 0 }, { productId: b, quantity: 1.25, expectedQuantity: 0 }] }).expect(201);
    expect(result.body.changed).toBe(2);
    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id: result.body.id }, include: { movements: true } });
    expect(count).toMatchObject({ businessId, storeId, userId, note: "Shelf count" });
    expect(count.movements).toHaveLength(2);
    expect(count.movements.every((m) => m.userId === userId && m.storeId === storeId && m.type === "ADJUSTMENT" && m.unitCost.equals(2))).toBe(true);
    expect(await prisma.auditLog.count({ where: { businessId, action: "inventory.count", entityId: count.id } })).toBe(1);
    await http().post(path()).set(auth()).send({ lines: [{ productId: a, quantity: 8, expectedQuantity: 8 }] }).expect(201).expect(({ body }) => expect(body.changed).toBe(0));
    expect(await prisma.stockMovement.count({ where: { storeId } })).toBe(2);
  });
  it("rejects invalid payloads, duplicate products and non-whole units", async () => {
    for (const lines of [[], [{ productId: a, quantity: -1 }], [{ productId: a, quantity: 1.0001 }], [{ productId: a, quantity: 100000000000 }], [{ productId: a, quantity: 1.5 }], [{ productId: a, quantity: 1 }, { productId: a, quantity: 2 }]]) {
      await http().post(path()).set(auth()).send({ lines }).expect(400);
    }
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: a } } })).quantity.toString()).toBe("8");
  });
  it("rolls back the entire count when a later row fails; rejects stale previews", async () => {
    const ids = [a, b].sort();
    const last = await prisma.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: ids[1] } } });
    const before = await prisma.stockCount.count({ where: { storeId } });
    await http().post(path()).set(auth()).send({ lines: [{ productId: ids[0], quantity: 3 }, { productId: ids[1], quantity: 4, expectedQuantity: 999 }] }).expect(409);
    expect(await prisma.stockCount.count({ where: { storeId } })).toBe(before);
    expect(await prisma.stockMovement.count({ where: { storeId } })).toBe(2);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: last.id } })).quantity.equals(last.quantity)).toBe(true);
  });
  it("enforces store, business and role boundaries on both routes", async () => {
    await http().post(`/stores/${otherStore}/inventory/counts`).set(auth()).send({ lines: [{ productId: a, quantity: 1 }] }).expect(403);
    await http().post(`/stores/${otherStore}/inventory/counts/preview`).set(auth()).send(file("SKU,Quantity\nA,1")).expect(403);
    await http().post(path()).set(auth()).send({ lines: [{ productId: foreignProduct, quantity: 1 }] }).expect(400);
    for (const suffix of ["", "/preview"]) await http().post(path(suffix)).set({ Authorization: `Bearer ${cashier}` }).send(suffix ? file("SKU,Quantity\nA,1") : { lines: [{ productId: a, quantity: 1 }] }).expect(403);
  });
  it("previews CSV without writes, exposes row errors, preserves barcode zeroes, validates file size/headings", async () => {
    const before = await prisma.stockCount.count();
    const res = await http().post(path("/preview")).set(auth()).send(file("Barcode;Quantidade contada\n00123;4\n00123;5\nmissing;1\n;2")).expect(201);
    expect(res.body.rows[0]).toMatchObject({ productId: a, quantity: 4, currentQuantity: "8", difference: "-4" });
    expect(res.body.rows.slice(1).map((r: { error: string }) => r.error)).toEqual(["duplicateProduct", "unknownProduct", "missingIdentifier"]);
    expect(await prisma.stockCount.count()).toBe(before);
    await http().post(path("/preview")).set(auth()).send(file("Name,Count\nA,1")).expect(400);
    await http().post(path("/preview")).set(auth()).send(file("SKU,Quantity")).expect(400);
    await http().post(path("/preview")).set(auth()).send(file('SKU,Quantity\n"A,1')).expect(400);
    await http().post(path("/preview")).set(auth()).send({ ...file("SKU,Quantity\nA,1"), fileName: "old.xls" }).expect(400);
    await expect(app.get(InventoryService).previewCount(storeId, { fileName: "large.csv", dataUrl: "x".repeat(7 * 1024 * 1024 + 1) })).rejects.toThrow();
  });
  it("reads Excel counts and applies the exact preview through the same transaction", async () => {
    const workbook = buildXlsx([{ name: "Count", header: ["SKU", "Quantity"], rows: [["B", 2.125]] }]);
    const preview = await http().post(path("/preview")).set(auth()).send({ fileName: "count.xlsx", dataUrl: `data:application/octet-stream;base64,${workbook.toString("base64")}` }).expect(201);
    expect(preview.body.rows[0]).toMatchObject({ productId: b, quantity: 2.125, difference: "0.875" });
    const row = preview.body.rows[0];
    await http().post(path()).set(auth()).send({ lines: [{ productId: row.productId, quantity: row.quantity, expectedQuantity: Number(row.currentQuantity) }] }).expect(201);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: b } } })).quantity.toString()).toBe("2.125");
  });
  it("serializes simultaneous counts so only one stale baseline can succeed", async () => {
    const body = (quantity: number) => ({ lines: [{ productId: a, quantity, expectedQuantity: 8 }] });
    const responses = await Promise.all([http().post(path()).set(auth()).send(body(6)), http().post(path()).set(auth()).send(body(7))]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: a } } });
    const movements = await prisma.stockMovement.findMany({ where: { storeId, productId: a } });
    expect(movements.reduce((total, m) => total + Number(m.quantity), 0)).toBe(Number(item.quantity));
  });
});
