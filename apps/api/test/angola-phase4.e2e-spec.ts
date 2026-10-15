import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { unzip } from "../src/common/xlsx";
import { localDateTime } from "../src/fiscal/fiscal-format";
import { saftSchemaErrors } from "../src/fiscal/saft/testing/validate-saft";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 4: sales on credit are Facturas (FT) within
 * the customer's credit limit; payments are receipts (RC) set against the
 * oldest invoices; returns lower the debt before giving money back;
 * purchases carry the supplier's document and IVA, and what's paid to
 * suppliers. Everything ends up in the SAF-T file and the accountant's
 * workbook.
 */
describe("Angola phase 4: credit and payables (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase4Pass123!";
  const YEAR = localDateTime(new Date(), "Africa/Luanda").year;
  const TODAY = localDateTime(new Date(), "Africa/Luanda").date;
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let shiftClientId: string;
  let productId: string;
  let stockedId: string;
  let customerId: string;
  let supplierId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sale = (extra: Record<string, unknown> = {}, token = ownerToken) =>
    http()
      .post("/sales")
      .set(auth(token))
      .send({ storeId, shiftClientId, clientId: randomUUID(), lineItems: [{ productId, quantity: 10 }], payments: [], creditAmount: 100, customerId, ...extra });
  const account = async () => (await http().get(`/customers/${customerId}/account`).set(auth(ownerToken)).expect(200)).body;
  const pay = (body: Record<string, unknown>, token = ownerToken) =>
    http().post("/customer-payments").set(auth(token)).send({ storeId, customerId, method: "CASH", shiftClientId, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Credito Lda", storeName: "Loja Viana", firstName: "Luzia", lastName: "Owner", email: `p4-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ legalName: "E2E Credito, Lda", taxId: "5417000444" }).expect(200);
    const email = `p4-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Caio", lastName: "Cashier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;

    const rates = (await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body as { id: string; key: string }[];
    const nor = rates.find((r) => r.key === "IVA-NOR-14")!.id;
    productId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P4-${RUN}`, name: "Cimento 50kg", costPrice: 5, sellPrice: 10, taxRateId: nor, trackStock: false }).expect(201)).body.id;
    stockedId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P4S-${RUN}`, name: "Varão 12mm", costPrice: 100, sellPrice: 150, taxRateId: nor }).expect(201)).body.id;
    supplierId = (await http().post("/suppliers").set(auth(ownerToken)).send({ name: "Siderurgia do Kwanza", taxId: "5401112223" }).expect(201)).body.id;
    shiftClientId = await ensureShift(app, ownerToken, storeId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("credit limit", () => {
    it("only owners and managers set it; a customer without one can't buy on credit", async () => {
      await http().post("/customers").set(auth(cashierToken)).send({ name: "Obras Kianda", creditLimit: 1000 }).expect(403);
      customerId = (await http().post("/customers").set(auth(cashierToken)).send({ name: "Obras Kianda", taxId: "5000999888" }).expect(201)).body.id;
      const refused = await sale().expect(400);
      expect(refused.body.message).toMatch(/no credit limit/);
      await http().patch(`/customers/${customerId}`).set(auth(cashierToken)).send({ creditLimit: 500 }).expect(403);
      await http().patch(`/customers/${customerId}`).set(auth(ownerToken)).send({ creditLimit: 500 }).expect(200);
    });

    it("Consumidor Final can't buy on credit, and a cashier needs SELL_ON_CREDIT or an approval", async () => {
      await sale({ customerId: undefined }).expect(400);
      const cashierShift = await ensureShift(app, cashierToken, storeId);
      const res = await sale({ shiftClientId: cashierShift }, cashierToken).expect(403);
      expect(res.body.message).toBe("Selling on credit needs a manager's approval");
    });
  });

  describe("sales on credit are Facturas", () => {
    let ft1: { id: string; documentNo: string };

    it("all on credit: an FT with no payment, and the balance goes up", async () => {
      const s = (await sale().expect(201)).body;
      expect(s.creditAmount).toBe("100");
      ft1 = s.fiscalDocuments[0];
      expect(ft1).toMatchObject({ documentType: "FT", documentNo: `FT WEB1-${YEAR}/1` });
      const doc = (await http().get(`/fiscal-documents/${ft1.id}`).set(auth(ownerToken)).expect(200)).body;
      expect(doc.payments).toBeNull();
      expect(await account()).toMatchObject({ creditLimit: "500.00", balance: "100.00", available: "400.00" });
    });

    it("part paid at the till: the paid part is a receipt against the sale's FT", async () => {
      const s = (await sale({ lineItems: [{ productId, quantity: 20 }], payments: [{ method: "CASH", amount: 50, tendered: 50 }], creditAmount: 150 }).expect(201)).body;
      const acc = await account();
      expect(acc.balance).toBe("250.00");
      const deposit = acc.payments.find((p: { saleId: string | null }) => p.saleId === s.id);
      expect(deposit).toMatchObject({ amount: "50.00", method: "CASH" });
      expect(deposit.document.documentNo).toBe(`RC WEB1-${YEAR}/1`);
      expect(deposit.allocations).toEqual([expect.objectContaining({ documentNo: s.fiscalDocuments[0].documentNo, amount: "50.00" })]);
    });

    it("over the limit is refused, saying how much is left", async () => {
      const res = await sale({ lineItems: [{ productId, quantity: 30 }], creditAmount: 300 }).expect(400);
      expect(res.body.message).toBe("That's more than this customer's credit allows (250.00 left)");
    });
  });

  describe("receipts", () => {
    it("cash needs the open shift of the person taking it; more than owed is refused", async () => {
      await pay({ amount: 10, shiftClientId: undefined }).expect(400);
      expect((await pay({ amount: 250.01 }).expect(400)).body.message).toBe("The payment is more than what is owed");
    });

    it("a payment goes to the oldest invoice first; a retry with the same clientId is the same receipt", async () => {
      const clientId = randomUUID();
      const p = (await pay({ amount: 120, clientId }).expect(201)).body;
      expect(p.document.documentNo).toBe(`RC WEB1-${YEAR}/2`);
      expect(p.allocations.map((a: { documentNo: string; amount: string }) => [a.documentNo, a.amount])).toEqual([
        [`FT WEB1-${YEAR}/1`, "100.00"],
        [`FT WEB1-${YEAR}/2`, "20.00"],
      ]);
      expect((await pay({ amount: 120, clientId }).expect(201)).body.id).toBe(p.id);
      expect((await account()).balance).toBe("130.00");
    });

    it("the shift counts the cash taken (not twice for a sale's deposit) and shows what went on credit", async () => {
      const shift = (await http().get(`/shifts/client/${shiftClientId}?storeId=${storeId}`).set(auth(ownerToken)).expect(200)).body;
      expect(shift.summary.receipts).toMatchObject({ count: 1, total: "120.00", byMethod: { CASH: "120.00" } });
      expect(shift.summary.onCredit).toBe("250.00");
      // Float 0 + the deposit (a sale payment) 50 + the receipt 120.
      expect(shift.summary.expectedCash).toBe("170.00");
    });

    it("annulling a receipt (VOID_SALE) re-opens what it paid; a cashier can't", async () => {
      const p = (await pay({ amount: 30, method: "BANK_TRANSFER", reference: "TRF-001" }).expect(201)).body;
      expect((await account()).balance).toBe("100.00");
      await http().post(`/customer-payments/${p.id}/annul`).set(auth(cashierToken)).send({ reason: "Transferência devolvida" }).expect(403);
      const annulled = (await http().post(`/customer-payments/${p.id}/annul`).set(auth(ownerToken)).send({ reason: "Transferência devolvida" }).expect(200)).body;
      expect(annulled.document.status).toBe("A");
      expect((await account()).balance).toBe("130.00");
    });

    it("the database refuses to change a receipt's allocation", async () => {
      await expect(prisma.customerPaymentAllocation.updateMany({ where: { payment: { businessId } }, data: { amount: 1 } })).rejects.toThrow(/cannot be changed/);
    });
  });

  describe("cancels and returns of sales on credit", () => {
    it("a sale whose invoice was paid later can't be annulled; one paid only at the till takes its receipt with it", async () => {
      const first = await prisma.sale.findFirstOrThrow({ where: { customerId, creditAmount: 100 } });
      const refused = await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: first.id, reason: "ANNUL_I" }).expect(400);
      expect(refused.body.message).toMatch(/Annul those receipts first/);

      const s = (await sale({ lineItems: [{ productId, quantity: 4 }], payments: [{ method: "CASH", amount: 10 }], creditAmount: 30 }).expect(201)).body;
      expect((await account()).balance).toBe("160.00");
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: s.id, reason: "ANNUL_N" }).expect(200);
      const deposit = await prisma.customerPayment.findFirstOrThrow({ where: { saleId: s.id }, include: { document: true } });
      expect(deposit.document.status).toBe("A");
      expect((await account()).balance).toBe("130.00");
    });

    it("a return on an unpaid invoice lowers the debt: no money back, no shift needed", async () => {
      const s = (await sale({ lineItems: [{ productId, quantity: 5 }], creditAmount: 50 }).expect(201)).body;
      expect((await account()).balance).toBe("180.00");
      const ret = (await http().post("/returns").set(auth(ownerToken)).send({ storeId, saleId: s.id, reason: "Sobrou", lineItems: [{ productId, quantity: 2 }] }).expect(201)).body;
      expect(ret).toMatchObject({ totalRefund: "20", accountCredit: "20" });
      const nc = (await http().get(`/fiscal-documents/${ret.fiscalDocument.id}`).set(auth(ownerToken)).expect(200)).body;
      expect(nc.payments).toEqual([]);
      expect((await account()).balance).toBe("160.00");
    });
  });

  describe("purchases and suppliers", () => {
    let purchaseId: string;

    it("a purchase with the supplier's FT, IVA 14% on the lines and IVA cativo 50%, half paid on arrival", async () => {
      const p = (
        await http()
          .post("/purchases")
          .set(auth(ownerToken))
          .send({
            storeId,
            supplierId,
            lineItems: [{ productId: stockedId, quantity: 10, unitCost: 100 }],
            supplierDocument: { type: "FT", number: "FT SK2026/881", date: TODAY, hash: "Ab3x" },
            taxLines: [{ taxRate: 14, base: 1000, typology: "INV" }],
            withholdingPercent: 50,
            payment: { amount: 500, method: "BANK_TRANSFER", reference: "TRF-77" },
          })
          .expect(201)
      ).body;
      purchaseId = p.id;
      // 1000 + 140 IVA; 70 withheld for the State; 500 paid of the 1070 owed.
      expect(p).toMatchObject({ subtotal: "1000", taxTotal: "140", total: "1140", withholdingAmount: "70", paidAmount: "500", paymentStatus: "PARTIAL", supplierDocNo: "FT SK2026/881" });
      expect(p.taxLines[0]).toMatchObject({ taxRate: "14", base: "1000", taxAmount: "140", deductibleAmount: "140", typology: "INV" });
      const list = (await http().get("/suppliers?withBalance=true").set(auth(ownerToken)).expect(200)).body;
      expect(list.find((s: { id: string }) => s.id === supplierId).balance).toBe("570.00");
    });

    it("paying the supplier: the rest settles the purchase; more is refused; cancelling re-opens it", async () => {
      await http().post("/supplier-payments").set(auth(ownerToken)).send({ supplierId, amount: 570.01, method: "CASH" }).expect(400);
      await http().post("/supplier-payments").set(auth(cashierToken)).send({ supplierId, amount: 570, method: "CASH" }).expect(403);
      const payment = (await http().post("/supplier-payments").set(auth(ownerToken)).send({ supplierId, amount: 570, method: "CHEQUE", reference: "CHQ 0042" }).expect(201)).body;
      expect(payment.allocations).toEqual([expect.objectContaining({ purchaseId, amount: "570.00" })]);
      expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })).paymentStatus).toBe("PAID");
      await http().post(`/supplier-payments/${payment.id}/cancel`).set(auth(ownerToken)).send({ reason: "Cheque sem cobertura" }).expect(200);
      const acc = (await http().get(`/suppliers/${supplierId}/account`).set(auth(ownerToken)).expect(200)).body;
      expect(acc.balance).toBe("570.00");
      expect(acc.purchases[0]).toMatchObject({ paymentStatus: "PARTIAL", paid: "500.00", open: "570.00" });
    });
  });

  describe("in the SAF-T file and the accountant's workbook", () => {
    it("receipts in Payments (without tax per invoice) and the supplier's document in PurchaseInvoices, valid against the XSD", async () => {
      const res = await http().get(`/fiscal-documents/saft/facturacao?startDate=${TODAY.slice(0, 8)}01&endDate=${TODAY}`).set(auth(ownerToken)).buffer(true).expect(200);
      const xml = res.text;
      expect(await saftSchemaErrors(xml)).toEqual([]);
      expect(xml).toContain("<InvoiceType>FT</InvoiceType>");
      expect(xml).toContain(`<PaymentRefNo>RC WEB1-${YEAR}/2</PaymentRefNo>`);
      // 100 settled on an FT of 100 with IVA 14% included (12.29, rounded up): 87.71 without tax.
      expect(xml).toMatch(new RegExp(`<OriginatingON>FT WEB1-${YEAR}/1</OriginatingON>[\\s\\S]*?<CreditAmount>87.71</CreditAmount>`));
      expect(xml).toContain("<InvoiceNo>FT SK2026/881</InvoiceNo>");
      expect(xml).toContain("<SupplierTaxID>5401112223</SupplierTaxID>");
      expect(xml).toContain("<WithholdingTaxAmount>70</WithholdingTaxAmount>");
    });

    it("the workbook: invoice payment status, receipts and supplier payments, the supplier annex", async () => {
      const res = await http()
        .get(`/fiscal-documents/accountant-export?startDate=${TODAY.slice(0, 8)}01&endDate=${TODAY}`)
        .set(auth(ownerToken))
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const files = unzip(res.body as Buffer);
      const vendas = files.get("xl/worksheets/sheet1.xml")!.toString();
      expect(vendas).toContain("Parcialmente pago");
      const money = files.get("xl/worksheets/sheet3.xml")!.toString();
      expect(money).toContain(`RC WEB1-${YEAR}/2`);
      expect(money).toContain("Pagamento");
      const annex = files.get("xl/worksheets/sheet4.xml")!.toString();
      expect(annex).toContain("FT SK2026/881");
      expect(annex).toContain("5401112223");
    });
  });
});
