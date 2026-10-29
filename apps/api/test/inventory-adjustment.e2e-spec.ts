import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { deleteBusiness } from "./cleanup";

describe("Inventory adjustment isolation (isolated e2e)", () => {
  let app: INestApplication, prisma: PrismaService;
  let token: string, storeId: string, businessId: string, userId: string;
  let otherToken: string, otherStoreId: string, otherBusinessId: string;
  let ownProduct: string, foreignProduct: string, foreignService: string;
  const http = () => request(app.getHttpServer());
  const auth = (accessToken = token) => ({ Authorization: `Bearer ${accessToken}` });
  const adjust = (productId: string, body: object, targetStore = storeId, accessToken = token) =>
    http().put(`/stores/${targetStore}/inventory/${productId}`).set(auth(accessToken)).send(body);

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["127.0.0.1", "localhost"].includes(database.hostname) || (!/test|recovery|ci/.test(database.pathname) && process.env.CI !== "true")) throw new Error("Use an isolated local test database");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init(); prisma = app.get(PrismaService);
    const register = async (name: string) => (await http().post("/auth/register").send({ businessName: name, storeName: name, firstName: "Test", lastName: "Owner", email: `adjust-${name}-${Date.now()}@e2e.test`, password: "AdjustTest123!" }).expect(201)).body;
    const own = await register("own"); token = own.accessToken; businessId = own.user.businessId; userId = own.user.id; storeId = own.stores[0].id;
    const other = await register("other"); otherToken = other.accessToken; otherBusinessId = other.user.businessId; otherStoreId = other.stores[0].id;
    const product = async (business: string, sku: string, trackStock = true) => (await prisma.product.create({ data: { businessId: business, sku, name: `Private ${sku}`, costPrice: 3, sellPrice: 5, trackStock } })).id;
    ownProduct = await product(businessId, "OWN"); foreignProduct = await product(otherBusinessId, "FOREIGN"); foreignService = await product(otherBusinessId, "FOREIGN-SERVICE", false);
  }, 30_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
      if (otherBusinessId) await deleteBusiness(prisma, otherBusinessId);
    } finally { await app?.close(); }
  });

  async function snapshot() {
    const [items, movements, audit] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { storeId: { in: [storeId, otherStoreId] } }, orderBy: { id: "asc" } }),
      prisma.stockMovement.findMany({ where: { storeId: { in: [storeId, otherStoreId] } }, orderBy: { id: "asc" } }),
      prisma.auditLog.findMany({ where: { businessId: { in: [businessId, otherBusinessId] } }, orderBy: { id: "asc" } }),
    ]);
    return { items, movements, audit };
  }

  it("rejects unknown and foreign products identically, without creating stock, movements or audit rows", async () => {
    const before = await snapshot();
    for (const id of ["missing-product", foreignProduct, foreignService]) {
      const response = await adjust(id, { quantity: 10, note: "Rejected count" }).expect(404);
      expect(response.body).toMatchObject({ statusCode: 404, message: "Product not found" });
      expect(JSON.stringify(response.body)).not.toContain("Private");
      expect(await snapshot()).toEqual(before);
    }
  });

  it("also protects a foreign product that already has stock in its own business", async () => {
    await adjust(foreignProduct, { quantity: 7 }, otherStoreId, otherToken).expect(200);
    const before = await snapshot();
    await adjust(foreignProduct, { quantity: 99 }).expect(404);
    await adjust(ownProduct, { quantity: 99 }, otherStoreId, otherToken).expect(404);
    // Store access is independently checked even when the product is the caller's.
    await adjust(ownProduct, { quantity: 99 }, otherStoreId).expect(403);
    expect(await snapshot()).toEqual(before);
  });

  it("keeps legitimate absolute adjustments, reorder levels, movement costs and actor attribution", async () => {
    await adjust(ownProduct, { quantity: 10, reorderLevel: 2, note: "Initial count" }).expect(200);
    const result = await adjust(ownProduct, { quantity: 4, reorderLevel: 1, note: "Recount" }).expect(200);
    expect(result.body).toMatchObject({ storeId, productId: ownProduct, quantity: "4", reorderLevel: "1", averageCost: "3" });
    const movements = await prisma.stockMovement.findMany({ where: { storeId, productId: ownProduct } });
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual([-6, 10]);
    expect(movements.every((m) => m.type === "ADJUSTMENT" && m.userId === userId && m.unitCost.equals(3))).toBe(true);
    expect(await prisma.auditLog.count({ where: { businessId, action: "PUT /stores/:storeId/inventory/:productId" } })).toBe(2);
    await adjust(ownProduct, { quantity: 4, reorderLevel: 5 }).expect(200);
    expect(await prisma.stockMovement.count({ where: { storeId, productId: ownProduct } })).toBe(2);
  });

  it("still permits fractional counts for weighed products and refuses fractions for whole-unit products", async () => {
    const weighed = await prisma.product.create({ data: { businessId, sku: "WEIGHED", name: "Rice", unit: "kg", costPrice: 2, sellPrice: 4 } });
    await adjust(weighed.id, { quantity: 1.125 }).expect(200).expect(({ body }) => expect(body.quantity).toBe("1.125"));
    const before = await snapshot();
    await adjust(ownProduct, { quantity: 1.5 }).expect(400);
    expect(await snapshot()).toEqual(before);
  });
});
