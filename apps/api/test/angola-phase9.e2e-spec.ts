import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { generateKeyPairSync, createPublicKey } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AgtQueueService } from "../src/agt/agt-queue.service";
import { verifyJws } from "../src/agt/jws";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { deleteBusiness } from "./cleanup";
import { ensureShift } from "./shift-helper";

/**
 * docs/plans/ANGOLA.md, phase 9: with e-invoicing on, every FR/FT/NC/RC is
 * queued for AGT, sent (registarFactura, up to 30 per request, Basic auth,
 * RS256 signatures) and asked about (obterEstado) until valid or rejected;
 * "too many requests" backs off; a rejected document is corrected by a new
 * one sent with documentStatus C. Against a fake AGT on localhost.
 */
describe("Angola phase 9: AGT e-invoicing queue (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: AgtQueueService;
  let fake: Server;
  const RUN = Date.now();
  const PASSWORD = "Phase9Pass123!";
  const saved = { ...process.env };
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = createPublicKey(privateKey);
  let businessId: string | undefined;
  let ownerToken: string;
  let storeId: string;
  let shiftClientId: string;
  let productId: string;

  // The fake AGT: what it was sent, and what it answers next.
  const calls: { service: string; auth: string | undefined; body: Record<string, unknown> }[] = [];
  const replies: Record<string, { status: number; body: object }[]> = { registarFactura: [], obterEstado: [] };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sell = async () =>
    (
      await http()
        .post("/sales")
        .set(auth(ownerToken))
        .send({ storeId, shiftClientId, clientId: randomUUID(), lineItems: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 10 }] })
        .expect(201)
    ).body.fiscalDocuments[0] as { id: string; documentNo: string };
  const submissions = () => prisma.agtSubmission.findMany({ where: { businessId }, include: { document: { select: { documentNo: true } } }, orderBy: { createdAt: "asc" } });
  const at = (minutes: number) => new Date(Date.now() + minutes * 60_000);

  beforeAll(async () => {
    fake = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        const service = (req.url ?? "").split("/").pop()!;
        calls.push({ service, auth: req.headers.authorization, body: JSON.parse(data) });
        const reply = replies[service]?.shift() ?? { status: 500, body: { error: "unexpected" } };
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
    Object.assign(process.env, {
      AGT_EINVOICE_ENABLED: "1",
      AGT_EINVOICE_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}/sigt/fe/v1`,
      AGT_EINVOICE_USER: "pos-producer",
      AGT_EINVOICE_PASSWORD: "s3nh@",
      AGT_SOFTWARE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      AGT_QUEUE_INTERVAL_MS: "0",
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    queue = app.get(AgtQueueService);

    const reg = await http()
      .post("/auth/register")
      .send({ businessName: "E2E AGT Lda", storeName: "Loja Lobito", firstName: "Kiala", lastName: "Owner", email: `p9-owner-${RUN}@e2e.test`, password: PASSWORD })
      .expect(201);
    businessId = reg.body.user.businessId;
    ownerToken = reg.body.accessToken;
    storeId = reg.body.stores[0].id;
    productId = (await http().post("/products").set(auth(ownerToken)).send({ sku: `P9-${RUN}`, name: "Pão", costPrice: 5, sellPrice: 10, trackStock: false }).expect(201)).body.id;
    shiftClientId = await ensureShift(app, ownerToken, storeId);
  }, 60_000);

  afterAll(async () => {
    process.env = saved;
    try {
      if (businessId) await deleteBusiness(prisma, businessId);
    } finally {
      await app.close();
      await new Promise((resolve) => fake.close(resolve));
    }
  });

  it("documents aren't queued until the business has e-invoicing on; proformas never are", async () => {
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ legalName: "E2E AGT, Lda", taxId: "5417000555" }).expect(200);
    await sell();
    expect(await submissions()).toHaveLength(0);
    await http().patch("/businesses/me").set(auth(ownerToken)).send({ eInvoicingActive: true }).expect(200);
    await http().post("/fiscal-documents/proformas").set(auth(ownerToken)).send({ storeId, lineItems: [{ productId, quantity: 1 }] }).expect(201);
    expect(await submissions()).toHaveLength(0);
  });

  describe("send, back off, ask, decide", () => {
    let first: { documentNo: string };
    let second: { documentNo: string };

    it("too many requests (429 E98): nothing sent, wait 5 minutes", async () => {
      first = await sell();
      second = await sell();
      replies.registarFactura.push({ status: 429, body: { errorList: [{ idError: "E98", descriptionError: "Demasiados pedidos" }] } });
      await queue.runOnce();
      const subs = await submissions();
      expect(subs.map((s) => s.status)).toEqual(["QUEUED", "QUEUED"]);
      expect(subs[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
      expect(subs[0].lastError).toMatch(/429/);
    });

    it("then one request with both documents, Basic auth, signatures AGT can check", async () => {
      replies.registarFactura.push({ status: 200, body: { requestID: "202600000000042", errorList: [] } });
      await queue.runOnce(at(6));
      const call = calls.filter((c) => c.service === "registarFactura").at(-1)!;
      expect(call.auth).toBe(`Basic ${Buffer.from("pos-producer:s3nh@").toString("base64")}`);
      expect(call.body).toMatchObject({ schemaVersion: "2.0", taxRegistrationNumber: "5417000555", numberOfEntries: 2 });
      const docs = call.body.documents as { documentNo: string; jwsDocumentSignature: string; documentType: string }[];
      expect(docs.map((d) => d.documentNo)).toEqual([first.documentNo, second.documentNo]);
      expect(verifyJws(docs[0].jwsDocumentSignature, publicKey)).toMatchObject({ documentNo: first.documentNo, taxRegistrationNumber: "5417000555", documentType: "FR", customerTaxID: "999999999" });
      const software = call.body.softwareInfo as { softwareInfoDetail: object; jwsSoftwareSignature: string };
      expect(verifyJws(software.jwsSoftwareSignature, publicKey)).toMatchObject({ softwareValidationNumber: "0" });
      expect((await submissions()).map((s) => [s.status, s.requestId])).toEqual([
        ["SENT", "202600000000042"],
        ["SENT", "202600000000042"],
      ]);
    });

    it("still processing (8): ask again later; then one valid, one rejected with AGT's errors", async () => {
      replies.obterEstado.push({ status: 200, body: { requestID: "202600000000042", resultCode: 8 } });
      await queue.runOnce(at(7));
      const poll = calls.filter((c) => c.service === "obterEstado").at(-1)!;
      expect(verifyJws(poll.body.jwsSignature as string, publicKey)).toEqual({ taxRegistrationNumber: "5417000555", requestID: "202600000000042" });
      expect((await submissions()).map((s) => s.status)).toEqual(["SENT", "SENT"]);

      replies.obterEstado.push({
        status: 200,
        body: {
          requestID: "202600000000042",
          resultCode: 1,
          documentStatusList: [
            { documentNo: first.documentNo, documentStatus: "V" },
            { documentNo: second.documentNo, documentStatus: "I", errorList: [{ errorCode: "E22", errorDescription: "taxPayable não corresponde" }] },
          ],
        },
      });
      await queue.runOnce(at(20));
      const subs = await submissions();
      expect(subs.map((s) => s.status)).toEqual(["VALID", "REJECTED"]);
      expect(subs[1].errors).toEqual([{ code: "E22", description: "taxPayable não corresponde" }]);

      const status = (await http().get("/agt/status").set(auth(ownerToken)).expect(200)).body;
      expect(status).toMatchObject({ enabled: true, businessActive: true, counts: { QUEUED: 0, SENT: 0, VALID: 1, REJECTED: 1 } });
      const rejected = (await http().get("/agt/submissions?status=REJECTED").set(auth(ownerToken)).expect(200)).body;
      expect(rejected.items.map((s: { document: { documentNo: string } }) => s.document.documentNo)).toEqual([second.documentNo]);
    });

    it("a rejected document is corrected by a new one, sent with documentStatus C", async () => {
      const rejected = (await submissions())[1];
      const fix = await sell();
      await http().post(`/agt/submissions/${rejected.id}/correct`).set(auth(ownerToken)).send({ documentId: fix.id }).expect(200);
      await http().post(`/agt/submissions/${rejected.id}/correct`).set(auth(ownerToken)).send({ documentId: fix.id }).expect(400);
      replies.registarFactura.push({ status: 200, body: { requestID: "202600000000043", errorList: [] } });
      await queue.runOnce(at(21));
      const doc = (calls.filter((c) => c.service === "registarFactura").at(-1)!.body.documents as Record<string, unknown>[])[0];
      expect(doc).toMatchObject({ documentNo: fix.documentNo, documentStatus: "C", rejectedDocumentNo: second.documentNo });
    });

    it("refused at format validation (400 with documentNo): that document is rejected", async () => {
      const bad = await sell();
      replies.registarFactura.push({ status: 400, body: { errorList: [{ idError: "E02", descriptionError: "Formato inválido", documentNo: bad.documentNo }] } });
      await queue.runOnce(at(22));
      const sub = (await submissions()).find((s) => s.document.documentNo === bad.documentNo)!;
      expect(sub).toMatchObject({ status: "REJECTED", errors: [{ code: "E02", description: "Formato inválido" }] });
    });
  });
});
