import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). Covers
 * Phase 6: fine-grained permissions — cost-price redaction, default-deny
 * for returns, and Owner-managed per-user overrides.
 */
describe("POS API Phase 6 (e2e)", () => {
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

  async function cashierUserId(ownerAuthToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .expect(200);
    const cashier = res.body.find((u: { email: string }) => u.email === CASHIER_EMAIL);
    expect(cashier).toBeDefined();
    return cashier.id;
  }

  it("hides costPrice from a cashier but shows it to the owner", async () => {
    const ownerRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${await ownerToken()}`)
      .expect(200);
    expect(ownerRes.body[0].costPrice).toBeDefined();

    const cashierRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${await cashierToken()}`)
      .expect(200);
    expect(cashierRes.body[0].costPrice).toBeUndefined();
  });

  it("rejects a cashier processing a return by default (no override)", async () => {
    const token = await cashierToken();
    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const product = productsRes.body[0];

    await request(app.getHttpServer())
      .post("/returns")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId: STORE_ID, saleId: "does-not-matter", lineItems: [{ productId: product.id, quantity: 1 }] })
      .expect(403);
  });

  it("rejects a non-owner managing permissions", async () => {
    const ownerAuthToken = await ownerToken();
    const targetUserId = await cashierUserId(ownerAuthToken);

    await request(app.getHttpServer())
      .get(`/users/${targetUserId}/permissions`)
      .set("Authorization", `Bearer ${await cashierToken()}`)
      .expect(403);
  });

  it("an owner-granted override lets a cashier process returns, and can be reset", async () => {
    const ownerAuthToken = await ownerToken();
    const targetUserId = await cashierUserId(ownerAuthToken);

    // Grant the override.
    const grantRes = await request(app.getHttpServer())
      .patch(`/users/${targetUserId}/permissions`)
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({ permission: "PROCESS_RETURN", granted: true })
      .expect(200);
    expect(grantRes.body.PROCESS_RETURN).toBe(true);

    // The cashier's own token still carries the old JWT claims but permission
    // checks hit the DB per-request, so the override takes effect immediately.
    const cashierAuthToken = await cashierToken();
    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${cashierAuthToken}`)
      .expect(200);
    const product = productsRes.body[0];
    // Only costPrice is redacted for a cashier — sellPrice/taxRate are still present.
    const lineSubtotal = Number(product.sellPrice);
    const total = lineSubtotal + (lineSubtotal * Number(product.taxRate ?? 0)) / 100;

    const saleRes = await request(app.getHttpServer())
      .post("/sales")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({
        storeId: STORE_ID,
        payments: [{ method: "CASH", amount: total }],
        lineItems: [{ productId: product.id, quantity: 1 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/returns")
      .set("Authorization", `Bearer ${cashierAuthToken}`)
      .send({
        storeId: STORE_ID,
        saleId: saleRes.body.id,
        lineItems: [{ productId: product.id, quantity: 1 }],
      })
      .expect(201);

    // Reset the override so the seed account's permissions stay at their default.
    const resetRes = await request(app.getHttpServer())
      .patch(`/users/${targetUserId}/permissions`)
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({ permission: "PROCESS_RETURN", granted: null })
      .expect(200);
    expect(resetRes.body.PROCESS_RETURN).toBe(false);
  });
});
