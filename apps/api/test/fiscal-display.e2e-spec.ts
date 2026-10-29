import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { deleteBusiness } from "./cleanup";

describe("Fiscal number display data (isolated e2e)", () => {
  let app: INestApplication, prisma: PrismaService;
  let businessId: string, storeId: string, token: string, sale: { id: string; receiptNumber: string; fiscalDocuments: { id: string; documentNo: string }[] };
  let invoiceId: string, shiftId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["localhost", "127.0.0.1"].includes(database.hostname) || (!/test|recovery|ci/.test(database.pathname) && process.env.CI !== "true")) throw new Error("Use an isolated local test database");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter()); await app.init(); prisma = app.get(PrismaService);
    const reg = (await http().post("/auth/register").send({ businessName: "Fiscal display test", storeName: "Fiscal display", firstName: "Test", lastName: "Owner", email: `display-${Date.now()}@e2e.test`, password: "DisplayTest123!" }).expect(201)).body;
    token = reg.accessToken; businessId = reg.user.businessId; storeId = reg.stores[0].id;
    const product = (await http().post("/products").set(auth()).send({ sku: "DISPLAY", name: "Display tea", costPrice: 1, sellPrice: 2, exemptionCode: "M10" }).expect(201)).body;
    await http().put(`/stores/${storeId}/inventory/${product.id}`).set(auth()).send({ quantity: 5 }).expect(200);
    const shiftClientId = randomUUID();
    shiftId = (await http().post("/shifts/open").set(auth()).send({ storeId, clientId: shiftClientId, openingFloat: 0 }).expect(200)).body.id;
    sale = (await http().post("/sales").set(auth()).send({ storeId, shiftClientId, lineItems: [{ productId: product.id, quantity: 1 }], payments: [{ method: "CASH", amount: 2 }] }).expect(201)).body;
    // Historical mixed-data fixture only: issuing a new legacy INV in Angola remains forbidden.
    invoiceId = (await prisma.invoice.create({ data: { businessId, saleId: sale.id, year: 2026, sequence: 1, number: "INV-2026-0001", seller: { name: "Historical seller", currency: "AOA" }, buyerName: "Historical buyer" } })).id;
  }, 30_000);
  afterAll(async () => { if (businessId) await deleteBusiness(prisma, businessId); await app?.close(); });
  it("supplies fiscal references on invoice lists/details and preserves the stored document", async () => {
    const before = await prisma.fiscalDocument.findUniqueOrThrow({ where: { id: sale.fiscalDocuments[0].id } });
    const list = await http().get("/invoices").set(auth()).expect(200);
    expect(list.body.items[0]).toMatchObject({ number: "INV-2026-0001", sale: { receiptNumber: sale.receiptNumber, fiscalDocuments: [{ documentNo: before.documentNo }] } });
    const detail = await http().get(`/invoices/${invoiceId}`).set(auth()).expect(200);
    expect(detail.body.sale.fiscalDocuments[0].documentNo).toBe(before.documentNo);
    expect(await prisma.fiscalDocument.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });
  it("returns fiscal numbers in shift/all-sales data while internal references remain searchable", async () => {
    const documentNo = sale.fiscalDocuments[0].documentNo;
    const shift = await http().get(`/shifts/${shiftId}`).set(auth()).expect(200);
    expect(shift.body.summary.sales[0]).toMatchObject({ receiptNumber: sale.receiptNumber, documentNo });
    for (const search of [documentNo, sale.receiptNumber]) {
      const history = await http().get(`/sales?storeId=${storeId}&search=${encodeURIComponent(search)}`).set(auth()).expect(200);
      expect(history.body.total).toBe(1);
      expect(history.body.items[0].fiscalDocuments[0].documentNo).toBe(documentNo);
    }
  });
});
