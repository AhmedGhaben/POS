import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { MailService } from "../src/common/mail/mail.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { saleTotal } from "./sale-total";
import { ensureShift } from "./shift-helper";

/**
 * Emailed receipts: the business says whether this server can send email,
 * a sale asking for one is saved straight away (PENDING), and the outcome
 * (SENT or FAILED with why) is recorded for the till. The dev server has no
 * RESEND_API_KEY, so sending fails here. Runs against the dev database with
 * its own business, deleted in afterAll.
 */
describe("Receipt emails (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  let businessId: string | undefined;
  let token: string;
  let storeId: string;
  let product: { id: string; sellPrice: string; taxRate: string };

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Email Shop", storeName: "E2E Email Store", firstName: "Eva", lastName: "Mail", email: `email-owner-${RUN}@e2e.test`, password: "EmailPass123!" })
      .expect(201);
    businessId = reg.body.user.businessId;
    token = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    product = (await http().post("/products").set(auth()).send({ sku: "MAIL-1", name: "Mailed thing", costPrice: 1, sellPrice: 10, trackStock: false }).expect(201)).body;
  });

  afterAll(async () => {
    if (businessId) {
      await deleteBusiness(prisma, businessId);
    }
    await app.close();
  });

  it("tells the till whether email is set up", async () => {
    const configured = app.get(MailService).configured;
    expect((await http().get("/businesses/me").set(auth()).expect(200)).body.emailEnabled).toBe(configured);
  });

  it("saves the sale at once as PENDING, then records the outcome", async () => {
    const sale = (
      await http()
        .post("/sales")
        .set(auth())
        .send({
          storeId,
          shiftClientId: await ensureShift(app, token, storeId),
          clientId: randomUUID(),
          receiptEmail: "cliente@example.com",
          lineItems: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: await saleTotal(app, storeId, product, 1) }],
        })
        .expect(201)
    ).body;
    expect(sale.receiptEmailStatus).toBe("PENDING");

    let status = { status: "PENDING", error: null as string | null };
    for (let i = 0; i < 50 && status.status === "PENDING"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await http().get(`/sales/${sale.id}/receipt-email`).set(auth()).expect(200)).body;
    }
    if (app.get(MailService).configured) {
      expect(["SENT", "FAILED"]).toContain(status.status);
    } else {
      expect(status).toEqual({ status: "FAILED", error: "Email isn't set up on this server" });
    }
  });

  it("a sale without an email has no status", async () => {
    const sale = (
      await http()
        .post("/sales")
        .set(auth())
        .send({
          storeId,
          shiftClientId: await ensureShift(app, token, storeId),
          clientId: randomUUID(),
          lineItems: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: await saleTotal(app, storeId, product, 1) }],
        })
        .expect(201)
    ).body;
    expect(sale.receiptEmailStatus).toBeNull();
    await http().get(`/sales/does-not-exist/receipt-email`).set(auth()).expect(404);
  });
});
