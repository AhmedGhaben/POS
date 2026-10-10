import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Editing and archiving products: changed fields, SKU clashes, categories
 * from another business, cost prices for users who can't see them, past
 * sales keeping their price, and archived products leaving the till.
 * Runs against the dev database with its own business, deleted in afterAll.
 */
describe("Product editing (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "EditPass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let storeId: string;
  let teaId: string;
  let coffeeId: string;
  let drinksId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const patch = (token: string, id: string, body: object) =>
    http().patch(`/products/${id}`).set(auth(token)).send(body);

  async function addLogin(role: "MANAGER" | "CASHIER") {
    const email = `edit-${role.toLowerCase()}-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: role, lastName: "User", login: { email, role, storeIds: [storeId], password: PASSWORD } })
      .expect(201);
    return (await http().post("/auth/login").send({ email, password: PASSWORD }).expect(200)).body.accessToken as string;
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
      .send({
        businessName: "E2E Edit Shop",
        storeName: "E2E Edit Store",
        firstName: "Eddie",
        lastName: "Tor",
        email: `edit-owner-${RUN}@e2e.test`,
        password: PASSWORD,
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;

    drinksId = (await http().post("/categories").set(auth(ownerToken)).send({ name: "Drinks" }).expect(201)).body.id;
    const create = (sku: string, name: string) =>
      http()
        .post("/products")
        .set(auth(ownerToken))
        .send({ sku, name, costPrice: 1, sellPrice: 2, taxRate: 0 })
        .expect(201);
    teaId = (await create("TEA-1", "Tea")).body.id;
    coffeeId = (await create("COF-1", "Coffee")).body.id;
    await http().put(`/stores/${storeId}/inventory/${teaId}`).set(auth(ownerToken)).send({ quantity: 10 }).expect(200);

    managerToken = await addLogin("MANAGER");
    cashierToken = await addLogin("CASHIER");
  }, 30_000); // three logins, each hashing a password

  afterAll(async () => {
    if (businessId) {
      const userIds = (await prisma.user.findMany({ where: { businessId }, select: { id: true } })).map((u) => u.id);
      const storeIds = (await prisma.store.findMany({ where: { businessId }, select: { id: true } })).map((s) => s.id);
      const saleWhere = { storeId: { in: storeIds } };
      await prisma.$transaction([
        prisma.salePayment.deleteMany({ where: { sale: saleWhere } }),
        prisma.saleLineItem.deleteMany({ where: { sale: saleWhere } }),
        prisma.sale.deleteMany({ where: saleWhere }),
        prisma.inventoryItem.deleteMany({ where: { storeId: { in: storeIds } } }),
        prisma.product.deleteMany({ where: { businessId } }),
        prisma.category.deleteMany({ where: { businessId } }),
        prisma.auditLog.deleteMany({ where: { businessId } }),
        prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.employee.deleteMany({ where: { businessId } }),
        prisma.storeUser.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.store.deleteMany({ where: { businessId } }),
        prisma.business.delete({ where: { id: businessId } }),
      ]);
    }
    await app.close();
  });

  it("changes the name, prices, barcode and category", async () => {
    const res = await patch(ownerToken, teaId, {
      name: "Green tea",
      sellPrice: 2.5,
      costPrice: 1.1,
      taxRate: 6,
      barcode: " 5601234 ",
      categoryId: drinksId,
    }).expect(200);
    expect(res.body).toMatchObject({ name: "Green tea", sellPrice: "2.5", costPrice: "1.1", taxRate: "6" });
    expect(res.body.barcode).toBe("5601234");
    expect(res.body.categoryId).toBe(drinksId);

    // Clearing: an empty barcode and a null category.
    const cleared = await patch(ownerToken, teaId, { barcode: "", categoryId: null }).expect(200);
    expect(cleared.body.barcode).toBeNull();
    expect(cleared.body.categoryId).toBeNull();
  });

  it("refuses a SKU another product already uses, but allows keeping its own", async () => {
    const res = await patch(ownerToken, teaId, { sku: "COF-1" }).expect(409);
    expect(res.body.message).toBe("SKU already exists");
    await patch(ownerToken, teaId, { sku: "TEA-1", name: "Green tea" }).expect(200);
    await patch(ownerToken, teaId, { sku: "TEA-2" }).expect(200);
  });

  it("refuses a category from another business and bad values", async () => {
    const other = await prisma.category.findFirst({ where: { businessId: { not: businessId } } });
    if (other) await patch(ownerToken, teaId, { categoryId: other.id }).expect(404);
    await patch(ownerToken, teaId, { sellPrice: -1 }).expect(400);
    await patch(ownerToken, teaId, { name: "" }).expect(400);
  });

  it("a product from another business can't be edited", async () => {
    const other = await prisma.product.findFirst({ where: { businessId: { not: businessId } } });
    if (other) await patch(ownerToken, other.id, { name: "Hijacked" }).expect(404);
  });

  it("cashiers can't edit; managers can", async () => {
    await patch(cashierToken, coffeeId, { sellPrice: 0.01 }).expect(403);
    await patch(managerToken, coffeeId, { sellPrice: 3 }).expect(200);
  });

  it("a manager without the cost-price permission can't see or change the cost", async () => {
    const managerId = (await prisma.user.findFirst({ where: { businessId, role: "MANAGER" } }))!.id;
    await http()
      .patch(`/users/${managerId}/permissions`)
      .set(auth(ownerToken))
      .send({ permission: "VIEW_COST_PRICE", granted: false })
      .expect(200);

    const res = await patch(managerToken, coffeeId, { sellPrice: 3.5, costPrice: 99 }).expect(200);
    expect(res.body.sellPrice).toBe("3.5");
    expect(res.body).not.toHaveProperty("costPrice");
    const stored = await prisma.product.findUnique({ where: { id: coffeeId } });
    expect(Number(stored!.costPrice)).toBe(1);
  });

  it("past sales keep the price they were sold at", async () => {
    await patch(ownerToken, teaId, { sellPrice: 2, taxRate: 0 }).expect(200);
    const sale = await http()
      .post("/sales")
      .set(auth(ownerToken))
      .send({ storeId, lineItems: [{ productId: teaId, quantity: 1 }], payments: [{ method: "CASH", amount: 2 }] })
      .expect(201);

    await patch(ownerToken, teaId, { sellPrice: 9 }).expect(200);
    const line = await prisma.saleLineItem.findFirst({ where: { saleId: sale.body.id } });
    expect(Number(line!.unitPrice)).toBe(2);
    expect(Number((await prisma.sale.findUnique({ where: { id: sale.body.id } }))!.total)).toBe(2);
  });

  it("archiving hides a product from the till and the list; restoring brings it back", async () => {
    await patch(ownerToken, teaId, { barcode: "5601234" }).expect(200);
    await patch(ownerToken, teaId, { isActive: false }).expect(200);

    const list = await http().get("/products").set(auth(cashierToken)).expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).not.toContain(teaId);
    await http().get("/products/barcode/5601234").set(auth(cashierToken)).expect(404);

    const archived = await http().get("/products?archived=true").set(auth(ownerToken)).expect(200);
    expect(archived.body.map((p: { id: string }) => p.id)).toEqual([teaId]);
    // The till never gets the archived list.
    const cashierArchived = await http().get("/products?archived=true").set(auth(cashierToken)).expect(200);
    expect(cashierArchived.body.map((p: { id: string }) => p.id)).not.toContain(teaId);

    // An archived product's SKU is still taken.
    await patch(ownerToken, coffeeId, { sku: "TEA-2" }).expect(409);

    await patch(ownerToken, teaId, { isActive: true }).expect(200);
    const back = await http().get("/products").set(auth(cashierToken)).expect(200);
    expect(back.body.map((p: { id: string }) => p.id)).toContain(teaId);
  });
});
