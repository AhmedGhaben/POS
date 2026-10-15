import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 5: purchases and sales history with filters
 * (dates are the store's calendar days, Luanda), the print log behind
 * "2ª Via", and the store's print settings.
 */
describe("Angola phase 5: history, filters and printing (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase5Pass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let shiftClientId: string;
  let productId: string;
  let supplierA: string;
  let supplierB: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Historico Lda", storeName: "Loja Cazenga", firstName: "Nzinga", lastName: "Owner", email: `p5-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    const email = `p5-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Caio", lastName: "Cashier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    productId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P5-${RUN}`, name: "Água 1,5L", costPrice: 1, sellPrice: 2 }).expect(201)).body.id;
    supplierA = (await http().post("/suppliers").set(auth(ownerToken)).send({ name: "Águas do Bengo", taxId: "5401000001" }).expect(201)).body.id;
    supplierB = (await http().post("/suppliers").set(auth(ownerToken)).send({ name: "Distribuidora Huambo", taxId: "5401000002" }).expect(201)).body.id;
    shiftClientId = await ensureShift(app, ownerToken, storeId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("purchases: filters", () => {
    beforeAll(async () => {
      const buy = async (supplierId: string, docNo: string, at: string, paid: number) => {
        const p = (
          await http()
            .post("/purchases")
            .set(auth(ownerToken))
            .send({
              storeId,
              supplierId,
              lineItems: [{ productId, quantity: 10, unitCost: 1 }],
              supplierDocument: { type: "FT", number: docNo, date: at.slice(0, 10) },
              ...(paid ? { payment: { amount: paid, method: "CASH" } } : {}),
            })
            .expect(201)
        ).body;
        await prisma.purchase.update({ where: { id: p.id }, data: { createdAt: new Date(at) } });
      };
      await buy(supplierA, "FT A/1", "2026-09-30T22:30:00Z", 0); // 23:30 on 30 Sep in Luanda
      await buy(supplierA, "FT A/2", "2026-09-30T23:30:00Z", 10); // 00:30 on 1 Oct in Luanda
      await buy(supplierB, "FT B/1", "2026-10-05T10:00:00Z", 4);
    });

    const list = async (query: string) => (await http().get(`/purchases?storeId=${storeId}&${query}`).set(auth(ownerToken)).expect(200)).body as { items: { supplierDocNo: string }[]; total: number };

    it("by the store's calendar days: October starts at midnight in Luanda", async () => {
      const oct = await list("from=2026-10-01&to=2026-10-31");
      expect(oct.items.map((p) => p.supplierDocNo).sort()).toEqual(["FT A/2", "FT B/1"]);
      const sep = await list("from=2026-09-01&to=2026-09-30");
      expect(sep.items.map((p) => p.supplierDocNo)).toEqual(["FT A/1"]);
    });

    it("by supplier, payment status and search; paged", async () => {
      expect((await list(`supplierId=${supplierA}`)).total).toBe(2);
      expect((await list("paymentStatus=PARTIAL")).items.map((p) => p.supplierDocNo)).toEqual(["FT B/1"]);
      expect((await list("paymentStatus=UNPAID")).items.map((p) => p.supplierDocNo)).toEqual(["FT A/1"]);
      expect((await list("search=huambo")).items.map((p) => p.supplierDocNo)).toEqual(["FT B/1"]);
      const page = await list("take=1&skip=1");
      expect(page).toMatchObject({ total: 3 });
      expect(page.items).toHaveLength(1);
    });

    it("needs a store, a calendar date, and the back office", async () => {
      await http().get("/purchases").set(auth(ownerToken)).expect(400);
      await http().get(`/purchases?storeId=${storeId}&from=2026-10-01T00:00:00Z`).set(auth(ownerToken)).expect(400);
      await http().get(`/purchases?storeId=${storeId}`).set(auth(cashierToken)).expect(403);
    });

    it("one purchase with its supplier, IVA lines and what paid it", async () => {
      const id = (await prisma.purchase.findFirstOrThrow({ where: { supplierDocNo: "FT A/2" } })).id;
      const p = (await http().get(`/purchases/${id}`).set(auth(ownerToken)).expect(200)).body;
      expect(p).toMatchObject({ supplierDocNo: "FT A/2", paymentStatus: "PAID", supplier: { name: "Águas do Bengo" } });
      expect(p.allocations).toHaveLength(1);
    });
  });

  describe("sales history and the print log", () => {
    let documentId: string;

    it("lists the store's sales, filtered by status, search and day", async () => {
      const sell = () =>
        http()
          .post("/sales")
          .set(auth(ownerToken))
          .send({ storeId, shiftClientId, clientId: randomUUID(), lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 2 }] })
          .expect(201);
      const first = (await sell()).body;
      documentId = first.fiscalDocuments[0].id;
      const second = (await sell()).body;
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: second.id, reason: "ANNUL_N" }).expect(200);

      const all = (await http().get(`/sales?storeId=${storeId}`).set(auth(ownerToken)).expect(200)).body;
      expect(all.total).toBe(2);
      const voided = (await http().get(`/sales?storeId=${storeId}&status=VOIDED`).set(auth(ownerToken)).expect(200)).body;
      expect(voided.items.map((s: { id: string }) => s.id)).toEqual([second.id]);
      const byDoc = (await http().get(`/sales?storeId=${storeId}&search=${encodeURIComponent(first.fiscalDocuments[0].documentNo)}`).set(auth(ownerToken)).expect(200)).body;
      expect(byDoc.items.map((s: { id: string }) => s.id)).toEqual([first.id]);
      const longAgo = (await http().get(`/sales?storeId=${storeId}&from=2025-01-01&to=2025-01-31`).set(auth(ownerToken)).expect(200)).body;
      expect(longAgo.total).toBe(0);
      await http().get(`/sales?storeId=${storeId}`).set(auth(cashierToken)).expect(403);
    });

    it("the first print of a document is the original; every one after is a 2ª Via, and logged", async () => {
      expect((await http().get(`/fiscal-documents/${documentId}`).set(auth(ownerToken)).expect(200)).body.printCount).toBe(0);
      expect((await http().post(`/fiscal-documents/${documentId}/prints`).set(auth(cashierToken)).send({ kind: "RECEIPT" }).expect(201)).body).toEqual({ reprint: false, printCount: 1 });
      expect((await http().post(`/fiscal-documents/${documentId}/prints`).set(auth(ownerToken)).send({ kind: "A4", copies: 2 }).expect(201)).body).toEqual({ reprint: true, printCount: 2 });
      expect((await http().get(`/fiscal-documents/${documentId}`).set(auth(ownerToken)).expect(200)).body.printCount).toBe(2);
      const log = await prisma.documentPrint.findMany({ where: { documentId }, orderBy: { printedAt: "asc" } });
      expect(log.map((l) => [l.kind, l.copies, l.reprint])).toEqual([
        ["RECEIPT", 1, false],
        ["A4", 2, true],
      ]);
      await http().post(`/fiscal-documents/${documentId}/prints`).set(auth(ownerToken)).send({ kind: "PDF" }).expect(400);
    });
  });

  it("the store's print settings: what a sale prints and how many A4 copies (owner only)", async () => {
    await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ saleDocumentFormat: "A4", documentCopies: 2 }).expect(200);
    await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ documentCopies: 4 }).expect(400);
    await http().patch(`/stores/${storeId}`).set(auth(cashierToken)).send({ documentCopies: 1 }).expect(403);
    expect(await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { saleDocumentFormat: true, documentCopies: true } })).toEqual({ saleDocumentFormat: "A4", documentCopies: 2 });
  });
});
