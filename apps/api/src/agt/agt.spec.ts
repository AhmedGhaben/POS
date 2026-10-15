import { generateKeyPairSync } from "crypto";
import { Prisma } from "@prisma/client";
import { JwsSigner, verifyJws } from "./jws";
import { buildAgtDocument, documentSignaturePayload, type AgtDocumentInput } from "./payload";
import { pollDelay, readStatus, retryDelay } from "./queue-rules";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const fr = (over: Partial<AgtDocumentInput> = {}): AgtDocumentInput => ({
  documentNo: "FR POS001-2026/57",
  documentType: "FR",
  documentDate: "2026-10-16",
  systemEntryDate: new Date("2026-10-16T09:30:12.345Z"),
  issuerTaxId: "5417000123",
  eacCode: "47110",
  buyerName: "Consumidor Final",
  buyerTaxId: "999999999",
  buyerCountry: "AO",
  reason: null,
  netTotal: D("17.54"),
  taxPayable: D("2.46"),
  grossTotal: D(20),
  lines: [
    {
      lineNumber: 1,
      productCode: "OLEO-1L",
      productDescription: "Óleo de palma 1L",
      productType: "P",
      quantity: D(2),
      unit: "un",
      unitPrice: D("8.77"),
      netAmount: D("17.54"),
      discountAmount: D(0),
      referenceDocumentNo: null,
      taxes: [{ taxType: "IVA", taxCountryRegion: "AO", taxCode: "NOR", percentage: D(14), amount: D("2.46"), exemptionCode: null }],
    },
  ],
  ...over,
});

describe("AGT e-invoicing", () => {
  describe("JWS (RS256, compact, Base64URL)", () => {
    const signer = new JwsSigner(pem);

    it("signs the whole object, header RS256/JWT, no padding; verifies with the public key", () => {
      const token = signer.sign({ productId: "POS", productVersion: "0.2.4", softwareValidationNumber: "0" });
      const [header, , signature] = token.split(".");
      expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
      expect(token).not.toMatch(/[=+/]/);
      expect(signature.length).toBeGreaterThan(300);
      expect(verifyJws(token, signer.publicKey)).toEqual({ productId: "POS", productVersion: "0.2.4", softwareValidationNumber: "0" });
      // Another payload under the same signature doesn't verify.
      const [h, , s] = token.split(".");
      const forged = Buffer.from(JSON.stringify({ productId: "OTHER", productVersion: "0.2.4", softwareValidationNumber: "0" })).toString("base64url");
      expect(verifyJws(`${h}.${forged}.${s}`, signer.publicKey)).toBeNull();
    });

    it("refuses keys under 2048 bits", () => {
      const small = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      expect(() => new JwsSigner(small)).toThrow(/2048/);
    });
  });

  describe("registarFactura document", () => {
    const signed: object[] = [];
    const sign = (p: object) => {
      signed.push(p);
      return "jws";
    };

    it("a Factura-Recibo: lines with credit amounts and taxes, totals, the signed subset", () => {
      const doc = buildAgtDocument(fr(), sign);
      expect(doc).toMatchObject({
        documentNo: "FR POS001-2026/57",
        documentStatus: "N",
        documentType: "FR",
        documentDate: "2026-10-16",
        eacCode: "47110",
        systemEntryDate: "2026-10-16T09:30:12Z",
        customerTaxID: "999999999",
        customerCountry: "AO",
        documentTotals: { taxPayable: 2.46, netTotal: 17.54, grossTotal: 20 },
      });
      expect((doc as { lines: unknown[] }).lines[0]).toEqual({
        lineNumber: 1,
        operationType: "TB",
        productCode: "OLEO-1L",
        productDescription: "Óleo de palma 1L",
        quantity: 2,
        unitOfMeasure: "un",
        unitPriceBase: 8.77,
        unitPrice: 8.77,
        creditAmount: 17.54,
        taxes: [{ taxType: "IVA", taxCountryRegion: "AO", taxCode: "NOR", taxPercentage: 14, taxContribution: 2.46 }],
        settlementAmount: 0,
      });
      expect(signed.at(-1)).toEqual(documentSignaturePayload(fr()));
      expect(Object.keys(signed.at(-1)!)).toEqual(["documentNo", "taxRegistrationNumber", "documentType", "documentDate", "customerTaxID", "customerCountry", "companyName", "documentTotals"]);
    });

    it("a credit note: debit amounts and the invoice it corrects", () => {
      const doc = buildAgtDocument(
        fr({ documentNo: "NC POS001-2026/3", documentType: "NC", reason: "Devolução", lines: [{ ...fr().lines[0], referenceDocumentNo: "FR POS001-2026/57" }] }),
        sign,
      ) as { lines: Record<string, unknown>[] };
      expect(doc.lines[0]).toMatchObject({ debitAmount: 17.54, referenceInfo: { reference: "FR POS001-2026/57", reason: "Devolução" } });
      expect(doc.lines[0].creditAmount).toBeUndefined();
    });

    it("a receipt: no lines, what it settled without tax; a correction says C and which document it replaces", () => {
      const rc = buildAgtDocument(
        fr({
          documentNo: "RC WEB1-2026/2",
          documentType: "RC",
          grossTotal: D(100),
          lines: [],
          settled: [{ documentNo: "FT WEB1-2026/1", documentDate: "2026-10-10", amount: D(100), netTotal: D("87.71"), grossTotal: D(100) }],
          correctionOf: "RC WEB1-2026/1",
        }),
        sign,
      ) as Record<string, unknown>;
      expect(rc.lines).toBeUndefined();
      expect(rc).toMatchObject({
        documentStatus: "C",
        rejectedDocumentNo: "RC WEB1-2026/1",
        paymentReceipt: { sourceDocuments: [{ lineNo: 1, sourceDocumentID: { OriginatingON: "FT WEB1-2026/1", documentDate: "2026-10-10" }, creditAmount: 87.71 }] },
        documentTotals: { taxPayable: 12.29, netTotal: 87.71, grossTotal: 100 },
      });
    });
  });

  describe("the queue's timing and reading of obterEstado", () => {
    it("retries 30 s, 1 min, 2 min... at most an hour; polls 30 s, 60 s... at most 10 min", () => {
      expect([1, 2, 3, 20].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 3_600_000]);
      expect([0, 1, 2, 50].map(pollDelay)).toEqual([30_000, 30_000, 60_000, 600_000]);
    });

    it("8 and 7 wait, 9 resends, 0-2 give each document's outcome", () => {
      expect(readStatus({ resultCode: 8 })).toEqual({ kind: "wait" });
      expect(readStatus({ resultCode: "7" })).toEqual({ kind: "wait" });
      expect(readStatus({ resultCode: 9 })).toEqual({ kind: "resend" });
      expect(
        readStatus({
          resultCode: 1,
          documentStatusList: [
            { documentNo: "FR A/1", documentStatus: "V" },
            { documentNo: "FR A/2", documentStatus: "I", errorList: [{ errorCode: "E22", errorDescription: "taxPayable" }] },
          ],
        }),
      ).toEqual({
        kind: "done",
        documents: [
          { documentNo: "FR A/1", valid: true, errors: [] },
          { documentNo: "FR A/2", valid: false, errors: [{ code: "E22", description: "taxPayable" }] },
        ],
      });
    });
  });
});
