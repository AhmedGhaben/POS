import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { saleTotal } from "./sale-total";
import { ensureShift } from "./shift-helper";

/**
 * A new product shows on the Inventory page at 0 before it has any stock
 * row, its stock can be set there, and the till then sells it. Archived
 * products and services don't show. Runs against the dev database with its
 * own business, deleted in afterAll.
 */
describe("Inventory lists new products (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  let businessId: string | undefined;
  let token: string;
  let storeId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const createProduct = (body: object) =>
    http()
      .post("/products")
      .set(auth())
      .send({ costPrice: 4, sellPrice: 10, exemptionCode: "M10", ...body })
      .expect(201);
  const inventory = async () => (await http().get(`/stores/${storeId}/inventory`).set(auth()).expect(200)).body as {
    id: string;
    productId: string;
    quantity: string;
    reorderLevel: string;
    averageCost: string;
  }[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({
        businessName: "E2E Inventory Shop",
        storeName: "E2E Inventory Store",
        firstName: "Ina",
        lastName: "Ventory",
        email: `inventory-owner-${RUN}@e2e.test`,
        password: "InventoryPass123!",
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    token = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
  });

  afterAll(async () => {
    if (businessId) {
      await deleteBusiness(prisma, businessId);
    }
    await app.close();
  });

  it("shows a new product at 0, lets its stock be set, and the till sells it", async () => {
    const product = (await createProduct({ sku: "NEW-1", name: "Brand new" })).body;
    expect(await prisma.inventoryItem.count({ where: { productId: product.id } })).toBe(0);

    const listed = (await inventory()).find((i) => i.productId === product.id);
    expect(listed).toMatchObject({ id: `new:${product.id}`, quantity: "0", reorderLevel: "0", averageCost: "4" });

    await http().put(`/stores/${storeId}/inventory/${product.id}`).set(auth()).send({ quantity: 10 }).expect(200);
    const row = (await inventory()).find((i) => i.productId === product.id);
    expect(row?.id).not.toMatch(/^new:/);
    expect(Number(row?.quantity)).toBe(10);
    const movements = await prisma.stockMovement.findMany({ where: { storeId, productId: product.id } });
    expect(movements.map((m) => [m.type, Number(m.quantity)])).toEqual([["ADJUSTMENT", 10]]);

    await http()
      .post("/sales")
      .set(auth())
      .send({
        storeId,
        shiftClientId: await ensureShift(app, token, storeId),
        lineItems: [{ productId: product.id, quantity: 2 }],
        payments: [{ method: "CASH", amount: await saleTotal(app, storeId, product, 2) }],
      })
      .expect(201);
    expect(Number((await inventory()).find((i) => i.productId === product.id)?.quantity)).toBe(8);
  });

  it("leaves out archived products and products without stock", async () => {
    const archived = (await createProduct({ sku: "OLD-1", name: "Archived" })).body;
    await http().patch(`/products/${archived.id}`).set(auth()).send({ isActive: false }).expect(200);
    const service = (await createProduct({ sku: "SRV-1", name: "Service", trackStock: false })).body;

    const ids = (await inventory()).map((i) => i.productId);
    expect(ids).not.toContain(archived.id);
    expect(ids).not.toContain(service.id);
  });
});
