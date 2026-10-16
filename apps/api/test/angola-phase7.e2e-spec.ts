import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 7: company data for Angola, the store's IVA
 * regime (owner only, logged), tax rates seeded from the country config,
 * bank accounts, supplier NIF, pt-AO messages and the new payment methods.
 */
describe("Angola phase 7: country config and company data (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = Date.now();
  const PASSWORD = "Phase7Pass123!";
  let businessId: string | undefined;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let storeId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function addLogin(role: "CASHIER" | "MANAGER") {
    const email = `p7-${role.toLowerCase()}-${RUN}@e2e.test`;
    await http()
      .post("/employees")
      .set(auth(ownerToken))
      .send({ firstName: role, lastName: "Test", login: { email, role, storeIds: [storeId], password: PASSWORD } })
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
      .send({ businessName: "E2E Kwanza Lda", storeName: "Loja Luanda", firstName: "Olga", lastName: "Owner", email: `p7-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    managerToken = await addLogin("MANAGER");
    cashierToken = await addLogin("CASHIER");
  }, 60_000);

  afterAll(async () => {
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
    }
  });

  it("new businesses and stores are in Angola, Regime Geral, with prices including IVA", async () => {
    const business = await http().get("/businesses/me").set(auth(ownerToken)).expect(200);
    expect(business.body).toMatchObject({ country: "AO", eInvoicingActive: false });
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(store).toMatchObject({ country: "AO", ivaRegime: "GERAL", pricesIncludeTax: true });
  });

  it("a new Angolan business takes the country's defaults: AOA, pt-AO, Africa/Luanda", async () => {
    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E Defaults Lda", storeName: "Loja", firstName: "Ana", lastName: "Owner", email: `p7-defaults-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    try {
      const business = await prisma.business.findUniqueOrThrow({ where: { id: reg.body.user.businessId } });
      expect(business).toMatchObject({ country: "AO", currency: "AOA", language: "pt-AO" });
      const store = await prisma.store.findUniqueOrThrow({ where: { id: reg.body.stores[0].id } });
      expect(store).toMatchObject({ country: "AO", timezone: "Africa/Luanda", ivaRegime: "GERAL" });
      // A second store follows the business's country too.
      const second = await http().post("/stores").set(auth(reg.body.accessToken)).send({ name: "Loja 2" });
      if (second.status === 201) expect(second.body).toMatchObject({ timezone: "Africa/Luanda", country: "AO" });
    } finally {
      await deleteBusiness(prisma, reg.body.user.businessId);
    }
  });

  it("company data: alphanumeric NIF, legal form and province from the lists, CAE", async () => {
    const res = await http()
      .patch("/businesses/me")
      .set(auth(ownerToken))
      .send({
        taxId: "000415195LA035",
        registrationNumber: "LDA-2024/1234B",
        legalForm: "LDA",
        eacCode: "47110",
        address: "Rua Rainha Ginga 12",
        city: "Luanda",
        province: "LA",
        eInvoicingActive: true,
      })
      .expect(200);
    expect(res.body).toMatchObject({ taxId: "000415195LA035", legalForm: "LDA", province: "LA", eacCode: "47110", eInvoicingActive: true });
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ legalForm: "XYZ" }).expect(400);
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ province: "ZZ" }).expect(400);
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ taxId: "@@@" }).expect(400);
  });

  it("only the owner changes the IVA regime, and every change is logged", async () => {
    await http().patch(`/stores/${storeId}`).set(auth(managerToken)).send({ ivaRegime: "SIMPLIFICADO" }).expect(403);
    const res = await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ ivaRegime: "SIMPLIFICADO", province: "CA", pricesIncludeTax: false }).expect(200);
    expect(res.body).toMatchObject({ ivaRegime: "SIMPLIFICADO", province: "CA", pricesIncludeTax: false });
    const log = await prisma.auditLog.findFirst({ where: { businessId, action: "IVA_REGIME_CHANGED" } });
    expect(log).toMatchObject({ entityId: storeId, metadata: { from: "GERAL", to: "SIMPLIFICADO" } });
    // Saving without a change doesn't log again.
    await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ ivaRegime: "SIMPLIFICADO" }).expect(200);
    expect(await prisma.auditLog.count({ where: { businessId, action: "IVA_REGIME_CHANGED" } })).toBe(1);
    await http().patch(`/stores/${storeId}`).set(auth(ownerToken)).send({ ivaRegime: "INVENTED" }).expect(400);
  });

  it("tax rates start as Angola's and are the owner's to change", async () => {
    const rates = (await http().get("/tax-rates").set(auth(cashierToken)).expect(200)).body as { id: string; key: string; percentage: string; isDefault: boolean; region: string; verifyValidity: boolean }[];
    expect(rates.map((r) => [r.key, Number(r.percentage), r.region])).toEqual([
      ["IVA-NOR-14", 14, "AO"],
      ["IVA-INT-7", 7, "AO"],
      ["IVA-RED-5", 5, "AO"],
      ["IVA-CAB-1", 1, "AO-CAB"],
    ]);
    expect(rates.find((r) => r.key === "IVA-INT-7")?.verifyValidity).toBe(true);
    // Asking again doesn't copy them twice.
    expect((await http().get("/tax-rates").set(auth(ownerToken)).expect(200)).body).toHaveLength(4);

    const reduced = rates.find((r) => r.key === "IVA-RED-5")!;
    const general = rates.find((r) => r.key === "IVA-NOR-14")!;
    await http().patch(`/tax-rates/${reduced.id}`).set(auth(cashierToken)).send({ percentage: 6 }).expect(403);
    await http().patch(`/tax-rates/${general.id}`).set(auth(ownerToken)).send({ active: false }).expect(400);
    const changed = await http().patch(`/tax-rates/${reduced.id}`).set(auth(ownerToken)).send({ percentage: 6, isDefault: true }).expect(200);
    expect(changed.body).toMatchObject({ percentage: "6", isDefault: true });
    expect((await prisma.taxRate.findUniqueOrThrow({ where: { id: general.id } })).isDefault).toBe(false);

    const added = await http().post("/tax-rates").set(auth(ownerToken)).send({ name: "Taxa especial", taxCode: "OUT", percentage: 2, region: "AO" }).expect(201);
    expect(added.body).toMatchObject({ key: null, taxType: "IVA", percentage: "2" });
    await http().post("/tax-rates").set(auth(ownerToken)).send({ name: "X", taxCode: "NOR", percentage: 3, region: "PT" }).expect(400);
  });

  it("bank accounts: from the list or Outro, with a valid IBAN; everyone can read them", async () => {
    const bai = await http()
      .post("/bank-accounts")
      .set(auth(ownerToken))
      .send({ bankCode: "BAI", accountHolder: "E2E Kwanza Lda", iban: "AO03 0006 0000 0012 3456 7890 1" })
      .expect(201);
    expect(bai.body).toMatchObject({ bankCode: "BAI", bankName: "Banco Angolano de Investimento (BAI)", iban: "AO03000600000012345678901", showOnQuotes: true });
    await http().post("/bank-accounts").set(auth(ownerToken)).send({ bankCode: "OTHER", accountHolder: "X", iban: "AO03000600000012345678901" }).expect(400);
    const other = await http()
      .post("/bank-accounts")
      .set(auth(ownerToken))
      .send({ bankCode: "OTHER", bankName: "Banco Yetu", accountHolder: "E2E Kwanza Lda", iban: "AO03000600000012345678901" })
      .expect(201);
    expect(other.body).toMatchObject({ bankCode: "OTHER", bankName: "Banco Yetu" });
    await http().post("/bank-accounts").set(auth(ownerToken)).send({ bankCode: "BAI", accountHolder: "X", iban: "AO04000600000012345678901" }).expect(400);
    await http().post("/bank-accounts").set(auth(cashierToken)).send({ bankCode: "BAI", accountHolder: "X", iban: "AO03000600000012345678901" }).expect(403);

    expect((await http().get("/bank-accounts").set(auth(cashierToken)).expect(200)).body).toHaveLength(2);
    await http().patch(`/bank-accounts/${other.body.id}`).set(auth(ownerToken)).send({ showOnInvoices: true }).expect(200);
    await http().delete(`/bank-accounts/${other.body.id}`).set(auth(ownerToken)).expect(200);
    expect((await http().get("/bank-accounts").set(auth(ownerToken)).expect(200)).body).toHaveLength(1);
  });

  it("suppliers and customers take a NIF and a structured address", async () => {
    const supplier = await http()
      .post("/suppliers")
      .set(auth(ownerToken))
      .send({ name: "Fornecedor Kwanza", taxId: "5417000000", address: "Av. 4 de Fevereiro", city: "Luanda", province: "LA", country: "AO" })
      .expect(201);
    expect(supplier.body).toMatchObject({ taxId: "5417000000", city: "Luanda", province: "LA", country: "AO" });
    const customer = await http().post("/customers").set(auth(cashierToken)).send({ name: "Cliente Empresa", taxId: "000415195LA035", city: "Benguela" }).expect(201);
    expect(customer.body).toMatchObject({ taxId: "000415195LA035", city: "Benguela", country: "AO" });
    await http().post("/customers").set(auth(cashierToken)).send({ name: "X", taxId: "!!" }).expect(400);
  });

  it("answers in Angolan spelling with X-Language: pt-AO", async () => {
    await http().patch("/users/me/language").set(auth(ownerToken)).send({ language: "pt-AO" }).expect(200);
    const res = await http().patch("/businesses/me").set(auth(ownerToken)).set("X-Language", "pt-AO").send({ legalForm: "XYZ" }).expect(400);
    expect(res.body.message).toBe("Forma jurídica desconhecida");
    const settings = await http().patch("/businesses/me").set(auth(ownerToken)).send({ language: "pt-AO" }).expect(200);
    expect(settings.body.language).toBe("pt-AO");
  });

  it("takes the new payment methods (bank transfer, Multicaixa reference…)", async () => {
    const product = await http().post("/products").set(auth(ownerToken)).send({ sku: "P7", name: "Arroz", costPrice: 1, sellPrice: 100, exemptionCode: "M10" }).expect(201);
    await http().put(`/stores/${storeId}/inventory/${product.body.id}`).set(auth(ownerToken)).send({ quantity: 10 }).expect(200);
    const shift = await ensureShift(app, ownerToken, storeId);
    const sale = await http()
      .post("/sales")
      .set(auth(ownerToken))
      .send({
        storeId,
        shiftClientId: shift,
        lineItems: [{ productId: product.body.id, quantity: 2 }],
        payments: [
          { method: "BANK_TRANSFER", amount: 150 },
          { method: "MULTICAIXA_REFERENCE", amount: 50 },
        ],
      })
      .expect(201);
    expect(sale.body.payments.map((p: { method: string }) => p.method).sort()).toEqual(["BANK_TRANSFER", "MULTICAIXA_REFERENCE"]);
  });

});
