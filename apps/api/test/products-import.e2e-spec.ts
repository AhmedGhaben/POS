import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). A fresh
 * business imports products: create vs update by SKU, category matching and
 * creation, stock at a store, skipped rows with reasons, and permissions.
 * Deletes everything it creates in afterAll.
 */
describe("Product CSV import (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "ImportPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let existingId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const importRows = (token: string, body: object) => http().post("/products/import").set(auth(token)).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({
        businessName: "E2E Import Shop",
        storeName: "E2E Import Store",
        firstName: "Imo",
        lastName: "Porter",
        email: `import-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    await http().patch("/businesses/me").set(auth(ownerToken)).send({ defaultTaxRate: 7 }).expect(200);
    await http().post("/categories").set(auth(ownerToken)).send({ name: "Drinks" }).expect(201);
    existingId = (
      await http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku: "TEA-1", name: "Old tea name", costPrice: 1, sellPrice: 2, taxRate: 5 })
        .expect(201)
    ).body.id;

    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({
        firstName: "Cash",
        lastName: "Ier",
        login: { email: `import-cashier-${RUN}@e2e.test`, role: "CASHIER", storeIds: [storeId], password: PASSWORD },
      })
      .expect(201);
    cashierToken = (
      await http().post("/auth/login").send({ email: `import-cashier-${RUN}@e2e.test`, password: PASSWORD }).expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    if (businessId) {
      const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
      const storeIds = (await prisma.store.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
      await prisma.$transaction([
        prisma.inventoryItem.deleteMany({ where: { storeId: { in: storeIds } } }),
        prisma.product.deleteMany({ where: { businessId } }),
        prisma.category.deleteMany({ where: { businessId } }),
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
    await app.close();
  });

  it("creates new products, updates existing SKUs, matches and creates categories, sets stock", async () => {
    const res = await importRows(ownerToken, {
      updateExisting: true,
      createCategories: true,
      storeId,
      rows: [
        { line: 2, sku: "TEA-1", name: "Green tea", sellPrice: 2.5, category: "drinks", stock: 12 },
        { line: 3, sku: "COF-1", name: "Coffee", sellPrice: 3, costPrice: 1.2, category: "Drinks", stock: 5 },
        { line: 4, sku: "CHIP-1", name: "Chips", sellPrice: 1.5, category: "Snacks" },
        { line: 5, sku: "COF-1", name: "Coffee again", sellPrice: 9 },
      ],
    }).expect(201);

    expect(res.body).toEqual({
      created: 2,
      updated: 1,
      skipped: [{ line: 5, sku: "COF-1", reason: "SKU appears more than once in the file" }],
    });

    const products = await prisma.product.findMany({ where: { businessId }, include: { category: true } });
    const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));
    // Update keeps fields the file didn't mention (cost, tax) and the same row.
    expect(bySku["TEA-1"]).toMatchObject({ id: existingId, name: "Green tea" });
    expect(Number(bySku["TEA-1"].costPrice)).toBe(1);
    expect(Number(bySku["TEA-1"].taxRate)).toBe(5);
    expect(bySku["TEA-1"].category?.name).toBe("Drinks");
    // New products default cost to 0 and tax to the business default.
    expect(Number(bySku["CHIP-1"].costPrice)).toBe(0);
    expect(Number(bySku["CHIP-1"].taxRate)).toBe(7);
    expect(bySku["CHIP-1"].category?.name).toBe("Snacks");
    expect(await prisma.category.count({ where: { businessId } })).toBe(2);

    const stock = await prisma.inventoryItem.findMany({ where: { storeId } });
    expect(Object.fromEntries(stock.map((i) => [i.productId, i.quantity]))).toEqual({
      [existingId]: 12,
      [bySku["COF-1"].id]: 5,
    });
  });

  it("skips existing SKUs and unknown categories when those options are off", async () => {
    const res = await importRows(ownerToken, {
      updateExisting: false,
      createCategories: false,
      rows: [
        { line: 2, sku: "TEA-1", name: "Should not change", sellPrice: 99 },
        { line: 3, sku: "NEW-1", name: "Mystery", sellPrice: 1, category: "Unknown aisle" },
        { line: 4, sku: "NEW-2", name: "Plain", sellPrice: 1 },
      ],
    }).expect(201);

    expect(res.body.created).toBe(1);
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped.map((s: { line: number }) => s.line)).toEqual([2, 3]);
    const tea = await prisma.product.findUniqueOrThrow({ where: { id: existingId } });
    expect(tea.name).toBe("Green tea");
  });

  it("rejects bad rows, a missing store for stock, and other businesses' stores", async () => {
    await importRows(ownerToken, {
      updateExisting: true,
      createCategories: true,
      rows: [{ line: 2, sku: "X", name: "X", sellPrice: -1 }],
    }).expect(400);
    await importRows(ownerToken, {
      updateExisting: true,
      createCategories: true,
      rows: [{ line: 2, sku: "X", name: "X", sellPrice: 1, stock: 3 }],
    }).expect(400);
    await importRows(ownerToken, {
      updateExisting: true,
      createCategories: true,
      storeId: "seed-store-main",
      rows: [{ line: 2, sku: "X", name: "X", sellPrice: 1, stock: 3 }],
    }).expect(404);
  });

  it("is limited to owners and managers", async () => {
    await importRows(cashierToken, {
      updateExisting: true,
      createCategories: true,
      rows: [{ line: 2, sku: "X", name: "X", sellPrice: 1 }],
    }).expect(403);
  });
});
