import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { buildXlsx, zip } from "../src/common/xlsx";
import { deleteBusiness } from "./cleanup";

describe("Prompt 1c parser and archive compatibility (isolated e2e)", () => {
  let app: INestApplication, prisma: PrismaService, token: string, businessId: string, storeId: string, accountId: string;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const parse = (fileName: string, data: Buffer) => http().post("/accounting/bank/parse").set(auth()).send({ fileName, dataUrl: `data:application/octet-stream;base64,${data.toString("base64")}` });
  const imported = (rows: string[][]) => http().post("/accounting/bank/statements").set(auth()).send({ accountId, fileName: "verification", rows, mapping: { date: 0, description: 1, amount: 2, skipRows: 1 } });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/test/.test(url.pathname)) throw new Error("Isolated local test database required");
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter()); await app.init(); prisma = app.get(PrismaService);
    const session = (await http().post("/auth/register").send({ businessName: "Parser verification", storeName: "Test store", firstName: "Test", lastName: "Owner", email: `parser-${randomUUID()}@e2e.test`, password: "ParserVerify123!" }).expect(201)).body;
    token = session.accessToken; businessId = session.user.businessId; storeId = session.stores[0].id;
    await http().patch("/accounting/settings").set(auth()).send({ enabled: true, autoPost: false }).expect(200);
    accountId = (await prisma.ledgerAccount.findUniqueOrThrow({ where: { businessId_code: { businessId, code: "43.1.1" } } })).id;
  }, 30_000);
  afterAll(async () => { try { if (businessId) await deleteBusiness(prisma, businessId); } finally { await app?.close(); } });
  it.each(["csv", "xlsx"])("parses/maps/imports %s with valid rows and explicitly skipped malformed values", async (format) => {
    const csv = 'Date;Description;Amount\n2026-10-17;"Deposit, counter";1.234,56\n31/02/2026;Bad date;2,00\n2026-10-18;Bad amount;abc\n2026-10-18;Fee;-25,00';
    const xlsx = buildXlsx([{ name: "Statement", header: ["Date", "Description", "Amount"], rows: [[{ date: "2026-10-17" }, "Deposit, counter", 1234.56], ["31/02/2026", "Bad date", 2], ["2026-10-18", "Bad amount", "abc"], [{ date: "2026-10-18" }, "Fee", -25]] }]);
    const parsed = (await parse(`statement.${format}`, format === "csv" ? Buffer.from(csv) : xlsx).expect(200)).body;
    const result = (await imported(parsed.rows).expect(201)).body;
    expect(result).toMatchObject({ lines: 2, skippedRows: [3, 4] });
    const lines = await prisma.bankStatementLine.findMany({ where: { statementId: result.id }, orderBy: { date: "asc" } });
    expect(lines.map((l) => [l.date.toISOString().slice(0, 10), l.amount.toString()])).toEqual([["2026-10-17", "1234.56"], ["2026-10-18", "-25"]]);
  });
  it("rejects corrupt, truncated, sheetless and excessively expanded XLSX files without storing statements", async () => {
    const before = await prisma.bankStatement.count({ where: { businessId } });
    const expanded = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(20 * 1024 * 1024 + 1, 32) }]);
    for (const bytes of [Buffer.from("not xlsx"), Buffer.from("PK"), zip([{ name: "unrelated.xml", data: Buffer.from("x") }]), expanded]) await parse("bad.xlsx", bytes).expect(400);
    expect(await prisma.bankStatement.count({ where: { businessId } })).toBe(before);
  });
  it("keeps bank CSV's permissive preview but refuses importing malformed/empty movement rows", async () => {
    const before = await prisma.bankStatement.count({ where: { businessId } });
    const parsed = (await parse("bad.csv", Buffer.from('Date,Description,Amount\n2026-10-17,"unfinished,10')).expect(200)).body;
    await imported(parsed.rows).expect(400);
    await imported([["Date", "Description", "Amount"], ["bad", "bad", "abc"]]).expect(400);
    expect(await prisma.bankStatement.count({ where: { businessId } })).toBe(before);
  });
  it("older archive clients fail safely for zero and stocked products; current snapshot requests succeed", async () => {
    for (const quantity of [0, 7]) {
      const product = (await http().post("/products").set(auth()).send({ name: "Compatibility", sku: `COMP-${quantity}`, costPrice: 1, sellPrice: 2, exemptionCode: "M10" }).expect(201)).body;
      await http().put(`/stores/${storeId}/inventory/${product.id}`).set(auth()).send({ quantity }).expect(200);
      const movements = await prisma.stockMovement.count({ where: { productId: product.id } });
      const audits = await prisma.auditLog.count({ where: { businessId } });
      const rejected = await http().patch(`/products/${product.id}`).set(auth()).send({ isActive: false }).expect(409);
      expect(rejected.body.message).toBe("Stock must be reloaded and reviewed before archiving");
      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).isActive).toBe(true);
      expect(await prisma.stockMovement.count({ where: { productId: product.id } })).toBe(movements);
      expect(await prisma.auditLog.count({ where: { businessId } })).toBe(audits);
      const snapshot = (await http().get(`/products/${product.id}/stock`).set(auth()).expect(200)).body as { storeId: string; quantity: string }[];
      await http().patch(`/products/${product.id}`).set(auth()).send({ isActive: false, archiveStock: snapshot.map(({ storeId, quantity }) => ({ storeId, quantity })) }).expect(200);
    }
  });
});
