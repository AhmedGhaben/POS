import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts) — assumes
 * `prisma migrate dev` + the seed script have already been run against
 * DATABASE_URL. Covers the Phase 1 done-when criteria: login, guards
 * (401/403), and a sale decrementing store stock.
 */
describe("POS API (e2e)", () => {
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

  it("rejects unauthenticated requests with 401", async () => {
    await request(app.getHttpServer()).get("/products").expect(401);
  });

  it("logs the owner in and returns accessible stores", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe("OWNER");
    expect(res.body.stores.some((s: { id: string }) => s.id === STORE_ID)).toBe(true);
  });

  it("rejects a cashier creating a product with 403 (role guard)", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: CASHIER_EMAIL, password: CASHIER_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .send({ sku: "NOPE", name: "Should not be created", costPrice: 1, sellPrice: 2 })
      .expect(403);
  });

  it("rejects a cashier accessing a store they are not assigned to with 403 (store guard)", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: CASHIER_EMAIL, password: CASHIER_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .get("/stores/not-a-real-store/inventory")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .expect(403);
  });

  it("completes a sale and decrements store stock", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);
    const token = loginRes.body.accessToken;

    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const product = productsRes.body[0];
    expect(product).toBeDefined();

    const inventoryBefore = await request(app.getHttpServer())
      .get(`/stores/${STORE_ID}/inventory`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const before = inventoryBefore.body.find(
      (i: { productId: string }) => i.productId === product.id,
    );
    expect(before).toBeDefined();

    const quantity = 2;
    const lineSubtotal = Number(product.sellPrice) * quantity;
    const total = lineSubtotal + (lineSubtotal * Number(product.taxRate ?? 0)) / 100;

    const saleRes = await request(app.getHttpServer())
      .post("/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        storeId: STORE_ID,
        payments: [{ method: "CASH", amount: total }],
        lineItems: [{ productId: product.id, quantity }],
      })
      .expect(201);
    expect(saleRes.body.receiptNumber).toBeDefined();
    expect(saleRes.body.lineItems).toHaveLength(1);

    const inventoryAfter = await request(app.getHttpServer())
      .get(`/stores/${STORE_ID}/inventory`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const after = inventoryAfter.body.find(
      (i: { productId: string }) => i.productId === product.id,
    );
    expect(after.quantity).toBe(before.quantity - 2);
  });

  it("rejects a sale that would drive stock negative with 400", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);
    const token = loginRes.body.accessToken;

    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const product = productsRes.body[0];

    await request(app.getHttpServer())
      .post("/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        storeId: STORE_ID,
        payments: [{ method: "CASH", amount: 1 }],
        lineItems: [{ productId: product.id, quantity: 999999 }],
      })
      .expect(400);
  });
});
