import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { FiscalService } from "../src/fiscal/fiscal.service";
import { localDateTime } from "../src/fiscal/fiscal-format";
import { hashMessage, RsaSha1Signer, TEST_KEY_FILE } from "../src/fiscal/signature";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 8: every sale is a Factura-Recibo numbered
 * gap-free in its series (the till's own, or the store's), signed over the
 * previous document's hash; a return is a credit note pointing at it;
 * cancelling annuls it; documents can't be changed; proformas.
 */
describe("Angola phase 8: fiscal documents (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase8Pass123!";
  const YEAR = localDateTime(new Date(), "Africa/Luanda").year;
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let shiftClientId: string;
  let productId: string;
  let exemptId: string;
  let terminal: { id: string; code: string };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sale = (extra: Record<string, unknown> = {}, token = ownerToken) =>
    http()
      .post("/sales")
      .set(auth(token))
      .send({
        storeId,
        shiftClientId,
        clientId: randomUUID(),
        lineItems: [{ productId, quantity: 2 }],
        payments: [{ method: "CASH", amount: 20 }],
        ...extra,
      });
  const doc = async (id: string) => (await http().get(`/fiscal-documents/${id}`).set(auth(ownerToken)).expect(200)).body;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Facturas Lda", storeName: "Loja Talatona", firstName: "Rita", lastName: "Owner", email: `p8-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ legalName: "E2E Facturas, Lda", taxId: "5417000123", currency: "AOA" }).expect(200);
    const email = `p8-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Caio", lastName: "Cashier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;

    const rates = (await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body as { id: string; key: string }[];
    const nor = rates.find((r) => r.key === "IVA-NOR-14")!.id;
    productId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P8-${RUN}`, name: "Óleo de palma 1L", costPrice: 5, sellPrice: 10, taxRateId: nor, trackStock: false }).expect(201)).body.id;
    exemptId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P8E-${RUN}`, name: "Fuba", costPrice: 2, sellPrice: 5, exemptionCode: "M10", trackStock: false }).expect(201)).body.id;
    terminal = (await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Caixa 1" }).expect(201)).body;
    shiftClientId = await ensureShift(app, ownerToken, storeId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("Factura-Recibo for every sale", () => {
    let first: { id: string; documentNo: string };

    it("a browser sale is FR 1 of the store's series, with the buyer, seller, lines and taxes frozen", async () => {
      const s = (await sale().expect(201)).body;
      expect(s.fiscalDocuments).toHaveLength(1);
      first = s.fiscalDocuments[0];
      expect(first).toMatchObject({ documentType: "FR", documentNo: `FR WEB1-${YEAR}/1`, status: "N", hashControl: "0" });
      expect(s.fiscalDocuments[0].hashExcerpt).toHaveLength(4);

      const d = await doc(first.id);
      expect(d).toMatchObject({ buyerName: "Consumidor Final", buyerTaxId: "999999999", currency: "AOA", grossTotal: "20", taxPayable: "2.46", netTotal: "17.54", pricesIncludeTax: true });
      expect(d.seller).toMatchObject({ legalName: "E2E Facturas, Lda", taxId: "5417000123", ivaRegime: "GERAL", certificate: null });
      expect(d.payments).toEqual([{ method: "CASH", mechanism: "NU", amount: "20.00" }]);
      expect(d.lines).toHaveLength(1);
      expect(d.lines[0]).toMatchObject({ lineNumber: 1, productDescription: "Óleo de palma 1L", quantity: "2", unitPrice: "8.77", netAmount: "17.54", taxAmount: "2.46" });
      expect(d.lines[0].taxes[0]).toMatchObject({ taxType: "IVA", taxCountryRegion: "AO", taxCode: "NOR", percentage: "14" });
    });

    it("the next sale is FR 2, signed over FR 1's hash; the chain verifies with the public key", async () => {
      const s = (await sale().expect(201)).body;
      expect(s.fiscalDocuments[0].documentNo).toBe(`FR WEB1-${YEAR}/2`);
      const [d1, d2] = await Promise.all([doc(first.id), doc(s.fiscalDocuments[0].id)]);
      const local = localDateTime(new Date(d2.systemEntryDate), "Africa/Luanda");
      const message = hashMessage({ invoiceDate: local.date, systemEntryDate: local.dateTime, documentNo: d2.documentNo, grossTotal: "20.00", previousHash: d1.hash });
      expect(new RsaSha1Signer(readFileSync(TEST_KEY_FILE, "utf8")).verify(message, d2.hash)).toBe(true);
      const series = await prisma.documentSeries.findFirstOrThrow({ where: { businessId, code: `WEB1-${YEAR}`, documentType: "FR" } });
      expect(await app.get(FiscalService).verifyChain(series.id)).toEqual({ valid: true, checked: 2 });
    });

    it("an exempt line carries its reason; a customer with a NIF is the buyer, frozen as sold", async () => {
      const customer = (await http().post("/customers").set(auth(ownerToken)).send({ name: "Kianda Comércio", taxId: "5000123456", city: "Luanda" }).expect(201)).body;
      const s = (await sale({ customerId: customer.id, lineItems: [{ productId: exemptId, quantity: 1 }], payments: [{ method: "CARD", amount: 5 }] }).expect(201)).body;
      await prisma.customer.update({ where: { id: customer.id }, data: { name: "Renamed later" } });
      const d = await doc(s.fiscalDocuments[0].id);
      expect(d).toMatchObject({ buyerName: "Kianda Comércio", buyerTaxId: "5000123456" });
      expect(d.payments[0].mechanism).toBe("CD");
      expect(d.lines[0].taxes[0]).toMatchObject({ taxCode: "ISE", exemptionCode: "M10", percentage: "0", amount: "0" });
      expect(d.lines[0].taxes[0].exemptionReason).toMatch(/^Isento/);
    });
  });

  describe("a till numbers its own series", () => {
    const series = () => `${terminal.code.replace(/-/g, "")}-${YEAR}`;
    const tillSale = (number: number) => sale({ terminalId: terminal.id, fiscal: { series: series(), number } });

    it("numbers 1 and 2 in order; a gap waits (409) and a used number is refused (422)", async () => {
      expect((await tillSale(1).expect(201)).body.fiscalDocuments[0].documentNo).toBe(`FR ${series()}/1`);
      const ahead = await tillSale(3).expect(409);
      expect(ahead.body.code).toBe("FISCAL_NUMBER_AHEAD");
      const used = await tillSale(1).expect(422);
      expect(used.body.code).toBe("FISCAL_NUMBER_USED");
      expect((await tillSale(2).expect(201)).body.fiscalDocuments[0].documentNo).toBe(`FR ${series()}/2`);
      await sale({ terminalId: terminal.id, fiscal: { series: `XYZ-${YEAR}`, number: 3 } }).expect(400);
      // Nothing was written for the refused ones: no sale, no stock, no number.
      expect(await prisma.fiscalDocument.count({ where: { terminalId: terminal.id } })).toBe(2);
    });

    it("an older till that doesn't number gets the next number from the server; the till reads where its series is", async () => {
      expect((await sale({ terminalId: terminal.id }).expect(201)).body.fiscalDocuments[0].documentNo).toBe(`FR ${series()}/3`);
      const res = (await http().get(`/fiscal-documents/series/till/${terminal.id}`).set(auth(cashierToken)).expect(200)).body;
      expect(res.series).toEqual([{ documentType: "FR", code: series(), year: YEAR, nextNumber: 4 }]);
      expect(res.prefix).toBe(series().split("-")[0]);
    });

    it("an offline upload keeps the till's number; a retry of the same sale is the same document", async () => {
      const clientId = randomUUID();
      const body = { clientId, terminalId: terminal.id, fiscal: { series: series(), number: 4 }, offline: { createdAt: new Date(Date.now() - 60_000).toISOString() } };
      const first = (await sale(body).expect(201)).body;
      const again = (await sale(body).expect(201)).body;
      expect(again.fiscalDocuments[0].id).toBe(first.fiscalDocuments[0].id);
      expect(first.fiscalDocuments[0].documentNo).toBe(`FR ${series()}/4`);
    });
  });

  describe("cancelling, returns and immutability", () => {
    it("cancelling a sale annuls its FR with the reason; the number stays used", async () => {
      const s = (await sale().expect(201)).body;
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: s.id, reason: "WRONG_ITEMS" }).expect(200);
      const d = await doc(s.fiscalDocuments[0].id);
      expect(d).toMatchObject({ status: "A", statusReasonCode: "WRONG_ITEMS", statusReason: "Erro na emissão: artigos errados" });
    });

    it("a return is a credit note pointing at the FR and its line, for what was refunded", async () => {
      const s = (await sale({ lineItems: [{ productId, quantity: 3 }], payments: [{ method: "CASH", amount: 30 }] }).expect(201)).body;
      const ret = (
        await http()
          .post("/returns")
          .set(auth(ownerToken))
          .send({ storeId, saleId: s.id, shiftClientId, reason: "Embalagem danificada", lineItems: [{ productId, quantity: 1 }] })
          .expect(201)
      ).body;
      expect(ret.fiscalDocument.documentNo).toBe(`NC WEB1-${YEAR}/1`);
      const nc = await doc(ret.fiscalDocument.id);
      expect(nc).toMatchObject({ documentType: "NC", grossTotal: "10", taxPayable: "1.23", reason: "Embalagem danificada" });
      expect(nc.referencedDocument.documentNo).toBe(s.fiscalDocuments[0].documentNo);
      expect(nc.lines[0]).toMatchObject({ referenceDocumentNo: s.fiscalDocuments[0].documentNo, referenceLineNumber: 1, quantity: "1", netAmount: "8.77" });
      expect(ret.totalRefund).toBe("10");
    });

    it("the database refuses to change or delete a document, its lines or its taxes", async () => {
      const d = await prisma.fiscalDocument.findFirstOrThrow({ where: { businessId, documentType: "FR", status: "N" } });
      await expect(prisma.fiscalDocument.update({ where: { id: d.id }, data: { grossTotal: 1 } })).rejects.toThrow(/cannot be changed/);
      await expect(prisma.fiscalDocument.update({ where: { id: d.id }, data: { status: "A", buyerName: "Outro" } })).rejects.toThrow(/only annulled/);
      await expect(prisma.fiscalDocument.delete({ where: { id: d.id } })).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.fiscalDocumentLine.updateMany({ where: { documentId: d.id }, data: { quantity: 9 } })).rejects.toThrow(/cannot be changed/);
      await expect(prisma.fiscalDocumentLineTax.deleteMany({ where: { line: { documentId: d.id } } })).rejects.toThrow(/cannot be changed/);
    });

    it("older invoices can't be issued any more where sales are fiscal documents", async () => {
      const s = (await sale().expect(201)).body;
      const res = await http().post(`/sales/${s.id}/invoice`).set(auth(ownerToken)).send({ buyerName: "Kianda" }).expect(400);
      expect(res.body.message).toBe("Every sale already has its Factura-Recibo; print that instead");
    });
  });

  describe("proformas and listing", () => {
    it("a proforma is numbered and signed; the sale that invoices it points at it and closes it", async () => {
      const pf = (await http().post("/fiscal-documents/proformas").set(auth(ownerToken)).send({ storeId, lineItems: [{ productId, quantity: 5 }] }).expect(201)).body;
      expect(pf).toMatchObject({ documentType: "PF", documentNo: `PF WEB1-${YEAR}/1`, grossTotal: "50", status: "N" });
      const s = (await sale({ proformaId: pf.id, lineItems: [{ productId, quantity: 5 }], payments: [{ method: "CASH", amount: 50 }] }).expect(201)).body;
      const fr = await doc(s.fiscalDocuments[0].id);
      expect(fr.referencedDocument).toMatchObject({ id: pf.id, documentType: "PF" });
      expect((await doc(pf.id)).status).toBe("F");
      await sale({ proformaId: pf.id }).expect(400);
    });

    it("owners list documents by type; cashiers can open one but not list them", async () => {
      const list = (await http().get("/fiscal-documents?type=NC").set(auth(ownerToken)).expect(200)).body;
      expect(list.total).toBe(1);
      expect(list.items[0].documentNo).toBe(`NC WEB1-${YEAR}/1`);
      await http().get("/fiscal-documents").set(auth(cashierToken)).expect(403);
      await http().get(`/fiscal-documents/${list.items[0].id}`).set(auth(cashierToken)).expect(200);
    });
  });
});
