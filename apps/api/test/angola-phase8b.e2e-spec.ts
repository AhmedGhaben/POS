import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { unzip } from "../src/common/xlsx";
import { saftSchemaErrors } from "../src/fiscal/saft/testing/validate-saft";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 8b: the SAF-T (AO) Facturação file (valid
 * against the official XSD), the inventory file and the accountant export.
 * Periods are calendar dates in Luanda's time (UTC+1): a sale at 00:30 on
 * the 1st there is still the previous day in UTC, and belongs to the new month.
 */
describe("Angola phase 8b: SAF-T and accountant exports (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase8bPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let shiftClientId: string;
  let productId: string;
  let exemptId: string;
  let stockedId: string;
  let terminalId: string;
  let supplierId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => done(null, Buffer.concat(chunks)));
  };
  const download = (path: string, token = ownerToken) => http().get(path).set(auth(token)).buffer(true).parse(binary);
  const saft = async (query: string) => {
    const res = await download(`/fiscal-documents/saft/facturacao?${query}`).expect(200);
    return { xml: (res.body as Buffer).toString("utf8"), res };
  };
  const errorOf = (res: request.Response) => JSON.parse((res.body as Buffer).toString("utf8")).message as string;
  const invoiceNos = (xml: string) => [...xml.matchAll(/<InvoiceNo>([^<]+)<\/InvoiceNo>/g)].map((m) => m[1]);
  /** A sale rung up offline on the till at that moment (the server numbers it). */
  const saleAt = async (iso: string) =>
    (
      await http()
        .post("/sales")
        .set(auth(ownerToken))
        .send({
          storeId,
          terminalId,
          clientId: randomUUID(),
          lineItems: [{ productId, quantity: 1 }],
          payments: [{ method: "CASH", amount: 10 }],
          offline: { createdAt: iso },
        })
        .expect(201)
    ).body.fiscalDocuments[0] as { documentNo: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E SAF-T Lda", storeName: "Loja Maianga", firstName: "Ana", lastName: "Owner", email: `p8b-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    const email = `p8b-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Caio", lastName: "Cashier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;

    const rates = (await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body as { id: string; key: string }[];
    const nor = rates.find((r) => r.key === "IVA-NOR-14")!.id;
    productId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P8B-${RUN}`, name: "Sumo de múcua", costPrice: 5, sellPrice: 10, taxRateId: nor, trackStock: false }).expect(201)).body.id;
    exemptId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P8BE-${RUN}`, name: "Fuba de bombó", costPrice: 2, sellPrice: 5, exemptionCode: "M10", trackStock: false }).expect(201)).body.id;
    stockedId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P8BS-${RUN}`, barcode: `56${RUN}`.slice(0, 13), name: "Arroz 5kg", costPrice: 5, sellPrice: 9, taxRateId: nor }).expect(201)).body.id;
    terminalId = (await http().post("/terminals").set(auth(ownerToken)).send({ storeId, name: "Caixa 1" }).expect(201)).body.id;
    supplierId = (await http().post("/suppliers").set(auth(ownerToken)).send({ name: "Grossista do Kikolo", taxId: "5401234567" }).expect(201)).body.id;
    shiftClientId = await ensureShift(app, ownerToken, storeId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  it("needs the company's NIF first", async () => {
    const res = await download("/fiscal-documents/saft/facturacao?startDate=2026-10-01&endDate=2026-10-31").expect(400);
    expect(errorOf(res)).toMatch(/NIF/);
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ legalName: "E2E SAF-T, Lda", taxId: "5417000999", address: "Rua Rainha Ginga 10", city: "Luanda" }).expect(200);
  });

  describe("month end, in Luanda's time", () => {
    let sep30: string;
    let oct1: string;

    beforeAll(async () => {
      sep30 = (await saleAt("2026-09-30T22:30:00Z")).documentNo; // 23:30 on 30 Sep in Luanda
      oct1 = (await saleAt("2026-09-30T23:30:00Z")).documentNo; // 00:30 on 1 Oct in Luanda, still 30 Sep in UTC
    });

    it("2026-10-01 to 2026-10-31: EndDate 2026-10-31, October's documents only", async () => {
      const { xml, res } = await saft("startDate=2026-10-01&endDate=2026-10-31");
      expect(res.headers["content-type"]).toMatch(/application\/xml/);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="SAFT-AO_5417000999_2026-10-01_2026-10-31.xml"');
      expect(xml).toContain("<StartDate>2026-10-01</StartDate>");
      expect(xml).toContain("<EndDate>2026-10-31</EndDate>");
      expect(xml).toContain("<FiscalYear>2026</FiscalYear>");
      expect(invoiceNos(xml)).toContain(oct1);
      expect(invoiceNos(xml)).not.toContain(sep30);
      expect(xml).toMatch(new RegExp(`<InvoiceNo>${oct1}</InvoiceNo>[\\s\\S]*?<InvoiceDate>2026-10-01</InvoiceDate>[\\s\\S]*?<SystemEntryDate>2026-10-01T00:30:00</SystemEntryDate>`));
      expect(await saftSchemaErrors(xml)).toEqual([]);
    });

    it("September ends at midnight Luanda time: 23:30 on the 30th is in, 00:30 on the 1st is not", async () => {
      const { xml } = await saft("startDate=2026-09-01&endDate=2026-09-30");
      expect(xml).toContain("<EndDate>2026-09-30</EndDate>");
      expect(invoiceNos(xml)).toEqual([sep30]);
      expect(await saftSchemaErrors(xml)).toEqual([]);
    });
  });

  describe("year end, in Luanda's time", () => {
    let dec31: string;
    let jan1: string;

    beforeAll(async () => {
      dec31 = (await saleAt("2025-12-31T22:30:00Z")).documentNo; // 23:30 on New Year's Eve in Luanda
      jan1 = (await saleAt("2025-12-31T23:30:00Z")).documentNo; // 00:30 on New Year's Day there
    });

    it("2025-01-01 to 2025-12-31: fiscal year 2025, EndDate 2025-12-31, New Year's Day excluded", async () => {
      expect(dec31).toMatch(/-2025\/\d+$/);
      expect(jan1).toMatch(/-2026\/\d+$/); // numbered in the new year's series
      const { xml } = await saft("startDate=2025-01-01&endDate=2025-12-31");
      expect(xml).toContain("<FiscalYear>2025</FiscalYear>");
      expect(xml).toContain("<EndDate>2025-12-31</EndDate>");
      expect(invoiceNos(xml)).toEqual([dec31]);
      expect(await saftSchemaErrors(xml)).toEqual([]);
    });

    it("January 2026 starts with the 00:30 sale", async () => {
      const { xml } = await saft("startDate=2026-01-01&endDate=2026-01-31");
      expect(xml).toContain("<FiscalYear>2026</FiscalYear>");
      expect(invoiceNos(xml)).toEqual([jan1]);
    });

    it("a period across two years, or a date that isn't a plain calendar date, is a 400", async () => {
      expect(errorOf(await download("/fiscal-documents/saft/facturacao?startDate=2025-12-01&endDate=2026-01-31").expect(400))).toMatch(/one fiscal year/);
      expect(errorOf(await download("/fiscal-documents/saft/facturacao?startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-31").expect(400))).toMatch(/YYYY-MM-DD/);
      expect(errorOf(await download("/fiscal-documents/saft/facturacao?startDate=2026-02-30&endDate=2026-03-31").expect(400))).toMatch(/YYYY-MM-DD/);
    });
  });

  describe("every kind of document this month", () => {
    it("FR with an exempt line, an annulled FR, a credit note and a proforma: valid against the XSD", async () => {
      const mixed = (
        await http()
          .post("/sales")
          .set(auth(ownerToken))
          .send({ storeId, shiftClientId, clientId: randomUUID(), lineItems: [{ productId, quantity: 3 }, { productId: exemptId, quantity: 2 }], payments: [{ method: "CARD", amount: 40 }] })
          .expect(201)
      ).body;
      const annulled = (await http().post("/sales").set(auth(ownerToken)).send({ storeId, shiftClientId, clientId: randomUUID(), lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] }).expect(201)).body;
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: annulled.id, reason: "ANNUL_N" }).expect(200);
      await http().post("/returns").set(auth(ownerToken)).send({ storeId, saleId: mixed.id, shiftClientId, reason: "Embalagem danificada", lineItems: [{ productId, quantity: 1 }] }).expect(201);
      await http().post("/fiscal-documents/proformas").set(auth(ownerToken)).send({ storeId, lineItems: [{ productId, quantity: 5 }] }).expect(201);

      const today = (await prisma.fiscalDocument.findFirstOrThrow({ where: { businessId, saleId: mixed.id } })).invoiceDate.toISOString().slice(0, 10);
      const { xml } = await saft(`startDate=${today.slice(0, 8)}01&endDate=${today}`);
      expect(await saftSchemaErrors(xml)).toEqual([]);
      expect(xml).toContain("<InvoiceType>NC</InvoiceType>");
      expect(xml).toContain("<InvoiceStatus>A</InvoiceStatus>");
      // N's wording (58 characters) in the 50 SAF-T allows.
      expect(xml).toContain("<Reason>Anulada por não envio do documento ao adquirente</Reason>");
      expect(xml).toContain("<WorkType>PF</WorkType>");
      expect(xml).toContain("<TaxExemptionCode>M10</TaxExemptionCode>");
      expect(xml).toContain("<PaymentMechanism>CD</PaymentMechanism>");
      expect(xml).toMatch(/<CustomerTaxID>999999999<\/CustomerTaxID>/);
      // Who generated which file, and when: the five files made so far (refused requests aren't files).
      const logged = await prisma.auditLog.findMany({ where: { businessId, action: "SAFT_FACTURACAO" }, orderBy: { createdAt: "asc" } });
      expect(logged).toHaveLength(5);
      expect(logged[0]).toMatchObject({ userId: expect.any(String), metadata: { startDate: "2026-10-01", endDate: "2026-10-31", storeId: null } });
    });

    it("ids longer than SAF-T's 30 characters (older Consumidor Final rows) are exported short and still match", async () => {
      const longId = `fc_${"0123456789abcdef".repeat(2)}`; // 35 characters, like the phase 3 migration's
      await prisma.customer.create({ data: { id: longId, businessId: businessId!, name: "Cliente antigo", taxId: "5000777777" } });
      const s = (await http().post("/sales").set(auth(ownerToken)).send({ storeId, shiftClientId, clientId: randomUUID(), customerId: longId, lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] }).expect(201)).body;
      const day = (await prisma.fiscalDocument.findFirstOrThrow({ where: { saleId: s.id } })).invoiceDate.toISOString().slice(0, 10);
      const { xml } = await saft(`startDate=${day}&endDate=${day}`);
      expect(await saftSchemaErrors(xml)).toEqual([]);
      expect(xml).not.toContain(longId);
      expect(xml).toContain("<CustomerID>CONSUMIDOR-FINAL</CustomerID>");
    });

    it("cashiers can't export", async () => {
      await download("/fiscal-documents/saft/facturacao", cashierToken).expect(403);
      await download("/fiscal-documents/saft/inventario", cashierToken).expect(403);
      await download("/fiscal-documents/accountant-export", cashierToken).expect(403);
    });
  });

  describe("SAF-T de Inventários (draft)", () => {
    it("stock at the end of 31 December in Luanda: a movement at 00:30 on 1 January there isn't counted", async () => {
      await prisma.stockMovement.createMany({
        data: [
          { storeId, productId: stockedId, type: "PURCHASE", quantity: 10, unitCost: 5, balance: 10, averageCost: 5, occurredAt: new Date("2025-12-31T22:30:00Z") },
          { storeId, productId: stockedId, type: "PURCHASE", quantity: 5, unitCost: 8, balance: 15, averageCost: 6, occurredAt: new Date("2025-12-31T23:30:00Z") },
        ],
      });
      const yearEnd = (await download("/fiscal-documents/saft/inventario?date=2025-12-31").expect(200)).body.toString("utf8");
      expect(yearEnd.split("\r\n")[1]).toBe(`M;P8BS-${RUN};Arroz 5kg;${`56${RUN}`.slice(0, 13)};10;un;50.00;CMP`);
      const newYear = (await download("/fiscal-documents/saft/inventario?date=2026-01-01").expect(200)).body.toString("utf8");
      expect(newYear.split("\r\n")[1]).toContain(";15;un;90.00;CMP");
      const before = (await download("/fiscal-documents/saft/inventario?date=2024-12-31").expect(200)).body.toString("utf8");
      expect(before.trim().split("\r\n")).toHaveLength(1); // the "no stock" file: header only
    });
  });

  describe("accountant export", () => {
    it("a workbook of the month: sales, purchases and money, with month-end purchases on the right side", async () => {
      const purchase = async (iso: string) => {
        const p = (await http().post("/purchases").set(auth(ownerToken)).send({ storeId, supplierId, lineItems: [{ productId: stockedId, quantity: 1, unitCost: 4 }] }).expect(201)).body;
        await prisma.purchase.update({ where: { id: p.id }, data: { createdAt: new Date(iso) } });
        return p.purchaseNumber as string;
      };
      const inSep = await purchase("2026-09-30T22:30:00Z");
      const inOct = await purchase("2026-09-30T23:30:00Z");

      const res = await download("/fiscal-documents/accountant-export?startDate=2026-10-01&endDate=2026-10-31").expect(200);
      expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
      const files = unzip(res.body as Buffer);
      expect(files.get("xl/workbook.xml")!.toString()).toMatch(/Vendas[\s\S]*Compras[\s\S]*Recebimentos e pagamentos/);
      const compras = files.get("xl/worksheets/sheet2.xml")!.toString();
      expect(compras).toContain(inOct);
      expect(compras).not.toContain(inSep);
      expect(compras).toContain("5401234567");
      const vendas = files.get("xl/worksheets/sheet1.xml")!.toString();
      expect(vendas).toContain("Base 14%");
      expect(vendas).toContain("Nota de Crédito");
      expect(vendas).toContain("Anulado");
      expect(files.get("xl/worksheets/sheet3.xml")!.toString()).toContain("Reembolso");
    });
  });
});
