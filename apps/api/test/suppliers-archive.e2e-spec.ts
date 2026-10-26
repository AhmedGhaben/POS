import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";

/**
 * Suppliers: edited, deleted when they have no purchases or payments,
 * archived otherwise (hidden from lists and new purchases, restorable).
 * Runs against the dev database with its own business, deleted in afterAll.
 */
describe("Supplier edit, delete and archive (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  let businessId: string | undefined;
  let token: string;
  let storeId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const createSupplier = async (name: string) => (await http().post("/suppliers").set(auth()).send({ name }).expect(201)).body.id as string;
  const listed = async (query = "") => ((await http().get(`/suppliers${query}`).set(auth()).expect(200)).body as { id: string }[]).map((s) => s.id);
  const purchase = (supplierId: string) =>
    http()
      .post("/purchases")
      .set(auth())
      .send({ storeId, supplierId, lineItems: [{ productId, quantity: 1, unitCost: 5 }] });

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
        businessName: "E2E Supplier Shop",
        storeName: "E2E Supplier Store",
        firstName: "Sue",
        lastName: "Plier",
        email: `supplier-owner-${RUN}@e2e.test`,
        password: "SupplierPass123!",
      })
      .expect(201);
    businessId = reg.body.user.businessId;
    token = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    productId = (await http().post("/products").set(auth()).send({ sku: "SUP-P", name: "Bought thing", costPrice: 5, sellPrice: 9, exemptionCode: "M10" }).expect(201)).body.id;
  });

  afterAll(async () => {
    if (businessId) {
      await deleteBusiness(prisma, businessId);
    }
    await app.close();
  });

  it("edits a supplier and clears a field", async () => {
    const id = await createSupplier("Old name");
    await http().patch(`/suppliers/${id}`).set(auth()).send({ name: "New name", phone: "923000000" }).expect(200);
    const res = await http().patch(`/suppliers/${id}`).set(auth()).send({ phone: null }).expect(200);
    expect(res.body).toMatchObject({ name: "New name", phone: null });
  });

  it("deletes a supplier with no purchases or payments", async () => {
    const id = await createSupplier("Never used");
    await http().delete(`/suppliers/${id}`).set(auth()).expect(204);
    expect(await prisma.supplier.findUnique({ where: { id } })).toBeNull();
  });

  it("refuses to delete a supplier with a purchase; archiving hides it and blocks new purchases", async () => {
    const id = await createSupplier("Bought from");
    await purchase(id).expect(201);

    const refused = await http().delete(`/suppliers/${id}`).set(auth()).expect(409);
    expect(refused.body.message).toBe("This supplier has purchases or payments. Archive it instead.");

    await http().patch(`/suppliers/${id}`).set(auth()).send({ isActive: false }).expect(200);
    expect(await listed()).not.toContain(id);
    expect(await listed("?includeArchived=true")).toContain(id);
    expect((await purchase(id).expect(400)).body.message).toBe("This supplier is archived. Restore it to buy from it again.");

    await http().patch(`/suppliers/${id}`).set(auth()).send({ isActive: true }).expect(200);
    expect(await listed()).toContain(id);
  });

  it("can't delete another business's supplier", async () => {
    const other = await prisma.supplier.findFirst({ where: { businessId: { not: businessId } } });
    if (other) await http().delete(`/suppliers/${other.id}`).set(auth()).expect(404);
  });
});
