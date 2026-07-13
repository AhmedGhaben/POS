import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). Covers
 * Phase 2: purchases incrementing stock, returns reversing it (partially and
 * with an over-return guard), and role guards on the new modules.
 */
describe("POS API Phase 2 (e2e)", () => {
  let app: INestApplication;
  const OWNER_EMAIL = "owner@demo-store.test";
  const OWNER_PASSWORD = "OwnerPass123!";
  const CASHIER_EMAIL = "cashier@demo-store.test";
  const CASHIER_PASSWORD = "CashierPass123!";
  const STORE_ID = "seed-store-main";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function ownerToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);
    return res.body.accessToken;
  }

  async function cashierToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: CASHIER_EMAIL, password: CASHIER_PASSWORD })
      .expect(200);
    return res.body.accessToken;
  }

  it("rejects a cashier creating a purchase with 403 (role guard)", async () => {
    const token = await cashierToken();
    await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId: STORE_ID, supplierId: "x", lineItems: [] })
      .expect(403);
  });

  it("rejects a cashier listing employees with 403 (role guard)", async () => {
    const token = await cashierToken();
    await request(app.getHttpServer())
      .get("/employees")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("a purchase increments store stock", async () => {
    const token = await ownerToken();

    const [suppliersRes, productsRes] = await Promise.all([
      request(app.getHttpServer()).get("/suppliers").set("Authorization", `Bearer ${token}`).expect(200),
      request(app.getHttpServer()).get("/products").set("Authorization", `Bearer ${token}`).expect(200),
    ]);
    const supplier = suppliersRes.body[0];
    const product = productsRes.body[0];
    expect(supplier).toBeDefined();
    expect(product).toBeDefined();

    const before = await request(app.getHttpServer())
      .get(`/stores/${STORE_ID}/inventory`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const beforeQty = before.body.find((i: { productId: string }) => i.productId === product.id).quantity;

    await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        storeId: STORE_ID,
        supplierId: supplier.id,
        lineItems: [{ productId: product.id, quantity: 15, unitCost: 1 }],
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/stores/${STORE_ID}/inventory`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const afterQty = after.body.find((i: { productId: string }) => i.productId === product.id).quantity;

    expect(afterQty).toBe(beforeQty + 15);
  });

  it("a partial return reverses stock and rejects over-returning", async () => {
    const token = await ownerToken();

    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const product = productsRes.body[0];

    const stockBeforeSale = (
      await request(app.getHttpServer())
        .get(`/stores/${STORE_ID}/inventory`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.find((i: { productId: string }) => i.productId === product.id).quantity;

    const saleRes = await request(app.getHttpServer())
      .post("/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId: STORE_ID, paymentMethod: "CASH", lineItems: [{ productId: product.id, quantity: 6 }] })
      .expect(201);
    const saleId = saleRes.body.id;

    const stockAfterSale = (
      await request(app.getHttpServer())
        .get(`/stores/${STORE_ID}/inventory`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.find((i: { productId: string }) => i.productId === product.id).quantity;
    expect(stockAfterSale).toBe(stockBeforeSale - 6);

    await request(app.getHttpServer())
      .post("/returns")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId: STORE_ID, saleId, reason: "e2e test", lineItems: [{ productId: product.id, quantity: 2 }] })
      .expect(201);

    const stockAfterReturn = (
      await request(app.getHttpServer())
        .get(`/stores/${STORE_ID}/inventory`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.find((i: { productId: string }) => i.productId === product.id).quantity;
    expect(stockAfterReturn).toBe(stockAfterSale + 2);

    // Only 4 of the original 6 remain returnable (2 already returned) — asking for 5 must fail.
    await request(app.getHttpServer())
      .post("/returns")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId: STORE_ID, saleId, lineItems: [{ productId: product.id, quantity: 5 }] })
      .expect(400);
  });

  it("expenses can be logged and listed for a store", async () => {
    const token = await ownerToken();

    await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId: STORE_ID, category: "SUPPLIES", description: "e2e test expense", amount: 12.5 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/expenses/store/${STORE_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.some((e: { description: string }) => e.description === "e2e test expense")).toBe(true);
  });
});
