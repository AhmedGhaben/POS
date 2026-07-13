import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Runs against the seeded dev database (apps/api/prisma/seed.ts). Covers
 * Phase 7: stock transfers between stores. Only one store is seeded, so
 * each test creates its own second store rather than mutating shared fixtures.
 */
describe("POS API Phase 7 (e2e)", () => {
  let app: INestApplication;
  const OWNER_EMAIL = "owner@demo-store.test";
  const OWNER_PASSWORD = "OwnerPass123!";
  const CASHIER_EMAIL = "cashier@demo-store.test";
  const CASHIER_PASSWORD = "CashierPass123!";
  const STORE_A = "seed-store-main";

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

  async function createSecondStore(ownerAuthToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/stores")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({ name: `Branch ${Date.now()}` })
      .expect(201);
    return res.body.id;
  }

  it("rejects a cashier creating a transfer with 403 (role guard)", async () => {
    const ownerAuthToken = await ownerToken();
    const storeB = await createSecondStore(ownerAuthToken);

    await request(app.getHttpServer())
      .post("/transfers")
      .set("Authorization", `Bearer ${await cashierToken()}`)
      .send({ fromStoreId: STORE_A, toStoreId: storeB, lineItems: [{ productId: "x", quantity: 1 }] })
      .expect(403);
  });

  it("rejects a transfer to a store outside the business", async () => {
    const ownerAuthToken = await ownerToken();

    await request(app.getHttpServer())
      .post("/transfers")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({
        fromStoreId: STORE_A,
        toStoreId: "not-a-real-store",
        lineItems: [{ productId: "x", quantity: 1 }],
      })
      .expect(403); // TransferStoreAccessGuard runs before the service and rejects first
  });

  it("rejects a transfer with the same source and destination", async () => {
    const ownerAuthToken = await ownerToken();

    await request(app.getHttpServer())
      .post("/transfers")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({ fromStoreId: STORE_A, toStoreId: STORE_A, lineItems: [{ productId: "x", quantity: 1 }] })
      .expect(400);
  });

  it("rejects a transfer that exceeds available stock at the source", async () => {
    const ownerAuthToken = await ownerToken();
    const storeB = await createSecondStore(ownerAuthToken);

    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .expect(200);
    const product = productsRes.body[0];

    await request(app.getHttpServer())
      .post("/transfers")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({
        fromStoreId: STORE_A,
        toStoreId: storeB,
        lineItems: [{ productId: product.id, quantity: 999999 }],
      })
      .expect(400);
  });

  it("moves stock from one store to another and records the transfer", async () => {
    const ownerAuthToken = await ownerToken();
    const storeB = await createSecondStore(ownerAuthToken);

    const productsRes = await request(app.getHttpServer())
      .get("/products")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .expect(200);
    const product = productsRes.body[0];

    const beforeA = (
      await request(app.getHttpServer())
        .get(`/stores/${STORE_A}/inventory`)
        .set("Authorization", `Bearer ${ownerAuthToken}`)
        .expect(200)
    ).body.find((i: { productId: string }) => i.productId === product.id).quantity;

    const transferRes = await request(app.getHttpServer())
      .post("/transfers")
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .send({
        fromStoreId: STORE_A,
        toStoreId: storeB,
        note: "e2e test transfer",
        lineItems: [{ productId: product.id, quantity: 3 }],
      })
      .expect(201);
    expect(transferRes.body.fromStore.id).toBe(STORE_A);
    expect(transferRes.body.toStore.id).toBe(storeB);
    expect(transferRes.body.lineItems).toHaveLength(1);

    const afterA = (
      await request(app.getHttpServer())
        .get(`/stores/${STORE_A}/inventory`)
        .set("Authorization", `Bearer ${ownerAuthToken}`)
        .expect(200)
    ).body.find((i: { productId: string }) => i.productId === product.id).quantity;
    expect(afterA).toBe(beforeA - 3);

    const afterB = (
      await request(app.getHttpServer())
        .get(`/stores/${storeB}/inventory`)
        .set("Authorization", `Bearer ${ownerAuthToken}`)
        .expect(200)
    ).body.find((i: { productId: string }) => i.productId === product.id).quantity;
    expect(afterB).toBe(3);

    const historyRes = await request(app.getHttpServer())
      .get(`/transfers/store/${STORE_A}`)
      .set("Authorization", `Bearer ${ownerAuthToken}`)
      .expect(200);
    expect(historyRes.body.some((t: { id: string }) => t.id === transferRes.body.id)).toBe(true);
  });
});
