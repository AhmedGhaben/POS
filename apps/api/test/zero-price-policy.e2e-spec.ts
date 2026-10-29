import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Permission } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { hashToken } from "../src/common/utils/tokens";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";
import { IntegrationService } from "../src/accounting/integration.service";

describe("Item 8 zero-price authorization (isolated PostgreSQL)", () => {
  let app: INestApplication, db: PrismaService, businessId: string, storeId: string, token: string, managerToken: string, managerId: string, cashierId: string, cashierToken: string, freeId: string, paidId: string, shiftClientId: string;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const payload = (extra: Record<string, unknown> = {}) => ({ storeId, shiftClientId, clientId: randomUUID(), lineItems: [{ productId: freeId, quantity: 1 }], payments: [], ...extra });
  const cart = (p: ReturnType<typeof payload>) => JSON.stringify([p.lineItems.map((li: { productId: string; quantity: number; unitPrice?: number; discount?: { type: string; value: number } }) => [li.productId, li.quantity, li.unitPrice ?? (li.productId === freeId ? 0 : 5), li.discount?.type ?? null, li.discount?.value ?? 0]), [(p as any).discount?.type ?? null, (p as any).discount?.value ?? 0]]);
  const grant = (p: ReturnType<typeof payload>, extra: Record<string, unknown> = {}) => http().post("/overrides").set(auth()).send({ permission: "CHANGE_PRICE", action: "sale.zero-price", storeId, approverId: managerId, pin: "8642", details: { clientId: p.clientId, cart: cart(p), justification: "Customer sample" }, ...extra });
  const sell = (p: object) => http().post("/sales").set(auth()).send(p);
  const counts = () => Promise.all([db.sale.count({ where: { storeId } }), db.fiscalDocument.count({ where: { storeId } }), db.stockMovement.count({ where: { storeId } })]);
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!); if (!/test/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Fresh local test DB required");
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); app.useGlobalFilters(new HttpExceptionFilter()); await app.init(); db = app.get(PrismaService);
    const s = (await http().post("/auth/register").send({ businessName: "Free policy test", storeName: "Test", firstName: "Test", lastName: "Owner", email: `free-${randomUUID()}@e2e.test`, password: "FreePolicy123!" }).expect(201)).body;
    token = s.accessToken; businessId = s.user.businessId; storeId = s.stores[0].id;
    await db.business.update({ where: { id: businessId }, data: { allowSellingWithoutStock: false } });
    for (const role of ["MANAGER", "CASHIER"]) {
      const email = `free-${role}-${randomUUID()}@e2e.test`;
      await http().post("/employees").set(auth()).send({ firstName: role, lastName: "Test", login: { email, role, storeIds: [storeId], password: "FreePolicy123!" } }).expect(201);
      const login = (await http().post("/auth/login").send({ email, password: "FreePolicy123!" }).expect(200)).body;
      if (role === "MANAGER") { managerToken = login.accessToken; managerId = login.user.id; }
      else { cashierId = login.user.id; cashierToken = login.accessToken; }
    }
    await http().put("/users/me/pin").set({ Authorization: `Bearer ${managerToken}` }).send({ pin: "8642", password: "FreePolicy123!" }).expect(200);
    await db.userPermission.create({ data: { userId: cashierId, permission: Permission.CHANGE_PRICE, granted: true } });
    freeId = (await http().post("/products").set(auth()).send({ name: "Sample", sku: "FREE", costPrice: 0, sellPrice: 0, isFree: true, exemptionCode: "M10" }).expect(201)).body.id;
    paidId = (await http().post("/products").set(auth()).send({ name: "Bonus stock", sku: "PAID", costPrice: 0, sellPrice: 5, exemptionCode: "M10" }).expect(201)).body.id;
    for (const id of [freeId, paidId]) await http().put(`/stores/${storeId}/inventory/${id}`).set(auth()).send({ quantity: 40 }).expect(200);
    shiftClientId = await ensureShift(app, token, storeId);
  }, 30000);
  afterAll(async () => { try { if (businessId) await deleteBusiness(db, businessId); } finally { await app?.close(); } });

  it("allows zero purchase cost and ordinary paid sales without extra authorization", async () => {
    const sale = (await sell(payload({ lineItems: [{ productId: paidId, quantity: 1 }], payments: [{ method: "CASH", amount: 5 }] })).expect(201)).body;
    expect(sale.total).toBe("5"); expect(sale.lineItems[0].unitCost).toBe("0");
  });
  it("blocks catalogue free items, zero overrides and 100% discount bypasses even for the owner", async () => {
    const before = await counts();
    for (const extra of [{}, { lineItems: [{ productId: paidId, quantity: 1, unitPrice: 0 }] }, { lineItems: [{ productId: paidId, quantity: 1 }], discount: { type: "PERCENT", value: 100 } }]) {
      expect((await sell(payload(extra)).expect(403)).body.code).toBe("ZERO_PRICE_APPROVAL_REQUIRED");
    }
    expect(await counts()).toEqual(before);
  });
  it("requires a reason and a real manager, regardless of cashier price-change permission", async () => {
    const p = payload();
    await grant(p, { details: { clientId: p.clientId, cart: cart(p), justification: "  " } }).expect(400);
    await grant(p, { approverId: cashierId }).expect(403);
    await grant(p, { pin: "0000" }).expect(403);
    await sell({ ...p, zeroPriceApproval: "invented" }).expect(403);
    const ordinary = (await grant(p, { action: "sale.price" }).expect(200)).body;
    await sell({ ...p, zeroPriceApproval: ordinary.token }).expect(403);
  });
  it("cashiers with CHANGE_PRICE still need a manager; a bound grant authorizes their free sale", async () => {
    const terminal = (await http().post("/terminals").set(auth()).send({ storeId, name: "Cashier test till" }).expect(201)).body;
    const cashierShift = await ensureShift(app, cashierToken, storeId, { terminalId: terminal.id });
    const ownerToken = token; token = cashierToken;
    try {
      const p = payload({ terminalId: terminal.id, shiftClientId: cashierShift, lineItems: [{ productId: paidId, quantity: 1, unitPrice: 0 }] });
      await sell(p).expect(403);
      const approval = (await grant(p).expect(200)).body;
      const sale = (await sell({ ...p, zeroPriceApproval: approval.token }).expect(201)).body;
      expect(sale.cashierId).toBe(cashierId);
      expect((await db.auditLog.findFirstOrThrow({ where: { action: "ZERO_PRICE_SALE_APPROVED", entityId: sale.id } })).metadata).toMatchObject({ approvedById: managerId });
    } finally { token = ownerToken; }
  });
  it("audits the manager and reason, issues one signed document and replays the same key safely", async () => {
    const p = payload(), approval = (await grant(p).expect(200)).body;
    const a = (await sell({ ...p, zeroPriceApproval: approval.token }).expect(201)).body;
    expect((await sell({ ...p, zeroPriceApproval: approval.token }).expect(201)).body.id).toBe(a.id);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ZERO_PRICE_SALE_APPROVED", entityId: a.id } });
    expect(audit.metadata).toMatchObject({ approvedById: managerId, justification: "Customer sample" });
    const document = await db.fiscalDocument.findFirstOrThrow({ where: { saleId: a.id } }); expect(document.hash).toBeTruthy();
    await sell({ ...payload(), zeroPriceApproval: approval.token }).expect(403);
  });
  it.each(["override", "discount"])("accepts a specifically approved zero-price %s without changing fiscal or movement semantics", async (kind) => {
    const p = payload({ lineItems: [{ productId: paidId, quantity: 1, ...(kind === "override" ? { unitPrice: 0 } : {}) }], ...(kind === "discount" ? { discount: { type: "PERCENT", value: 100 } } : {}) });
    const approval = (await grant(p).expect(200)).body;
    const sale = (await sell({ ...p, zeroPriceApproval: approval.token }).expect(201)).body;
    expect(sale.total).toBe("0"); expect(await db.stockMovement.count({ where: { saleId: sale.id, type: "SALE" } })).toBe(1);
    expect(await db.fiscalDocument.count({ where: { saleId: sale.id } })).toBe(1);
  });
  it("binds grants to cart, sale key and store, and rechecks expiry and active managers", async () => {
    const p = payload(), approval = (await grant(p).expect(200)).body;
    await sell({ ...p, lineItems: [{ productId: freeId, quantity: 2 }], zeroPriceApproval: approval.token }).expect(403);
    await sell({ ...p, clientId: randomUUID(), zeroPriceApproval: approval.token }).expect(403);
    await db.managerOverride.update({ where: { tokenHash: hashToken(approval.token) }, data: { storeId: null } });
    await sell({ ...p, zeroPriceApproval: approval.token }).expect(403);
    await db.managerOverride.update({ where: { tokenHash: hashToken(approval.token) }, data: { storeId, expiresAt: new Date(0) } });
    await sell({ ...p, zeroPriceApproval: approval.token }).expect(403);
    const next = (await grant(p).expect(200)).body;
    await db.user.update({ where: { id: managerId }, data: { isActive: false } });
    try { await sell({ ...p, zeroPriceApproval: next.token }).expect(403); }
    finally { await db.user.update({ where: { id: managerId }, data: { isActive: true } }); }
  });
  it("rejects offline free sales even with forged offline approvers or an online grant", async () => {
    const p = payload(), approval = (await grant(p).expect(200)).body, before = await counts();
    await sell({ ...p, zeroPriceApproval: approval.token, offline: { createdAt: new Date().toISOString() }, offlineOverrides: [{ approverId: managerId, permission: "CHANGE_PRICE" }] }).expect(403);
    expect(await counts()).toEqual(before);
  });
  it("rolls approval use and audit back with a failed sale", async () => {
    const p = payload({ lineItems: [{ productId: freeId, quantity: 100 }] }), approval = (await grant(p).expect(200)).body;
    const before = await counts();
    await sell({ ...p, zeroPriceApproval: approval.token }).expect(400);
    expect(await counts()).toEqual(before);
    const grantRow = await db.managerOverride.findUniqueOrThrow({ where: { tokenHash: hashToken(approval.token) } }); expect(grantRow.usedAt).toBeNull();
    expect(await db.auditLog.count({ where: { action: "MANAGER_OVERRIDE_USED", entityId: grantRow.id } })).toBe(0);
  });
  it("preserves weighted stock cost and posts a costed gift once, with no revenue", async () => {
    const gift = (await http().post("/products").set(auth()).send({ name: "Costed gift", sku: "COSTED-GIFT", costPrice: 2, sellPrice: 0, isFree: true, exemptionCode: "M10" }).expect(201)).body;
    await http().put(`/stores/${storeId}/inventory/${gift.id}`).set(auth()).send({ quantity: 2 }).expect(200);
    const p = payload({ lineItems: [{ productId: gift.id, quantity: 1, unitPrice: 0 }] }), approval = (await grant(p).expect(200)).body;
    const sale = (await sell({ ...p, zeroPriceApproval: approval.token }).expect(201)).body;
    expect(sale.lineItems[0].unitCost).toBe("2"); expect(sale.total).toBe("0");
    await http().patch("/accounting/settings").set(auth()).send({ enabled: true, autoPost: false }).expect(200);
    const user = await db.user.findFirstOrThrow({ where: { businessId, role: "OWNER" } });
    await app.get(IntegrationService).run(businessId, user.id); await app.get(IntegrationService).run(businessId, user.id);
    const document = await db.fiscalDocument.findFirstOrThrow({ where: { saleId: sale.id } });
    const links = await db.accountingSourceLink.findMany({ where: { businessId, sourceType: "FISCAL_DOCUMENT", sourceId: document.id } });
    expect(links).toHaveLength(1); expect(links[0].skipped).toBe(false);
    const entry = await db.journalEntry.findUniqueOrThrow({ where: { id: links[0].entryId! }, include: { lines: { include: { account: true } } } });
    expect(entry.lines.map((l) => [l.account.code, l.debit.toString(), l.credit.toString()]).sort()).toEqual([["26.1", "0", "2"], ["71.2", "2", "0"]]);
  });
});
