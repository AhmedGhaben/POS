import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";
import { localDateTime } from "../src/fiscal/fiscal-format";
import { addDays } from "../src/fiscal/saft/period";

/** A 1x1 PNG. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * docs/plans/ANGOLA.md, phase 6: tax picked by name per product (or exempt
 * with a reason), prices including IVA with the tax rounded up, decimal
 * quantities with units, categories, unique barcodes, photos, and stock
 * movements with the weighted average cost and stock at a date.
 */
describe("Angola phase 6: products, tax and stock (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase6Pass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let cashierToken: string;
  let storeId: string;
  let shiftClientId: string;
  let rates: { id: string; key: string; percentage: string }[];
  const rate = (key: string) => rates.find((r) => r.key === key)!;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function product(body: Record<string, unknown>) {
    return http()
      .post("/products")
      .set(auth(ownerToken))
      .send({ sku: `P6-${RUN}-${Math.random().toString(36).slice(2, 8)}`, costPrice: 0, sellPrice: 10, ...body });
  }
  async function stockOf(productId: string) {
    const item = await prisma.inventoryItem.findUnique({ where: { storeId_productId: { storeId, productId } } });
    return { quantity: item?.quantity.toNumber() ?? 0, averageCost: item?.averageCost.toNumber() ?? 0 };
  }
  function sell(lineItems: { productId: string; quantity: number }[], amount: number, token = ownerToken) {
    return http()
      .post("/sales")
      .set(auth(token))
      .send({ storeId, shiftClientId, lineItems, payments: [{ method: "CASH", amount }] });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Mercearia Lda", storeName: "Loja Viana", firstName: "Paula", lastName: "Owner", email: `p6-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    const email = `p6-cashier-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: "Carla", lastName: "Cashier", login: { email, role: "CASHIER", storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    cashierToken = (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    rates = (await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body;
    shiftClientId = await ensureShift(app, ownerToken, storeId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  describe("tax by name", () => {
    it("a product takes a rate by id: its percentage and code come with it", async () => {
      const res = await product({ name: "Arroz 1kg", taxRateId: rate("IVA-RED-5").id }).expect(201);
      expect(res.body).toMatchObject({ taxRateId: rate("IVA-RED-5").id, taxCode: "RED", exemptionCode: null, unit: "un", productType: "P", inventoryType: "M" });
      expect(Number(res.body.taxRate)).toBe(5);
    });

    it("exempt needs a known reason, which it keeps", async () => {
      const res = await product({ name: "Fuba de milho", exemptionCode: "M10" }).expect(201);
      expect(res.body).toMatchObject({ taxRateId: null, taxCode: "ISE", exemptionCode: "M10" });
      expect(Number(res.body.taxRate)).toBe(0);
      await product({ name: "Coisa", exemptionCode: "M99" }).expect(400);
    });

    it("a bare percentage (CSV, older apps) is linked to the rate with that percentage", async () => {
      const res = await product({ name: "Sumo", taxRate: 14 }).expect(201);
      expect(res.body).toMatchObject({ taxRateId: rate("IVA-NOR-14").id, taxCode: "NOR" });
    });

    it("services are SAF-T type S with no inventory type", async () => {
      const res = await product({ name: "Entrega", trackStock: false, taxRateId: rate("IVA-NOR-14").id }).expect(201);
      expect(res.body).toMatchObject({ productType: "S", inventoryType: null });
      await product({ name: "Mau tipo", inventoryType: "Z" }).expect(400);
      await product({ name: "Má unidade", unit: "ton" }).expect(400);
    });

    it("changing a rate's percentage moves the products that use it (from the next sale)", async () => {
      const own = (await http().post("/tax-rates").set(auth(ownerToken)).send({ name: "Taxa teste", taxCode: "OUT", percentage: 2, region: "AO" }).expect(201)).body;
      const p = (await product({ name: "Com taxa teste", taxRateId: own.id }).expect(201)).body;
      await http().patch(`/tax-rates/${own.id}`).set(auth(ownerToken)).send({ percentage: 3 }).expect(200);
      expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).taxRate)).toBe(3);
    });
  });

  describe("selling with prices that include IVA", () => {
    it("the total is the shelf price; the tax inside it is rounded up; the line records the tax", async () => {
      const p = (await product({ name: "Óleo 1L", sellPrice: 10, taxRateId: rate("IVA-NOR-14").id, trackStock: false }).expect(201)).body;
      const sale = (await sell([{ productId: p.id, quantity: 1 }], 10).expect(201)).body;
      // 10.00 x 14/114 = 1.228 -> 1.23; base 8.77
      expect(sale).toMatchObject({ total: "10", taxTotal: "1.23", pricesIncludeTax: true });
      expect(sale.lineItems[0]).toMatchObject({ taxRate: "14", taxCode: "NOR", exemptionCode: null, unit: "un", lineTotal: "10" });
    });

    it("an exempt line carries its reason and no tax", async () => {
      const p = (await product({ name: "Feijão", sellPrice: 7.5, exemptionCode: "M10", trackStock: false }).expect(201)).body;
      const sale = (await sell([{ productId: p.id, quantity: 2 }], 15).expect(201)).body;
      expect(sale).toMatchObject({ total: "15", taxTotal: "0" });
      expect(sale.lineItems[0]).toMatchObject({ taxCode: "ISE", exemptionCode: "M10" });
    });

    it("reports count revenue without the tax inside the prices", async () => {
      const summary = (await http().get(`/reports/store/${storeId}/summary`).set(auth(ownerToken)).expect(200)).body;
      // 8.77 (10.00 less 1.23 IVA) + 15.00 exempt
      expect(summary.revenue).toBeCloseTo(23.77, 2);
    });

    it("Regime Simplificado: every line is exempt with M00", async () => {
      await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ ivaRegime: "SIMPLIFICADO" }).expect(200);
      try {
        const p = (await product({ name: "Sabão", sellPrice: 5, taxRateId: rate("IVA-NOR-14").id, trackStock: false }).expect(201)).body;
        const sale = (await sell([{ productId: p.id, quantity: 1 }], 5).expect(201)).body;
        expect(sale.taxTotal).toBe("0");
        expect(sale.lineItems[0]).toMatchObject({ taxCode: "ISE", exemptionCode: "M00" });
      } finally {
        await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ ivaRegime: "GERAL" }).expect(200);
      }
    });
  });

  describe("units and decimal quantities", () => {
    let kg: { id: string };

    it("sells 0.765 kg at 1 250,00/kg for 956,25 and leaves 1.235 kg", async () => {
      kg = (await product({ name: "Carne picada", unit: "kg", sellPrice: 1250, exemptionCode: "M10" }).expect(201)).body;
      await http().put(`/stores/${storeId}/inventory/${kg.id}`).set(auth(ownerToken)).send({ quantity: 2 }).expect(200);
      const sale = (await sell([{ productId: kg.id, quantity: 0.765 }], 956.25).expect(201)).body;
      expect(sale.total).toBe("956.25");
      expect(sale.lineItems[0]).toMatchObject({ quantity: "0.765", unit: "kg" });
      expect((await stockOf(kg.id)).quantity).toBe(1.235);
    });

    it("products sold by the unit only take whole numbers", async () => {
      const un = (await product({ name: "Lata", trackStock: false, exemptionCode: "M10" }).expect(201)).body;
      const res = await sell([{ productId: un.id, quantity: 1.5 }], 15).expect(400);
      expect(res.body.message).toBe('"Lata" is sold in whole units');
      await sell([{ productId: kg.id, quantity: 0.0001 }], 1).expect(400);
    });
  });

  describe("barcodes", () => {
    it("one active product per barcode; archived ones free it", async () => {
      const code = `560${RUN}`.slice(0, 13);
      const first = (await product({ name: "Água 1,5L", barcode: code }).expect(201)).body;
      const clash = await product({ name: "Água outra", barcode: ` ${code} ` }).expect(409);
      expect(clash.body.message).toBe('This barcode is already used by "Água 1,5L"');
      // A scanner's trailing spaces are trimmed; the lookup finds it.
      expect((await http().get(`/products/barcode/${code}`).set(auth(cashierToken)).expect(200)).body.id).toBe(first.id);

      await http().patch(`/products/${first.id}`).set(auth(ownerToken)).send({ isActive: false }).expect(200);
      const second = (await product({ name: "Água nova", barcode: code }).expect(201)).body;
      // Restoring the old one now clashes.
      await http().patch(`/products/${first.id}`).set(auth(ownerToken)).send({ isActive: true }).expect(409);
      expect(second.barcode).toBe(code);
    });
  });

  describe("categories", () => {
    it("rename (names unique regardless of case), and delete moving the products elsewhere", async () => {
      const drinks = (await http().post("/categories").set(auth(ownerToken)).send({ name: "Bebidas" }).expect(201)).body;
      const other = (await http().post("/categories").set(auth(ownerToken)).send({ name: "Mercearia" }).expect(201)).body;
      await http().post("/categories").set(auth(ownerToken)).send({ name: "bebidas" }).expect(409);
      await http().post("/categories").set(auth(ownerToken)).send({ name: "   " }).expect(400);
      const renamed = (await http().patch(`/categories/${drinks.id}`).set(auth(ownerToken)).send({ name: "Bebidas frescas" }).expect(200)).body;
      expect(renamed.name).toBe("Bebidas frescas");
      await http().patch(`/categories/${drinks.id}`).set(auth(cashierToken)).send({ name: "X" }).expect(403);

      const p = (await product({ name: "Cola", categoryId: drinks.id }).expect(201)).body;
      const list = (await http().get("/categories").set(auth(ownerToken)).expect(200)).body;
      expect(list.find((c: { id: string }) => c.id === drinks.id)._count.products).toBe(1);

      await http().delete(`/categories/${drinks.id}?reassignTo=${drinks.id}`).set(auth(ownerToken)).expect(400);
      const res = (await http().delete(`/categories/${drinks.id}?reassignTo=${other.id}`).set(auth(ownerToken)).expect(200)).body;
      expect(res).toMatchObject({ moved: 1, reassignTo: other.id });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).categoryId).toBe(other.id);

      // Without a target the products are left uncategorized.
      await http().delete(`/categories/${other.id}`).set(auth(ownerToken)).expect(200);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).categoryId).toBeNull();
    });
  });

  describe("photos", () => {
    it("uploads, serves by its random id without signing in, replaces and removes", async () => {
      const p = (await product({ name: "Com foto" }).expect(201)).body;
      await http().put(`/products/${p.id}/photo`).set(auth(ownerToken)).send({ dataUrl: "data:text/plain;base64,aGVsbG8=" }).expect(400);
      await http().put(`/products/${p.id}/photo`).set(auth(cashierToken)).send({ dataUrl: PNG }).expect(403);
      const up = (await http().put(`/products/${p.id}/photo`).set(auth(ownerToken)).send({ dataUrl: PNG }).expect(200)).body;
      expect(up.photoId).toMatch(/^[0-9a-f-]{36}$/);
      const img = await http().get(`/product-photos/${up.photoId}`).expect(200);
      expect(img.headers["content-type"]).toBe("image/png");

      const again = (await http().put(`/products/${p.id}/photo`).set(auth(ownerToken)).send({ dataUrl: PNG }).expect(200)).body;
      expect(again.photoId).not.toBe(up.photoId);
      await http().get(`/product-photos/${up.photoId}`).expect(404);

      await http().delete(`/products/${p.id}/photo`).set(auth(ownerToken)).expect(200);
      await http().get(`/product-photos/${again.photoId}`).expect(404);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).photoId).toBeNull();
    });
  });

  describe("stock movements and weighted average cost", () => {
    let item: { id: string };

    it("purchases re-average the cost; a sale leaves at the average and records it on the line", async () => {
      item = (await product({ name: "Leite", costPrice: 90, sellPrice: 200, taxRateId: rate("IVA-NOR-14").id }).expect(201)).body;
      const supplier = (await http().post("/suppliers").set(auth(ownerToken)).send({ name: `Fornecedor ${RUN}` }).expect(201)).body;
      const buy = (quantity: number, unitCost: number) =>
        http().post("/purchases").set(auth(ownerToken)).send({ storeId, supplierId: supplier.id, lineItems: [{ productId: item.id, quantity, unitCost }] }).expect(201);
      await buy(10, 100);
      await buy(30, 140);
      expect(await stockOf(item.id)).toEqual({ quantity: 40, averageCost: 130 });

      const sale = (await sell([{ productId: item.id, quantity: 4 }], 800).expect(201)).body;
      expect(sale.lineItems[0].unitCost).toBe("130");
      expect(await stockOf(item.id)).toEqual({ quantity: 36, averageCost: 130 });

      // Cancelling puts it back at that cost.
      await http().post("/sales/void").set(auth(ownerToken)).send({ storeId, saleId: sale.id, reason: "ANNUL_N" }).expect(200);
      expect(await stockOf(item.id)).toEqual({ quantity: 40, averageCost: 130 });
    });

    it("a count adjustment is a movement too, and the history adds up to the stock", async () => {
      await http().put(`/stores/${storeId}/inventory/${item.id}`).set(auth(ownerToken)).send({ quantity: 38, note: "Partidos" }).expect(200);
      const history = (await http().get(`/stores/${storeId}/inventory/${item.id}/movements`).set(auth(ownerToken)).expect(200)).body;
      expect(history.map((m: { type: string }) => m.type)).toEqual(["ADJUSTMENT", "SALE_VOID", "SALE", "PURCHASE", "PURCHASE"]);
      expect(history[0]).toMatchObject({ quantity: "-2", balance: "38", note: "Partidos", averageCost: "130" });
      const total = history.reduce((sum: number, m: { quantity: string }) => sum + Number(m.quantity), 0);
      expect(total).toBe(38);
      // Cashiers don't see the history.
      await http().get(`/stores/${storeId}/inventory/${item.id}/movements`).set(auth(cashierToken)).expect(403);
    });

    it("stock at a date: today has it, at its book value; the day before it didn't exist", async () => {
      // Calendar dates in the store's time zone (Luanda), not UTC's.
      const today = localDateTime(new Date(), "Africa/Luanda").date;
      const rows = (await http().get(`/stores/${storeId}/inventory/at?date=${today}`).set(auth(ownerToken)).expect(200)).body;
      expect(rows.find((r: { productId: string }) => r.productId === item.id)).toMatchObject({ quantity: "38", averageCost: "130", value: "4940.00", inventoryType: "M", productType: "P" });
      const yesterday = addDays(today, -1);
      const before = (await http().get(`/stores/${storeId}/inventory/at?date=${yesterday}`).set(auth(ownerToken)).expect(200)).body;
      expect(before.find((r: { productId: string }) => r.productId === item.id)).toBeUndefined();
      await http().get(`/stores/${storeId}/inventory/at?date=31-12-2025`).set(auth(ownerToken)).expect(400);
    });

    it("costs are only shown to people who may see cost prices", async () => {
      const owner = (await http().get(`/stores/${storeId}/inventory`).set(auth(ownerToken)).expect(200)).body;
      expect(owner.find((i: { productId: string }) => i.productId === item.id).averageCost).toBe("130");
      const cashier = (await http().get(`/stores/${storeId}/inventory`).set(auth(cashierToken)).expect(200)).body;
      const row = cashier.find((i: { productId: string }) => i.productId === item.id);
      expect(row.averageCost).toBeUndefined();
      expect(row.product.costPrice).toBeUndefined();
    });
  });
});
